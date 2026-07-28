import { z } from 'zod';

import { EmailCategory } from '../generated/prisma/enums.js';

export const createKnowledgeArticleSchema = z.object({
  title: z.string().min(1),
  content: z.string().min(1),
  category: z.enum(EmailCategory).optional(),
});

export type CreateKnowledgeArticleInput = z.infer<typeof createKnowledgeArticleSchema>;

export const knowledgeArticleIdParamsSchema = z.object({
  id: z.coerce.number().int().positive(),
});
