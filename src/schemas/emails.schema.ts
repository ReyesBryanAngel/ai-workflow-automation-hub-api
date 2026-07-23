import { z } from 'zod';

import { EmailCategory, Priority } from '../generated/prisma/enums.js';

export const createEmailSchema = z.object({
  sender: z.email(),
  subject: z.string().min(1),
  body: z.string().min(1),
  category: z.enum(EmailCategory).optional(),
  priority: z.enum(Priority).optional(),
  summary: z.string().optional(),
});

export type CreateEmailInput = z.infer<typeof createEmailSchema>;

export const emailIdParamsSchema = z.object({
  id: z.coerce.number().int().positive(),
});
