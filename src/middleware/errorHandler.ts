import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';

import { logger } from '../lib/logger.js';
import { AppError } from '../utils/AppError.js';

export function notFoundHandler(req: Request, _res: Response, next: NextFunction): void {
  next(new AppError(`Route not found: ${req.method} ${req.originalUrl}`, 404));
}

export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof ZodError) {
    res.status(400).json({
      error: 'Validation failed',
      details: err.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    });
    return;
  }

  if (err instanceof AppError) {
    if (err.statusCode >= 500) {
      logger.error({ err, path: req.originalUrl }, err.message);
    }
    res.status(err.statusCode).json({ error: err.message, details: err.details });
    return;
  }

  logger.error({ err, path: req.originalUrl }, 'Unhandled error');
  res.status(500).json({ error: 'Internal server error' });
}
