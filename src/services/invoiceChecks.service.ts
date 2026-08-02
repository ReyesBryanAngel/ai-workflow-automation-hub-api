import { env } from '../config/env.js';
import {
  Prisma,
  type Invoice,
  type PurchaseOrder,
  type Vendor,
} from '../generated/prisma/client.js';
import { InvoiceStatus, WorkflowStatus } from '../generated/prisma/enums.js';
import { logger } from '../lib/logger.js';
import { prisma } from '../lib/prisma.js';
import { sendSlackNotification } from '../lib/slack.js';
import { logWorkflowEvent } from './invoice.service.js';

// Below this Dice's-coefficient similarity, an extracted vendor name is not
// trusted as a match against an existing Vendor row — the invoice is flagged
// NEEDS_REVIEW instead of auto-linking, and a new Vendor is never created
// from unverified extraction (TASKS.md 9.4).
const VENDOR_MATCH_CONFIDENCE_THRESHOLD = 0.82;

const CHECK_WORKFLOW = {
  DUPLICATE: 'invoice_check_duplicate',
  VENDOR_MATCH: 'invoice_check_vendor_match',
  PO_MATCH: 'invoice_check_po_match',
  RISK: 'invoice_check_risk',
} as const;

function normalize(value: string): string {
  return value.toLowerCase().trim().replace(/\s+/g, ' ');
}

function bigrams(value: string): Set<string> {
  const normalized = normalize(value);
  if (normalized.length < 2) return new Set(normalized ? [normalized] : []);
  const grams = new Set<string>();
  for (let i = 0; i < normalized.length - 1; i++) {
    grams.add(normalized.slice(i, i + 2));
  }
  return grams;
}

// Dice's coefficient over character bigrams: a dependency-free fuzzy string
// similarity that tolerates minor OCR/extraction noise (typos, punctuation,
// "Inc." vs "Inc" vs "Incorporated") without needing an external library or
// a Postgres extension (pg_trgm) not already in use elsewhere in this repo.
function similarity(a: string, b: string): number {
  const setA = bigrams(a);
  const setB = bigrams(b);
  if (setA.size === 0 || setB.size === 0) return normalize(a) === normalize(b) ? 1 : 0;

  let intersection = 0;
  for (const gram of setA) {
    if (setB.has(gram)) intersection++;
  }
  return (2 * intersection) / (setA.size + setB.size);
}

interface VendorMatch {
  vendor: Vendor;
  score: number;
}

// Fuzzy-matches the extracted vendor name against known vendors. Returns the
// best match only if it clears the confidence threshold; otherwise undefined
// so the caller flags the invoice for review rather than guessing.
export async function matchVendor(vendorName: string): Promise<VendorMatch | undefined> {
  const vendors = await prisma.vendor.findMany();

  let best: VendorMatch | undefined;
  for (const vendor of vendors) {
    const score = similarity(vendorName, vendor.name);
    if (!best || score > best.score) {
      best = { vendor, score };
    }
  }

  return best && best.score >= VENDOR_MATCH_CONFIDENCE_THRESHOLD ? best : undefined;
}

// Exact lookup — PO numbers are identifiers, not free text, so unlike vendor
// names they are matched exactly rather than fuzzily.
export async function matchPurchaseOrder(poNumber: string): Promise<PurchaseOrder | null> {
  return prisma.purchaseOrder.findUnique({ where: { poNumber } });
}

// Looks up another invoice already carrying the same (vendor, invoiceNumber)
// pair, case-insensitively. Excludes the invoice being checked so re-running
// checks on the same row is idempotent.
export async function findDuplicateInvoice(params: {
  invoiceId: number;
  vendor: string;
  invoiceNumber: string;
}): Promise<Invoice | null> {
  return prisma.invoice.findFirst({
    where: {
      id: { not: params.invoiceId },
      vendor: { equals: params.vendor, mode: 'insensitive' },
      invoiceNumber: { equals: params.invoiceNumber, mode: 'insensitive' },
    },
  });
}

async function runDuplicateCheck(invoice: Invoice): Promise<Invoice | null> {
  const startedAt = Date.now();
  // vendor/invoiceNumber non-null is enforced by the caller (runInvoiceChecks)
  // before this is invoked.
  const duplicate = await findDuplicateInvoice({
    invoiceId: invoice.id,
    vendor: invoice.vendor!,
    invoiceNumber: invoice.invoiceNumber!,
  });

  await logWorkflowEvent({
    workflow: CHECK_WORKFLOW.DUPLICATE,
    status: duplicate ? WorkflowStatus.FAILED : WorkflowStatus.SUCCESS,
    executionTime: Date.now() - startedAt,
    error: duplicate ? `Duplicate of invoice #${duplicate.id}` : undefined,
  });

  return duplicate;
}

async function runVendorMatchCheck(invoice: Invoice): Promise<VendorMatch | undefined> {
  const startedAt = Date.now();
  const match = await matchVendor(invoice.vendor!);

  await logWorkflowEvent({
    workflow: CHECK_WORKFLOW.VENDOR_MATCH,
    status: match ? WorkflowStatus.SUCCESS : WorkflowStatus.FAILED,
    executionTime: Date.now() - startedAt,
    error: match
      ? undefined
      : `No confident vendor match for "${invoice.vendor}" (threshold ${VENDOR_MATCH_CONFIDENCE_THRESHOLD})`,
  });

  return match;
}

async function runPoMatchCheck(invoice: Invoice): Promise<PurchaseOrder | null> {
  const startedAt = Date.now();

  if (!invoice.poNumber) {
    await logWorkflowEvent({
      workflow: CHECK_WORKFLOW.PO_MATCH,
      status: WorkflowStatus.FAILED,
      executionTime: Date.now() - startedAt,
      error: 'No PO number extracted from invoice',
    });
    return null;
  }

  const purchaseOrder = await matchPurchaseOrder(invoice.poNumber);

  await logWorkflowEvent({
    workflow: CHECK_WORKFLOW.PO_MATCH,
    status: purchaseOrder ? WorkflowStatus.SUCCESS : WorkflowStatus.FAILED,
    executionTime: Date.now() - startedAt,
    error: purchaseOrder ? undefined : `PO number "${invoice.poNumber}" not found`,
  });

  return purchaseOrder;
}

// Plain rule-based risk/exception evaluation (TASKS.md 9.4) — no Claude call.
// Combines the vendor/PO match outcomes with amount checks into a list of
// human-readable exceptions; any exception present flags NEEDS_REVIEW.
function evaluateRiskExceptions(params: {
  invoice: Invoice;
  vendorMatch: VendorMatch | undefined;
  purchaseOrder: PurchaseOrder | null;
}): string[] {
  const { invoice, vendorMatch, purchaseOrder } = params;
  const exceptions: string[] = [];

  if (!vendorMatch) {
    exceptions.push(`Unverified vendor: no confident match found for "${invoice.vendor}"`);
  }

  if (!invoice.poNumber) {
    exceptions.push('Missing PO number');
  } else if (!purchaseOrder) {
    exceptions.push(`PO number "${invoice.poNumber}" not found`);
  } else if (invoice.total !== null) {
    const difference = invoice.total.minus(purchaseOrder.amount).abs();
    const tolerance = purchaseOrder.amount.times(env.invoicePoTolerancePercent).toDecimalPlaces(2);
    if (difference.greaterThan(tolerance)) {
      exceptions.push(
        `Invoice total ${invoice.total.toFixed(2)} does not match PO ${purchaseOrder.poNumber} amount ${purchaseOrder.amount.toFixed(2)} (tolerance ${(env.invoicePoTolerancePercent * 100).toFixed(0)}%)`,
      );
    }
  }

  if (
    invoice.total !== null &&
    invoice.total.greaterThanOrEqualTo(env.invoiceRiskAmountThreshold)
  ) {
    exceptions.push(
      `Invoice total ${invoice.total.toFixed(2)} is at or above the review threshold ${new Prisma.Decimal(env.invoiceRiskAmountThreshold).toFixed(2)}`,
    );
  }

  return exceptions;
}

async function runRiskEvaluation(params: {
  invoice: Invoice;
  vendorMatch: VendorMatch | undefined;
  purchaseOrder: PurchaseOrder | null;
}): Promise<Invoice> {
  const startedAt = Date.now();
  const exceptions = evaluateRiskExceptions(params);

  await logWorkflowEvent({
    workflow: CHECK_WORKFLOW.RISK,
    status: exceptions.length > 0 ? WorkflowStatus.FAILED : WorkflowStatus.SUCCESS,
    executionTime: Date.now() - startedAt,
    error: exceptions.length > 0 ? exceptions.join('; ') : undefined,
  });

  const entersReview =
    exceptions.length > 0 && params.invoice.status !== InvoiceStatus.NEEDS_REVIEW;

  const updated = await prisma.invoice.update({
    where: { id: params.invoice.id },
    data: {
      vendorId: params.vendorMatch?.vendor.id ?? null,
      purchaseOrderId: params.purchaseOrder?.id ?? null,
      exceptions,
      // Reaching this point means the duplicate check already passed (it
      // short-circuits before here), so PENDING is always the correct clean
      // baseline — including when re-running checks after a manual
      // correction on a previously DUPLICATE/NEEDS_REVIEW invoice, which
      // must be able to clear back to PENDING rather than stay stuck.
      status: exceptions.length > 0 ? InvoiceStatus.NEEDS_REVIEW : InvoiceStatus.PENDING,
    },
  });

  if (entersReview) {
    await notifyInvoiceNeedsReview(updated, exceptions);
  }

  return updated;
}

// Fail-soft like every other optional external call in this codebase
// (lib/slack.ts itself no-ops without a configured webhook) — a Slack outage
// must never block the invoice from landing at NEEDS_REVIEW.
async function notifyInvoiceNeedsReview(invoice: Invoice, exceptions: string[]): Promise<void> {
  try {
    await sendSlackNotification(
      `:warning: Invoice #${invoice.id}${invoice.vendor ? ` (${invoice.vendor})` : ''} needs review: ${exceptions.join('; ')}`,
    );
  } catch (error) {
    logger.warn(
      { err: error, invoiceId: invoice.id },
      'Failed to send Slack notification for invoice entering NEEDS_REVIEW',
    );
  }
}

// Orchestrates the full 9.4 pipeline for a single invoice, run right after
// extraction fills in its fields: duplicate check (short-circuits to
// DUPLICATE on a hit), then vendor match, PO match, and rule-based risk
// evaluation (which sets NEEDS_REVIEW when any exception fires). A clean
// invoice with no exceptions keeps its current status — Phase 9.5 owns the
// human approval transition from there.
export async function runInvoiceChecks(invoiceId: number): Promise<Invoice> {
  const invoice = await prisma.invoice.findUniqueOrThrow({ where: { id: invoiceId } });

  if (!invoice.vendor || !invoice.invoiceNumber || invoice.total === null) {
    logger.warn(
      { invoiceId },
      'Invoice missing required extracted fields, skipping duplicate/vendor/PO checks',
    );
    return invoice;
  }

  const duplicate = await runDuplicateCheck(invoice);
  if (duplicate) {
    return prisma.invoice.update({
      where: { id: invoice.id },
      data: {
        status: InvoiceStatus.DUPLICATE,
        exceptions: [`Duplicate of invoice #${duplicate.id}`],
      },
    });
  }

  const [vendorMatch, purchaseOrder] = await Promise.all([
    runVendorMatchCheck(invoice),
    runPoMatchCheck(invoice),
  ]);

  return runRiskEvaluation({ invoice, vendorMatch, purchaseOrder });
}
