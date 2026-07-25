import { Router } from 'express';

import { aiRouter } from './ai.routes.js';
import { authRouter } from './auth.routes.js';
import { crmRouter } from './crm.routes.js';
import { emailsRouter } from './emails.routes.js';
import { notificationsRouter } from './notifications.routes.js';
import { workflowsRouter } from './workflows.routes.js';

export const apiRouter = Router();

apiRouter.use('/auth', authRouter);
apiRouter.use('/emails', emailsRouter);
apiRouter.use('/ai', aiRouter);
apiRouter.use('/crm', crmRouter);
apiRouter.use('/notifications', notificationsRouter);
apiRouter.use('/workflows', workflowsRouter);
