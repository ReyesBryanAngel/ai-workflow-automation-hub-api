import cors from 'cors';
import express from 'express';
import { pinoHttp } from 'pino-http';

import { logger } from './lib/logger.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { apiLimiter } from './middleware/rateLimit.js';
import { apiRouter } from './routes/index.js';

export const app = express();

app.use(cors());
app.use(pinoHttp({ logger }));
app.use(express.json());

app.get('/health', (_req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use('/api', apiLimiter, apiRouter);

app.use(notFoundHandler);
app.use(errorHandler);

export default app;
