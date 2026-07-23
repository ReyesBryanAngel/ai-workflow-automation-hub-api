import type { NextFunction, Request, Response } from 'express';

import { verifyToken } from '../lib/jwt.js';
import { AppError } from '../utils/AppError.js';

export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  const header = req.headers.authorization;

  if (!header?.startsWith('Bearer ')) {
    next(new AppError('Missing or invalid Authorization header', 401));
    return;
  }

  const token = header.slice('Bearer '.length);

  try {
    req.user = verifyToken(token);
    next();
  } catch {
    next(new AppError('Invalid or expired token', 401));
  }
}
