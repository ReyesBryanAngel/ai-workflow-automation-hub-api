import type { MessageParam } from '@anthropic-ai/sdk/resources/messages';

import { Prisma, type Invoice } from '../generated/prisma/client.js';
import {
  InvoiceStatus,
  WorkflowStatus,
  type InvoiceSourceType,
} from '../generated/prisma/enums.js';
import {
  ANTHROPIC_MAX_RETRIES,
  ANTHROPIC_MODEL,
  ANTHROPIC_REQUEST_TIMEOUT_MS,
  anthropic,
} from '../lib/anthropic.js';
import { isRetryableAnthropicError, toAppError } from '../lib/anthropicErrors.js';
import { parseInvoiceDocument } from '../lib/llamaparse.js';
import { logger } from '../lib/logger.js';
import { prisma } from '../lib/prisma.js';
import { readFile, saveFile } from '../lib/storage.js';
import {
  buildInvoiceExtractionDocumentUserContent,
  buildInvoiceExtractionTextUserPrompt,
  getInvoiceExtractionSystemPrompt,
  invoiceExtractionOutputFormat,
  isClaudeFallbackSupportedMediaType,
} from '../prompts/invoiceExtraction.prompt.js';
import {
  isInvoiceExtractionIncomplete,
  type InvoiceExtraction,
} from '../schemas/invoice.schema.js';
import { AppError } from '../utils/AppError.js';
import { runInvoiceChecks } from './invoiceChecks.service.js';

const REQUEST_OPTIONS = {
  timeout: ANTHROPIC_REQUEST_TIMEOUT_MS,
  maxRetries: ANTHROPIC_MAX_RETRIES,
};

// Below this self-reported confidence, the LlamaParse-derived extraction is
// treated as unreliable and the Claude-PDF fallback runs instead — same
// trigger as an incomplete required field (see isInvoiceExtractionIncomplete).
const CONFIDENCE_THRESHOLD = 0.5;

const EXTRACTION_WORKFLOW = {
  LLAMAPARSE: 'invoice_extract_llamaparse',
  CLAUDE_PDF_FALLBACK: 'invoice_extract_claude_pdf_fallback',
} as const;

// Entry point for every intake channel (manual upload, n8n Gmail branch,
// n8n Drive branch — Phase 9.2). The file is persisted to storage before the
// Invoice row is created, per the "Done when" requirement that a stored file
// always exists before a PENDING row references it — never the reverse.
export async function createInvoiceFromUpload(params: {
  buffer: Buffer;
  originalName: string;
  mimeType: string;
  sourceType: InvoiceSourceType;
}): Promise<Invoice> {
  const { storageKey, documentUrl } = await saveFile({
    buffer: params.buffer,
    originalName: params.originalName,
    mimeType: params.mimeType,
  });

  const invoice = await prisma.invoice.create({
    data: {
      storageKey,
      documentUrl,
      sourceType: params.sourceType,
      status: InvoiceStatus.PENDING,
    },
  });

  // Post-upload hook (Phase 9.3/9.4): extraction, then the duplicate/vendor/
  // PO/risk checks pipeline, both run automatically right after the file
  // lands, so intake never depends on a human or an n8n workflow (not built
  // yet for invoices — see Phase 9.7) to kick it off. Failures at either
  // step are already logged to workflow_logs inside extractInvoice() and
  // runInvoiceChecks(); a failure here must not fail the upload response,
  // since the file is safely stored and the row exists — it just stays at
  // whatever status the last successful step left it in, ready for a future
  // manual/n8n retry.
  try {
    const extracted = await extractInvoice(invoice.id);
    return await runInvoiceChecks(extracted.id);
  } catch (error) {
    logger.warn(
      { err: error, invoiceId: invoice.id },
      'Invoice extraction/checks failed after upload; invoice remains at its last successful status',
    );
    return prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } });
  }
}

const EXTENSION_MIME_TYPES: Record<string, string> = {
  pdf: 'application/pdf',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  tiff: 'image/tiff',
  tif: 'image/tiff',
  heic: 'image/heic',
};

// The Invoice row doesn't persist the original mimetype, only storageKey —
// storage.ts always keys stored files as `invoices/{uuid}.{ext}` using the
// original upload's extension specifically so it can be recovered later for
// exactly this kind of use (LlamaParse's fileName hint, Claude fallback's
// media_type). Throws if the key has no recognizable extension.
function inferMimeType(storageKey: string): string {
  const ext = storageKey.includes('.') ? storageKey.split('.').pop()?.toLowerCase() : undefined;
  const mimeType = ext ? EXTENSION_MIME_TYPES[ext] : undefined;
  if (!mimeType) {
    throw new Error(`Cannot determine file type for extraction from storage key: ${storageKey}`);
  }
  return mimeType;
}

export async function logWorkflowEvent(params: {
  workflow: string;
  status: WorkflowStatus;
  executionTime?: number;
  error?: unknown;
}): Promise<void> {
  try {
    await prisma.workflowLog.create({
      data: {
        workflow: params.workflow,
        status: params.status,
        executionTime: params.executionTime,
        error:
          params.error !== undefined
            ? params.error instanceof Error
              ? params.error.message
              : String(params.error)
            : undefined,
        retryCount:
          params.error !== undefined && isRetryableAnthropicError(params.error)
            ? ANTHROPIC_MAX_RETRIES
            : 0,
      },
    });
  } catch (logError) {
    // A logging failure must never mask the original extraction result.
    logger.error(
      { err: logError, workflow: params.workflow },
      'Failed to write workflow_logs entry',
    );
  }
}

async function runInvoiceExtraction(
  userContent: MessageParam['content'],
): Promise<InvoiceExtraction> {
  const response = await anthropic.messages.parse(
    {
      model: ANTHROPIC_MODEL,
      max_tokens: 1024,
      system: await getInvoiceExtractionSystemPrompt(),
      messages: [{ role: 'user', content: userContent }],
      output_config: { format: invoiceExtractionOutputFormat },
    },
    REQUEST_OPTIONS,
  );

  if (!response.parsed_output) {
    throw new Error('Claude returned an empty or unparseable invoice extraction');
  }

  return response.parsed_output;
}

function toInvoiceUpdateData(extraction: InvoiceExtraction): Prisma.InvoiceUpdateInput {
  return {
    invoiceNumber: extraction.invoiceNumber,
    vendor: extraction.vendor,
    poNumber: extraction.poNumber,
    invoiceDate: extraction.invoiceDate ? new Date(extraction.invoiceDate) : null,
    dueDate: extraction.dueDate ? new Date(extraction.dueDate) : null,
    subtotal: extraction.subtotal !== null ? new Prisma.Decimal(extraction.subtotal) : null,
    tax: extraction.tax !== null ? new Prisma.Decimal(extraction.tax) : null,
    total: extraction.total !== null ? new Prisma.Decimal(extraction.total) : null,
    ...(extraction.currency ? { currency: extraction.currency } : {}),
  };
}

interface ExtractionResult {
  extraction: InvoiceExtraction;
  workflow: (typeof EXTRACTION_WORKFLOW)[keyof typeof EXTRACTION_WORKFLOW];
}

// Primary path. Returns undefined (never throws) whenever LlamaParse or the
// subsequent Claude call fails, or the result is incomplete/low-confidence —
// any of those cases means the caller should fall back to the direct-PDF
// path instead of failing extraction outright.
async function tryLlamaparseExtraction(params: {
  invoiceId: number;
  buffer: Buffer;
  storageKey: string;
  mimeType: string;
  executionTimeStartedAt: number;
}): Promise<ExtractionResult | undefined> {
  try {
    const documentText = await parseInvoiceDocument({
      buffer: params.buffer,
      fileName: params.storageKey,
      mimeType: params.mimeType,
    });
    const extraction = await runInvoiceExtraction(
      buildInvoiceExtractionTextUserPrompt(documentText),
    );

    if (
      extraction.confidence >= CONFIDENCE_THRESHOLD &&
      !isInvoiceExtractionIncomplete(extraction)
    ) {
      return { extraction, workflow: EXTRACTION_WORKFLOW.LLAMAPARSE };
    }

    logger.warn(
      { invoiceId: params.invoiceId, confidence: extraction.confidence },
      'LlamaParse extraction incomplete or low-confidence, falling back to Claude PDF extraction',
    );
    // Logged as a failure of the llamaparse path specifically (distinct from
    // an unhandled exception below) so the two are equally visible when
    // comparing how often each extraction path actually delivers a usable
    // result — the whole point of tracking this per-path in workflow_logs.
    await logWorkflowEvent({
      workflow: EXTRACTION_WORKFLOW.LLAMAPARSE,
      status: WorkflowStatus.FAILED,
      executionTime: Date.now() - params.executionTimeStartedAt,
      error: `Incomplete or low-confidence extraction (confidence=${extraction.confidence})`,
    });
    return undefined;
  } catch (error) {
    logger.warn(
      { err: error, invoiceId: params.invoiceId },
      'LlamaParse extraction failed, falling back to Claude PDF extraction',
    );
    await logWorkflowEvent({
      workflow: EXTRACTION_WORKFLOW.LLAMAPARSE,
      status: WorkflowStatus.FAILED,
      executionTime: Date.now() - params.executionTimeStartedAt,
      error,
    });
    return undefined;
  }
}

// Fallback path: the original file sent straight to Claude. Logs and throws
// on any failure — there is nothing left to fall back to after this.
async function runClaudeFallbackExtraction(params: {
  buffer: Buffer;
  mimeType: string;
  executionTimeStartedAt: number;
}): Promise<ExtractionResult> {
  if (!isClaudeFallbackSupportedMediaType(params.mimeType)) {
    const error = new AppError(
      `Invoice extraction failed: LlamaParse was unavailable/unreliable and file type ${params.mimeType} has no direct Claude fallback`,
      502,
    );
    await logWorkflowEvent({
      workflow: EXTRACTION_WORKFLOW.CLAUDE_PDF_FALLBACK,
      status: WorkflowStatus.FAILED,
      executionTime: Date.now() - params.executionTimeStartedAt,
      error,
    });
    throw error;
  }

  try {
    const extraction = await runInvoiceExtraction(
      buildInvoiceExtractionDocumentUserContent(params.buffer.toString('base64'), params.mimeType),
    );
    return { extraction, workflow: EXTRACTION_WORKFLOW.CLAUDE_PDF_FALLBACK };
  } catch (error) {
    await logWorkflowEvent({
      workflow: EXTRACTION_WORKFLOW.CLAUDE_PDF_FALLBACK,
      status: WorkflowStatus.FAILED,
      executionTime: Date.now() - params.executionTimeStartedAt,
      error,
    });
    throw toAppError(error);
  }
}

// Runs the OCR/field-extraction pipeline for a stored invoice: LlamaParse
// text extraction feeding Claude (primary path) with an automatic fallback
// to sending the original file straight to Claude as a document/image block
// when LlamaParse fails, returns incomplete required fields, or reports low
// confidence (TASKS.md 9.3). Whichever path produces a usable result wins;
// the Invoice row is updated with the extracted fields and stays otherwise
// untouched (duplicate/vendor/PO matching and status transitions are
// Phase 9.4, not this function's job).
export async function extractInvoice(invoiceId: number): Promise<Invoice> {
  const executionTimeStartedAt = Date.now();

  let invoice: Invoice;
  let buffer: Buffer;
  let mimeType: string;
  try {
    invoice = await prisma.invoice.findUniqueOrThrow({ where: { id: invoiceId } });
    buffer = await readFile(invoice.storageKey);
    mimeType = inferMimeType(invoice.storageKey);
  } catch (error) {
    await logWorkflowEvent({
      workflow: 'invoice_extract_setup',
      status: WorkflowStatus.FAILED,
      executionTime: Date.now() - executionTimeStartedAt,
      error,
    });
    throw error instanceof AppError
      ? error
      : new AppError(
          'Invoice extraction failed while loading the stored document',
          502,
          error instanceof Error ? error.message : String(error),
        );
  }

  const result =
    (await tryLlamaparseExtraction({
      invoiceId,
      buffer,
      storageKey: invoice.storageKey,
      mimeType,
      executionTimeStartedAt,
    })) ?? (await runClaudeFallbackExtraction({ buffer, mimeType, executionTimeStartedAt }));

  const updated = await prisma.invoice.update({
    where: { id: invoiceId },
    data: toInvoiceUpdateData(result.extraction),
  });

  await logWorkflowEvent({
    workflow: result.workflow,
    status: WorkflowStatus.SUCCESS,
    executionTime: Date.now() - executionTimeStartedAt,
  });

  return updated;
}

export async function listInvoices(status?: InvoiceStatus): Promise<Invoice[]> {
  return prisma.invoice.findMany({
    where: status ? { status } : undefined,
    orderBy: { createdAt: 'desc' },
  });
}

// Approve/reject are only valid from the two pre-decision statuses: a clean
// invoice sitting at PENDING (no exceptions fired) or one flagged
// NEEDS_REVIEW. Anything else (DUPLICATE, already APPROVED/REJECTED,
// EXPORTED, PAID, ARCHIVED) is a terminal or out-of-band state that approval
// must not silently overwrite.
const REVIEWABLE_STATUSES: InvoiceStatus[] = [InvoiceStatus.PENDING, InvoiceStatus.NEEDS_REVIEW];

async function getReviewableInvoice(invoiceId: number): Promise<Invoice> {
  const invoice = await prisma.invoice.findUnique({ where: { id: invoiceId } });
  if (!invoice) {
    throw new AppError('Invoice not found', 404);
  }
  if (!REVIEWABLE_STATUSES.includes(invoice.status)) {
    throw new AppError(
      `Invoice #${invoice.id} cannot be approved or rejected from status ${invoice.status}`,
      409,
    );
  }
  return invoice;
}

export async function approveInvoice(invoiceId: number, reviewerId: number): Promise<Invoice> {
  const invoice = await getReviewableInvoice(invoiceId);

  const updated = await prisma.invoice.update({
    where: { id: invoice.id },
    data: {
      status: InvoiceStatus.APPROVED,
      reviewedById: reviewerId,
      reviewedAt: new Date(),
      rejectionReason: null,
    },
  });

  await logWorkflowEvent({ workflow: 'invoice_approve', status: WorkflowStatus.SUCCESS });

  return updated;
}

export async function rejectInvoice(
  invoiceId: number,
  reviewerId: number,
  reason: string,
): Promise<Invoice> {
  const invoice = await getReviewableInvoice(invoiceId);

  const updated = await prisma.invoice.update({
    where: { id: invoice.id },
    data: {
      status: InvoiceStatus.REJECTED,
      reviewedById: reviewerId,
      reviewedAt: new Date(),
      rejectionReason: reason,
    },
  });

  await logWorkflowEvent({
    workflow: 'invoice_reject',
    status: WorkflowStatus.SUCCESS,
    error: reason,
  });

  return updated;
}

async function getInvoiceOrThrow(invoiceId: number): Promise<Invoice> {
  const invoice = await prisma.invoice.findUnique({ where: { id: invoiceId } });
  if (!invoice) {
    throw new AppError('Invoice not found', 404);
  }
  return invoice;
}

// Mock accounting-system export (TASKS.md 9.6) — persists the status
// transition directly instead of calling a real third-party API, same "mock
// integration" pattern as the CRM record endpoint (crm.routes.ts:34-42). Only
// an APPROVED invoice can be exported; unlike approve/reject, every failure
// path here (invalid state, DB error) is logged to workflow_logs per 9.6's
// explicit "error branches ... logged like every other stage" requirement.
export async function exportInvoice(invoiceId: number): Promise<Invoice> {
  try {
    const invoice = await getInvoiceOrThrow(invoiceId);
    if (invoice.status !== InvoiceStatus.APPROVED) {
      throw new AppError(
        `Invoice #${invoice.id} cannot be exported from status ${invoice.status}`,
        409,
      );
    }

    const updated = await prisma.invoice.update({
      where: { id: invoice.id },
      data: { status: InvoiceStatus.EXPORTED },
    });

    await logWorkflowEvent({ workflow: 'invoice_export', status: WorkflowStatus.SUCCESS });

    return updated;
  } catch (error) {
    await logWorkflowEvent({ workflow: 'invoice_export', status: WorkflowStatus.FAILED, error });
    throw error;
  }
}

// Called by the n8n cron-triggered workflow (TASKS.md 9.6) once per EXPORTED
// invoice whose dueDate is approaching — n8n owns the schedule/query, this
// endpoint just performs the mocked payment-and-archive transition for one
// invoice. Only an EXPORTED invoice is eligible. PAID is persisted before
// ARCHIVED (two writes, not one) so both statuses are genuinely observable
// via GET /api/invoices rather than only ever seeing the terminal state.
export async function schedulePaymentForInvoice(invoiceId: number): Promise<Invoice> {
  try {
    const invoice = await getInvoiceOrThrow(invoiceId);
    if (invoice.status !== InvoiceStatus.EXPORTED) {
      throw new AppError(
        `Invoice #${invoice.id} cannot be scheduled for payment from status ${invoice.status}`,
        409,
      );
    }

    await prisma.invoice.update({
      where: { id: invoice.id },
      data: { status: InvoiceStatus.PAID },
    });
    const archived = await prisma.invoice.update({
      where: { id: invoice.id },
      data: { status: InvoiceStatus.ARCHIVED },
    });

    await logWorkflowEvent({
      workflow: 'invoice_schedule_payment',
      status: WorkflowStatus.SUCCESS,
    });

    return archived;
  } catch (error) {
    await logWorkflowEvent({
      workflow: 'invoice_schedule_payment',
      status: WorkflowStatus.FAILED,
      error,
    });
    throw error;
  }
}
