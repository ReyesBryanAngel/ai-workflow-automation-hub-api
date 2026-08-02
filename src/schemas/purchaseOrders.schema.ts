import { z } from 'zod';

// Same decimal-string discipline as invoice money fields (see
// schemas/invoice.schema.ts) — a JSON float could silently lose cents-level
// precision before reaching Prisma's Decimal(12,2) column.
const decimalString = z
  .string()
  .regex(
    /^-?\d+(\.\d{1,2})?$/,
    'Must be a plain decimal string with up to 2 decimal places (e.g. "1234.56")',
  );

export const createPurchaseOrderSchema = z.object({
  poNumber: z.string().min(1),
  amount: decimalString,
});

export type CreatePurchaseOrderInput = z.infer<typeof createPurchaseOrderSchema>;

export const purchaseOrderIdParamsSchema = z.object({
  id: z.coerce.number().int().positive(),
});
