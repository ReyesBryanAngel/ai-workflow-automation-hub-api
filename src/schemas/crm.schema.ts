import { z } from 'zod';

export const createCrmRecordSchema = z.object({
  customerName: z.string().min(1),
  email: z.email(),
  company: z.string().optional(),
  source: z.string().min(1),
  sourceEmailId: z.coerce.number().int().positive().optional(),
});

export type CreateCrmRecordInput = z.infer<typeof createCrmRecordSchema>;

export const crmRecordIdParamsSchema = z.object({
  id: z.coerce.number().int().positive(),
});
