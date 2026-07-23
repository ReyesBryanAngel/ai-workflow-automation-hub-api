import jwt from 'jsonwebtoken';

import { env } from '../config/env.js';

export interface AuthTokenPayload {
  sub: number;
  email: string;
}

export function signToken(payload: AuthTokenPayload): string {
  return jwt.sign(payload, env.jwtSecret, { expiresIn: env.jwtExpiresIn as jwt.SignOptions['expiresIn'] });
}

export function verifyToken(token: string): AuthTokenPayload {
  return jwt.verify(token, env.jwtSecret) as unknown as AuthTokenPayload;
}
