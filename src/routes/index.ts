import { Router } from 'express';

import { aiRouter } from './ai.routes.js';
import { authRouter } from './auth.routes.js';
import { emailsRouter } from './emails.routes.js';

export const apiRouter = Router();

apiRouter.use('/auth', authRouter);
apiRouter.use('/emails', emailsRouter);
apiRouter.use('/ai', aiRouter);
