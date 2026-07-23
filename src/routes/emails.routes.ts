import { Router } from 'express';

import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { createEmailSchema, emailIdParamsSchema, type CreateEmailInput } from '../schemas/emails.schema.js';
import { AppError } from '../utils/AppError.js';

export const emailsRouter = Router();

emailsRouter.use(requireAuth);

emailsRouter.get('/', async (_req, res) => {
  const emails = await prisma.email.findMany({ orderBy: { createdAt: 'desc' } });
  res.json(emails);
});

emailsRouter.get('/:id', validate(emailIdParamsSchema, 'params'), async (req, res) => {
  const { id } = req.params as unknown as { id: number };

  const email = await prisma.email.findUnique({ where: { id } });

  if (!email) {
    throw new AppError('Email not found', 404);
  }

  res.json(email);
});

emailsRouter.post('/', validate(createEmailSchema), async (req, res) => {
  const data = req.body as CreateEmailInput;

  const email = await prisma.email.create({ data });

  res.status(201).json(email);
});
