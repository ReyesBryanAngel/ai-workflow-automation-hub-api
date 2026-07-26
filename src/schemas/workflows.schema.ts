import { z } from 'zod';

import { WorkflowStatus } from '../generated/prisma/enums.js';

export const createWorkflowLogSchema = z.object({
  workflow: z.string().min(1),
  status: z.enum(WorkflowStatus),
  error: z.string().optional(),
  retryCount: z.coerce.number().int().nonnegative().optional(),
  executionTime: z.coerce.number().int().nonnegative().optional(),
  emailId: z.coerce.number().int().positive().optional(),
});

export type CreateWorkflowLogInput = z.infer<typeof createWorkflowLogSchema>;

// Mirrors analyzeEmailInputSchema's shape: manually triggering a workflow
// run means posting a raw email payload to the n8n webhook, same as the
// real pipeline trigger described in TASKS.md Phase 3.
export const runWorkflowInputSchema = z.object({
  sender: z.email(),
  subject: z.string().min(1),
  body: z.string().min(1),
});

export type RunWorkflowInput = z.infer<typeof runWorkflowInputSchema>;
