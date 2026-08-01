import { z } from 'zod';

// Money fields are decimal strings on the wire, never `number` — a JSON
// float can silently lose cents-level precision before the value ever
// reaches Prisma's `Decimal` columns (schema.prisma: subtotal/tax/total use
// @db.Decimal(12, 2)). Claude is instructed (see invoiceExtraction.prompt.ts)
// to emit amounts in this exact format so `new Prisma.Decimal(value)` in
// invoice.service.ts is a safe, lossless parse.
const decimalString = z
  .string()
  .regex(
    /^-?\d+(\.\d{1,2})?$/,
    'Must be a plain decimal string with up to 2 decimal places (e.g. "1234.56")',
  );

// ISO calendar date (no time/timezone component) — invoiceDate/dueDate are
// dates on the source document, not timestamps.
const isoDateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be an ISO date (YYYY-MM-DD)');

// Structured output contract for both extraction paths (LlamaParse text and
// the Claude-PDF fallback) in invoice.service.ts#extractInvoice — matches
// the draft InvoiceSchema fields already modeled on `Invoice`
// (schema.prisma) plus a self-reported `confidence` used to decide whether
// the LlamaParse-derived result is trustworthy enough to keep, or whether to
// fall back to sending the original PDF straight to Claude.
export const invoiceExtractionSchema = z.object({
  invoiceNumber: z.string().nullable(),
  vendor: z.string().nullable(),
  invoiceDate: isoDateString.nullable(),
  dueDate: isoDateString.nullable(),
  subtotal: decimalString.nullable(),
  tax: decimalString.nullable(),
  total: decimalString.nullable(),
  currency: z.string().length(3).nullable(),
  // Claude's self-assessed confidence (0-1) that the extracted fields are
  // correct given the input it was shown. Low confidence on the LlamaParse
  // text path (e.g. a poor scan producing garbled OCR text) is one of the
  // triggers for falling back to the direct-PDF path.
  confidence: z.number().min(0).max(1),
});

export type InvoiceExtraction = z.infer<typeof invoiceExtractionSchema>;

// Fields required for the invoice to be usable by downstream duplicate/
// vendor/PO matching (Phase 9.4). A result missing any of these is treated
// as "incomplete" and triggers the Claude-PDF fallback, same as low
// confidence — see the "Fallback path" bullet in TASKS.md 9.3.
export const REQUIRED_INVOICE_EXTRACTION_FIELDS = ['invoiceNumber', 'vendor', 'total'] as const;

export function isInvoiceExtractionIncomplete(extraction: InvoiceExtraction): boolean {
  return REQUIRED_INVOICE_EXTRACTION_FIELDS.some((field) => extraction[field] === null);
}
