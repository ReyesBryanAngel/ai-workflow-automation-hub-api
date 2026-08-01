import { Router } from 'express';
import multer from 'multer';

import { requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import {
  ALLOWED_INVOICE_MIME_TYPES,
  MAX_INVOICE_UPLOAD_BYTES,
  uploadInvoiceBodySchema,
  type UploadInvoiceInput,
} from '../schemas/invoices.schema.js';
import { createInvoiceFromUpload } from '../services/invoice.service.js';
import { AppError } from '../utils/AppError.js';

export const invoicesRouter = Router();

invoicesRouter.use(requireAuth);

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
