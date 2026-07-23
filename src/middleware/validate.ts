import type { NextFunction, Request, Response } from 'express';
import type { ZodType } from 'zod';

type RequestSource = 'body' | 'params' | 'query';

export function validate(schema: ZodType, source: RequestSource = 'body') {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req[source]);

    if (!result.success) {
      next(result.error);
      return;
    }

    if (source === 'query') {
      // Express 5 exposes req.query as a getter-only property, so it must be
      // redefined rather than assigned.
      Object.defineProperty(req, 'query', { value: result.data, writable: true, configurable: true });
    } else {
      req[source] = result.data;
    }
    next();
  };
}
