import type { NextFunction, Request, Response } from 'express';

import type { UserRole } from '../generated/prisma/enums.js';
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

// Role is embedded in the JWT at login (see lib/jwt.ts), not looked up from
// the DB per-request — consistent with requireAuth's existing "JWT-only, no
// DB check" posture. Must run after requireAuth so req.user is populated.
export function requireRole(...roles: UserRole[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user || !roles.includes(req.user.role)) {
      next(new AppError('Insufficient permissions for this action', 403));
      return;
    }
    next();
  };
}
