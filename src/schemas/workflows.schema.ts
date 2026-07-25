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
