import { Router } from 'express';

import { requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import {
  analyzeEmailInputSchema,
  emailReplyInputSchema,
  type AnalyzeEmailInput,
  type EmailReplyInput,
} from '../schemas/ai.schema.js';
import { analyzeEmail, draftEmailReply } from '../services/ai.service.js';

export const aiRouter = Router();

aiRouter.use(requireAuth);

aiRouter.post('/analyze', validate(analyzeEmailInputSchema), async (req, res) => {
  const input = req.body as AnalyzeEmailInput;

  const analysis = await analyzeEmail(input);

  res.json(analysis);
});

aiRouter.post('/reply', validate(emailReplyInputSchema), async (req, res) => {
  const input = req.body as EmailReplyInput;

  const reply = await draftEmailReply(input);

  res.json(reply);
});
