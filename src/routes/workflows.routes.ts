import { Router } from 'express';

import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { createWorkflowLogSchema, type CreateWorkflowLogInput } from '../schemas/workflows.schema.js';

export const workflowsRouter = Router();

workflowsRouter.use(requireAuth);

// Lets the n8n pipeline (TASKS.md Phase 3) record its own step failures —
// e.g. Save Email / CRM / Slack node retries exhausted — since those aren't
// covered by the internal logWorkflowFailure() in ai.service.ts.
workflowsRouter.post('/log', validate(createWorkflowLogSchema), async (req, res) => {
  const data = req.body as CreateWorkflowLogInput;

  const log = await prisma.workflowLog.create({ data });

  res.status(201).json(log);
});
