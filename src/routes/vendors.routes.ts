import { Router } from 'express';

import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import {
  createVendorSchema,
  vendorIdParamsSchema,
  type CreateVendorInput,
} from '../schemas/vendors.schema.js';
import { AppError } from '../utils/AppError.js';

export const vendorsRouter = Router();

vendorsRouter.use(requireAuth);

vendorsRouter.get('/', async (_req, res) => {
  const vendors = await prisma.vendor.findMany({ orderBy: { name: 'asc' } });
  res.json(vendors);
});

vendorsRouter.get('/:id', validate(vendorIdParamsSchema, 'params'), async (req, res) => {
  const { id } = req.params as unknown as { id: number };

  const vendor = await prisma.vendor.findUnique({ where: { id } });

  if (!vendor) {
    throw new AppError('Vendor not found', 404);
  }

  res.json(vendor);
});

// Vendors are created here deliberately (the known-good side of Phase 9.4
// vendor matching) — invoice extraction never creates a Vendor row itself,
// see invoiceChecks.service.ts#matchVendor.
vendorsRouter.post('/', validate(createVendorSchema), async (req, res) => {
  const data = req.body as CreateVendorInput;

  const vendor = await prisma.vendor.create({ data });

  res.status(201).json(vendor);
});
