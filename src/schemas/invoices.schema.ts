import { z } from 'zod';

import { InvoiceSourceType } from '../generated/prisma/enums.js';

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
