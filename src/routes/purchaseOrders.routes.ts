import { Router } from 'express';

import { Prisma } from '../generated/prisma/client.js';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import {
  createPurchaseOrderSchema,
  purchaseOrderIdParamsSchema,
  type CreatePurchaseOrderInput,
} from '../schemas/purchaseOrders.schema.js';
import { AppError } from '../utils/AppError.js';

export const purchaseOrdersRouter = Router();

purchaseOrdersRouter.use(requireAuth);

purchaseOrdersRouter.get('/', async (_req, res) => {
  const purchaseOrders = await prisma.purchaseOrder.findMany({ orderBy: { createdAt: 'desc' } });
  res.json(purchaseOrders);
});

purchaseOrdersRouter.get(
  '/:id',
  validate(purchaseOrderIdParamsSchema, 'params'),
  async (req, res) => {
    const { id } = req.params as unknown as { id: number };

    const purchaseOrder = await prisma.purchaseOrder.findUnique({ where: { id } });

    if (!purchaseOrder) {
      throw new AppError('Purchase order not found', 404);
    }

    res.json(purchaseOrder);
  },
);

purchaseOrdersRouter.post('/', validate(createPurchaseOrderSchema), async (req, res) => {
  const data = req.body as CreatePurchaseOrderInput;

  const purchaseOrder = await prisma.purchaseOrder.create({
    data: { poNumber: data.poNumber, amount: new Prisma.Decimal(data.amount) },
  });

  res.status(201).json(purchaseOrder);
});
