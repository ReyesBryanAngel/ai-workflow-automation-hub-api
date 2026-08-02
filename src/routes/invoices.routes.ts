import { Router } from 'express';
import multer from 'multer';

import { UserRole } from '../generated/prisma/enums.js';
import { prisma } from '../lib/prisma.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import {
  ALLOWED_INVOICE_MIME_TYPES,
  invoiceIdParamsSchema,
  listInvoicesQuerySchema,
  MAX_INVOICE_UPLOAD_BYTES,
  rejectInvoiceBodySchema,
  updateInvoiceBodySchema,
  uploadInvoiceBodySchema,
  type ListInvoicesQuery,
  type RejectInvoiceInput,
  type UpdateInvoiceInput,
  type UploadInvoiceInput,
} from '../schemas/invoices.schema.js';
import {
  approveInvoice,
  createInvoiceFromUpload,
  exportInvoice,
  listInvoices,
  rejectInvoice,
  schedulePaymentForInvoice,
  updateInvoice,
} from '../services/invoice.service.js';
import { AppError } from '../utils/AppError.js';

export const invoicesRouter = Router();

invoicesRouter.use(requireAuth);

// Doubles as the Phase 9.5 review queue via ?status=NEEDS_REVIEW.
invoicesRouter.get('/', validate(listInvoicesQuerySchema, 'query'), async (req, res) => {
  const { status } = req.query as unknown as ListInvoicesQuery;
  const invoices = await listInvoices(status);
  res.json(invoices);
});

// Includes the matched vendor/PO (Phase 9.4) and reviewer (Phase 9.5) so a
// single call surfaces everything the pipeline decided about this invoice,
// not just its own columns.
invoicesRouter.get('/:id', validate(invoiceIdParamsSchema, 'params'), async (req, res) => {
  const { id } = req.params as unknown as { id: number };

  const invoice = await prisma.invoice.findUnique({
    where: { id },
    include: {
      matchedVendor: true,
      purchaseOrder: true,
      // select only, never the full User relation — it carries passwordHash.
      reviewedBy: { select: { id: true, email: true, role: true } },
    },
  });

  if (!invoice) {
    throw new AppError('Invoice not found', 404);
  }

  res.json(invoice);
});

// Manual correction of extracted fields (e.g. fixing a bad OCR read before
// approval) — only from a pre-decision status (see EDITABLE_STATUSES in
// invoice.service.ts); re-runs the 9.4 checks pipeline afterward so the
// correction can actually change the invoice's status/exceptions. Not
// role-gated: same reasoning as /:id/export below, this isn't an approval
// decision, just a data-quality fix any authenticated user can make before
// an APPROVER ever looks at it.
invoicesRouter.patch(
  '/:id',
  validate(invoiceIdParamsSchema, 'params'),
  validate(updateInvoiceBodySchema),
  async (req, res) => {
    const { id } = req.params as unknown as { id: number };
    const patch = req.body as UpdateInvoiceInput;

    const invoice = await updateInvoice(id, patch);

    res.json(invoice);
  },
);

// Memory storage: files are handed straight to lib/storage.ts as a Buffer,
// never touching local disk — same "no local temp files" posture the S3
// storage lib already assumes.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_INVOICE_UPLOAD_BYTES },
  fileFilter: (_req, file, cb) => {
    if (
      !ALLOWED_INVOICE_MIME_TYPES.includes(
        file.mimetype as (typeof ALLOWED_INVOICE_MIME_TYPES)[number],
      )
    ) {
      cb(
        new AppError(
          `Unsupported file type: ${file.mimetype}. Only PDF and image invoices are accepted.`,
          400,
        ),
      );
      return;
    }
    cb(null, true);
  },
});

invoicesRouter.post(
  '/upload',
  upload.single('file'),
  validate(uploadInvoiceBodySchema),
  async (req, res) => {
    if (!req.file) {
      throw new AppError('An invoice file is required (multipart field "file")', 400);
    }

    const { sourceType } = req.body as UploadInvoiceInput;

    const invoice = await createInvoiceFromUpload({
      buffer: req.file.buffer,
      originalName: req.file.originalname,
      mimeType: req.file.mimetype,
      sourceType,
    });

    res.status(201).json(invoice);
  },
);

const APPROVER_ROLES = [UserRole.APPROVER, UserRole.ADMIN];

invoicesRouter.post(
  '/:id/approve',
  requireRole(...APPROVER_ROLES),
  validate(invoiceIdParamsSchema, 'params'),
  async (req, res) => {
    const { id } = req.params as unknown as { id: number };

    const invoice = await approveInvoice(id, req.user!.sub);

    res.json(invoice);
  },
);

invoicesRouter.post(
  '/:id/reject',
  requireRole(...APPROVER_ROLES),
  validate(invoiceIdParamsSchema, 'params'),
  validate(rejectInvoiceBodySchema),
  async (req, res) => {
    const { id } = req.params as unknown as { id: number };
    const { reason } = req.body as RejectInvoiceInput;

    const invoice = await rejectInvoice(id, req.user!.sub, reason);

    res.json(invoice);
  },
);

// Mock accounting-system export (TASKS.md 9.6), same pattern as the mock CRM
// integration (crm.routes.ts:34-42): no real third-party call, just the
// status transition. Any authenticated user may trigger it, same as the CRM
// mock endpoint — export isn't a review decision like approve/reject, so it
// isn't APPROVER/ADMIN-gated.
invoicesRouter.post('/:id/export', validate(invoiceIdParamsSchema, 'params'), async (req, res) => {
  const { id } = req.params as unknown as { id: number };

  const invoice = await exportInvoice(id);

  res.json(invoice);
});

// Called by the n8n cron-triggered payment-scheduling workflow (TASKS.md
// 9.6), one invoice at a time, once n8n has queried EXPORTED invoices with an
// approaching dueDate — this endpoint doesn't re-check dueDate itself, n8n
// owns that query.
invoicesRouter.post(
  '/:id/schedule-payment',
  validate(invoiceIdParamsSchema, 'params'),
  async (req, res) => {
    const { id } = req.params as unknown as { id: number };

    const invoice = await schedulePaymentForInvoice(id);

    res.json(invoice);
  },
);