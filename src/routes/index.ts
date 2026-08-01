import { Router } from 'express';

import { aiRouter } from './ai.routes.js';
import { authRouter } from './auth.routes.js';
import { crmRouter } from './crm.routes.js';
import { dashboardRouter } from './dashboard.routes.js';
import { emailsRouter } from './emails.routes.js';
import { invoicesRouter } from './invoices.routes.js';
import { knowledgeRouter } from './knowledge.routes.js';
import { notificationsRouter } from './notifications.routes.js';
import { reportsRouter } from './reports.routes.js';
import { workflowsRouter } from './workflows.routes.js';

export const apiRouter = Router();

apiRouter.use('/auth', authRouter);
apiRouter.use('/emails', emailsRouter);
apiRouter.use('/invoices', invoicesRouter);
apiRouter.use('/ai', aiRouter);
apiRouter.use('/crm', crmRouter);
apiRouter.use('/knowledge', knowledgeRouter);
apiRouter.use('/notifications', notificationsRouter);
apiRouter.use('/workflows', workflowsRouter);
apiRouter.use('/dashboard', dashboardRouter);
apiRouter.use('/reports', reportsRouter);
