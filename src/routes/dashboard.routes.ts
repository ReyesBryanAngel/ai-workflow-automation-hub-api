import { Router } from 'express';

import { EmailCategory, EmailStatus, WorkflowStatus } from '../generated/prisma/enums.js';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/auth.js';

export const dashboardRouter = Router();

dashboardRouter.use(requireAuth);

// Module 1 (Dashboard) stat cards: today's emails is time-boxed, the rest
// are running totals — matches project-documentation.md §8 Module 1.
dashboardRouter.get('/', async (_req, res) => {
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  const [todayEmails, aiProcessed, salesLeads, supportTickets, failedWorkflows] = await Promise.all(
    [
      prisma.email.count({ where: { createdAt: { gte: startOfToday } } }),
      prisma.email.count({ where: { status: EmailStatus.PROCESSED } }),
      prisma.email.count({ where: { category: EmailCategory.SALES } }),
      prisma.email.count({ where: { category: EmailCategory.SUPPORT } }),
      prisma.workflowLog.count({ where: { status: WorkflowStatus.FAILED } }),
    ],
  );

  res.json({ todayEmails, aiProcessed, salesLeads, supportTickets, failedWorkflows });
});
