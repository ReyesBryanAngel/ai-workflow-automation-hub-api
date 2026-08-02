import { z } from 'zod';

export const createVendorSchema = z.object({
  name: z.string().min(1),
  email: z.email().optional(),
});

export type CreateVendorInput = z.infer<typeof createVendorSchema>;

export const vendorIdParamsSchema = z.object({
  id: z.coerce.number().int().positive(),
});
