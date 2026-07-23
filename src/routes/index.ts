import { Router } from 'express';

import { authRouter } from './auth.routes.js';
import { emailsRouter } from './emails.routes.js';

export const apiRouter = Router();

apiRouter.use('/auth', authRouter);
apiRouter.use('/emails', emailsRouter);
