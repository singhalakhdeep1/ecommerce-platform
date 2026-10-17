import { NextFunction, Request, Response } from 'express';
import { ZodError, ZodTypeAny, z } from 'zod';
import { AppError } from '../utils/appError';

type Part = 'body' | 'query' | 'params';

/** Parses and replaces req[part] with the zod output (coerced, defaulted, unknown keys stripped). */
export function validate(schema: ZodTypeAny, part: Part = 'body') {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req[part] ?? {});
    if (!result.success) return next(AppError.badRequest('Validation failed', formatZodError(result.error)));
    if (part === 'query') {
      // req.query is a getter in Express 5-style setups; assign through defineProperty to be safe.
      Object.defineProperty(req, 'query', { value: result.data, writable: true, configurable: true });
    } else {
      (req as unknown as Record<Part, unknown>)[part] = result.data;
    }
    next();
  };
}

export function formatZodError(error: ZodError): Array<{ path: string; message: string }> {
  return error.issues.map((i) => ({ path: i.path.join('.') || '(root)', message: i.message }));
}

/** Common schema pieces. */
export const s = {
  uuid: z.string().uuid(),
  idParam: z.object({ id: z.string().uuid() }),
  page: z.coerce.number().int().min(1).default(1),
  limit: (max = 100, def = 20) => z.coerce.number().int().min(1).max(max).default(def),
  money: z.coerce.number().min(0).max(1_000_000),
  bool: z.preprocess((v) => (v === 'true' ? true : v === 'false' ? false : v), z.boolean()),
  address: z.object({
    name: z.string().trim().min(2).max(100),
    address: z.string().trim().min(5).max(200),
    city: z.string().trim().min(2).max(100),
    state: z.string().trim().max(50).optional().default(''),
    zip: z.string().trim().min(3).max(20),
    country: z.string().trim().length(2).transform((c) => c.toUpperCase()),
    phone: z.string().trim().max(32).optional(),
  }),
};
