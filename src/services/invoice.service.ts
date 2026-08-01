import type { Invoice } from '../generated/prisma/client.js';
import { InvoiceStatus, type InvoiceSourceType } from '../generated/prisma/enums.js';
import { prisma } from '../lib/prisma.js';
import { saveFile } from '../lib/storage.js';

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

  return prisma.invoice.create({
    data: {
      storageKey,
      documentUrl,
      sourceType: params.sourceType,
      status: InvoiceStatus.PENDING,
    },
  });
}
