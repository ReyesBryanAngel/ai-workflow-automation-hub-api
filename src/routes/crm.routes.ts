import { Router } from 'express';

import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import {
  createCrmRecordSchema,
  crmRecordIdParamsSchema,
  type CreateCrmRecordInput,
} from '../schemas/crm.schema.js';
import { AppError } from '../utils/AppError.js';

export const crmRouter = Router();

crmRouter.use(requireAuth);

crmRouter.get('/records', async (_req, res) => {
  const records = await prisma.crmRecord.findMany({ orderBy: { createdAt: 'desc' } });
  res.json(records);
});

crmRouter.get('/records/:id', validate(crmRecordIdParamsSchema, 'params'), async (req, res) => {
  const { id } = req.params as unknown as { id: number };

  const record = await prisma.crmRecord.findUnique({ where: { id } });

  if (!record) {
    throw new AppError('CRM record not found', 404);
  }

  res.json(record);
});

// Mock CRM integration for the n8n pipeline (TASKS.md Phase 3): persists a
// crm_records row instead of calling a real third-party CRM API.
crmRouter.post('/records', validate(createCrmRecordSchema), async (req, res) => {
  const data = req.body as CreateCrmRecordInput;

  const record = await prisma.crmRecord.create({ data });

  res.status(201).json(record);
});
