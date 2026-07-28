import { Router } from 'express';

import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import {
  createKnowledgeArticleSchema,
  knowledgeArticleIdParamsSchema,
  type CreateKnowledgeArticleInput,
} from '../schemas/knowledge.schema.js';
import { AppError } from '../utils/AppError.js';

export const knowledgeRouter = Router();

knowledgeRouter.use(requireAuth);

knowledgeRouter.get('/articles', async (_req, res) => {
  const articles = await prisma.knowledgeArticle.findMany({ orderBy: { createdAt: 'desc' } });
  res.json(articles);
});

knowledgeRouter.get(
  '/articles/:id',
  validate(knowledgeArticleIdParamsSchema, 'params'),
  async (req, res) => {
    const { id } = req.params as unknown as { id: number };

    const article = await prisma.knowledgeArticle.findUnique({ where: { id } });

    if (!article) {
      throw new AppError('Knowledge article not found', 404);
    }

    res.json(article);
  },
);

// Feeds the retrieval step in knowledgeBase.service.ts, which grounds
// POST /api/ai/reply drafts (basic RAG — see project-documentation.md).
knowledgeRouter.post('/articles', validate(createKnowledgeArticleSchema), async (req, res) => {
  const data = req.body as CreateKnowledgeArticleInput;

  const article = await prisma.knowledgeArticle.create({ data });

  res.status(201).json(article);
});
