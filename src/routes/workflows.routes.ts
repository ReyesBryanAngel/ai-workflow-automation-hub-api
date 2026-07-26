import { Router } from 'express';

import { env } from '../config/env.js';
import { WorkflowStatus } from '../generated/prisma/enums.js';
import { triggerN8nWorkflow } from '../lib/n8n.js';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import {
  createWorkflowLogSchema,
  runWorkflowInputSchema,
  type CreateWorkflowLogInput,
  type RunWorkflowInput,
} from '../schemas/workflows.schema.js';
import { AppError } from '../utils/AppError.js';

export const workflowsRouter = Router();

workflowsRouter.use(requireAuth);

// Module 3 (Workflow Logs): execution time, success/fail, retry count per run.
workflowsRouter.get('/', async (_req, res) => {
  const logs = await prisma.workflowLog.findMany({ orderBy: { createdAt: 'desc' } });
  res.json(logs);
});

// Lets the n8n pipeline (TASKS.md Phase 3) record its own step failures —
// e.g. Save Email / CRM / Slack node retries exhausted — since those aren't
// covered by the internal logWorkflowFailure() in ai.service.ts.
workflowsRouter.post('/log', validate(createWorkflowLogSchema), async (req, res) => {
  const data = req.body as CreateWorkflowLogInput;

  const log = await prisma.workflowLog.create({ data });

  res.status(201).json(log);
});

// Manually kicks off the n8n pipeline (dashboard "run workflow" action)
// instead of waiting for a real inbound email. n8n owns logging of its own
// step failures via POST /workflows/log above; this only logs a failure to
// dispatch the trigger itself.
workflowsRouter.post('/run', validate(runWorkflowInputSchema), async (req, res) => {
  console.log('triggering n8n workflow:', env.n8nWebhookUrl);
  if (!env.n8nWebhookUrl) {
    throw new AppError('N8N_WEBHOOK_URL is not configured', 503);
  }

  const input = req.body as RunWorkflowInput;

  try {
    const result = await triggerN8nWorkflow(input);
    res.status(202).json({ status: 'triggered', result: result ?? null });
  } catch (error) {
    await prisma.workflowLog.create({
      data: {
        workflow: 'manual_trigger',
        status: WorkflowStatus.FAILED,
        error: error instanceof Error ? error.message : String(error),
      },
    });
    throw new AppError(
      'Failed to trigger workflow run',
      502,
      error instanceof Error ? error.message : undefined,
    );
  }
});
