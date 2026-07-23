import { Router } from 'express';

import { signToken } from '../lib/jwt.js';
import { comparePassword } from '../lib/password.js';
import { prisma } from '../lib/prisma.js';
import { authLimiter } from '../middleware/rateLimit.js';
import { validate } from '../middleware/validate.js';
import { loginSchema } from '../schemas/auth.schema.js';
import { AppError } from '../utils/AppError.js';

export const authRouter = Router();

authRouter.post('/login', authLimiter, validate(loginSchema), async (req, res) => {
  const { email, password } = req.body as { email: string; password: string };

  const user = await prisma.user.findUnique({ where: { email } });
  const isValid = user ? await comparePassword(password, user.passwordHash) : false;

  if (!user || !isValid) {
    throw new AppError('Invalid email or password', 401);
  }

  const token = signToken({ sub: user.id, email: user.email });

  res.json({ token, user: { id: user.id, email: user.email } });
});
