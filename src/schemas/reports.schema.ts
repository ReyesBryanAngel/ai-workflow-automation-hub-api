import { z } from 'zod';

export const reportsQuerySchema = z.object({
  days: z.coerce.number().int().positive().max(365).default(30),
});

export type ReportsQuery = z.infer<typeof reportsQuerySchema>;
