import { Router } from 'express';

import { EmailCategory, Priority, WorkflowStatus } from '../generated/prisma/enums.js';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { reportsQuerySchema, type ReportsQuery } from '../schemas/reports.schema.js';

export const reportsRouter = Router();

reportsRouter.use(requireAuth);

function buildEmailsPerDay(
  emails: { createdAt: Date }[],
  days: number,
): { date: string; count: number }[] {
  const counts = new Map<string, number>();

  for (const email of emails) {
    const key = email.createdAt.toISOString().slice(0, 10);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  const series: { date: string; count: number }[] = [];
  for (let i = days - 1; i >= 0; i -= 1) {
    const date = new Date(today);
    date.setUTCDate(date.getUTCDate() - i);
    const key = date.toISOString().slice(0, 10);
    series.push({ date: key, count: counts.get(key) ?? 0 });
  }

  return series;
}

// Module 4 (Reports) chart data — daily volume, category/priority mix, and
// workflow success rate — per project-documentation.md §8 Module 4.
reportsRouter.get('/', validate(reportsQuerySchema, 'query'), async (req, res) => {
  const { days } = req.query as unknown as ReportsQuery;

  const since = new Date();
  since.setUTCHours(0, 0, 0, 0);
  since.setUTCDate(since.getUTCDate() - (days - 1));

  const [emailsInRange, categoryRows, priorityRows, workflowRows] = await Promise.all([
    prisma.email.findMany({
      where: { createdAt: { gte: since } },
      select: { createdAt: true },
    }),
    prisma.email.groupBy({
      by: ['category'],
      where: { category: { not: null } },
      _count: { _all: true },
    }),
    prisma.email.groupBy({
      by: ['priority'],
      where: { priority: { not: null } },
      _count: { _all: true },
    }),
    prisma.workflowLog.groupBy({
      by: ['status'],
      _count: { _all: true },
    }),
  ]);

  const categoryDistribution = Object.values(EmailCategory).map((category) => ({
    category,
    count: categoryRows.find((row) => row.category === category)?._count._all ?? 0,
  }));

  const priorityDistribution = Object.values(Priority).map((priority) => ({
    priority,
    count: priorityRows.find((row) => row.priority === priority)?._count._all ?? 0,
  }));

  const workflowCounts = Object.fromEntries(
    Object.values(WorkflowStatus).map((status) => [
      status,
      workflowRows.find((row) => row.status === status)?._count._all ?? 0,
    ]),
  ) as Record<WorkflowStatus, number>;

  const totalWorkflows = Object.values(workflowCounts).reduce((sum, count) => sum + count, 0);
  const successRate =
    totalWorkflows === 0 ? 0 : workflowCounts[WorkflowStatus.SUCCESS] / totalWorkflows;

  res.json({
    emailsPerDay: buildEmailsPerDay(emailsInRange, days),
    categoryDistribution,
    priorityDistribution,
    workflowSuccessRate: {
      total: totalWorkflows,
      success: workflowCounts[WorkflowStatus.SUCCESS],
      failed: workflowCounts[WorkflowStatus.FAILED],
      retrying: workflowCounts[WorkflowStatus.RETRYING],
      rate: successRate,
    },
  });
});
