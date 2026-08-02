import { z } from 'zod';

import { InvoiceSourceType, InvoiceStatus } from '../generated/prisma/enums.js';
import { decimalString, isoDateString } from './invoice.schema.js';

// Claude's native PDF input (Phase 9.3) and the LlamaParse OCR fallback both
// only make sense for these — anything else is rejected at intake rather
// than stored and discovered to be unusable later.
export const ALLOWED_INVOICE_MIME_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/tiff',
  'image/heic',
] as const;

export const MAX_INVOICE_UPLOAD_BYTES = 15 * 1024 * 1024;

// sourceType is caller-supplied (not inferred from the request) because this
// endpoint is shared: the manual upload form, the n8n Gmail-attachment
// branch, and the n8n Drive-watcher branch (9.2) all POST here, differing
// only in who's asking. Defaults to UPLOAD for the manual/API path.
export const uploadInvoiceBodySchema = z.object({
  sourceType: z.enum(InvoiceSourceType).optional().default(InvoiceSourceType.UPLOAD),
});

export type UploadInvoiceInput = z.infer<typeof uploadInvoiceBodySchema>;

export const invoiceIdParamsSchema = z.object({
  id: z.coerce.number().int().positive(),
});

// GET /api/invoices?status=NEEDS_REVIEW (review queue); status is optional
// so the same route also serves an unfiltered list.
export const listInvoicesQuerySchema = z.object({
  status: z.enum(InvoiceStatus).optional(),
});

export type ListInvoicesQuery = z.infer<typeof listInvoicesQuerySchema>;

// Manual correction of the extracted/business fields (e.g. a human fixing a
// bad OCR read before approval) — deliberately excludes status, vendorId/
// purchaseOrderId, and exceptions, all of which are only ever set by the
// pipeline itself (extraction, checks), never hand-edited. Each field is
// optional (omit = leave untouched) but nullable
// where the extraction schema allows null (clear a previously-set value) —
// same convention as invoiceExtractionSchema. At least one field is required
// so this can't be called as a silent no-op.
export const updateInvoiceBodySchema = z
  .object({
    invoiceNumber: z.string().min(1).nullable(),
    vendor: z.string().min(1).nullable(),
    poNumber: z.string().min(1).nullable(),
    invoiceDate: isoDateString.nullable(),
    dueDate: isoDateString.nullable(),
    subtotal: decimalString.nullable(),
    tax: decimalString.nullable(),
    total: decimalString.nullable(),
    currency: z.string().length(3),
  })
  .partial()
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field must be provided',
  });

export type UpdateInvoiceInput = z.infer<typeof updateInvoiceBodySchema>;
