import { createHash } from 'crypto';
import { NextFunction, Request, Response } from 'express';
import { idempotency } from '../services/idempotency/idempotencyService';
import { AppError } from '../utils/appError';

/**
 * Honors the `Idempotency-Key` header on unsafe endpoints (checkout, payment intents, refunds).
 * - first request: takes a lock, runs, and stores the response (status + body) for 24h
 * - retry with the same key and body: gets the stored response, marked `Idempotent-Replayed: true`
 * - same key while the first is still running: 409; same key with a different body: 422
 * Keys are scoped per user and route. Without the header the request runs normally.
 */
export function idempotent(scopeName: string, options: { required?: boolean } = {}) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const key = req.header('Idempotency-Key');
    if (!key) {
      if (options.required) return next(AppError.badRequest('Idempotency-Key header is required'));
      return next();
    }
    if (!idempotency.isValidIdempotencyKey(key)) return next(AppError.badRequest('Idempotency-Key must be 8-64 characters [A-Za-z0-9_-:.]'));

    const scope = `${scopeName}:${req.user?.id ?? req.ip}`;
    const fingerprint = createHash('sha256').update(JSON.stringify(req.body ?? {})).digest('hex');
    try {
      const stored = await idempotency.getCachedResponse(scope, key);
      if (stored) {
        if (stored.fingerprint !== fingerprint) return next(AppError.unprocessable('Idempotency-Key was already used with a different request body'));
        res.setHeader('Idempotent-Replayed', 'true');
        res.status(stored.status).json(stored.body);
        return;
      }
      if (!(await idempotency.acquire(scope, key))) return next(AppError.conflict('A request with this Idempotency-Key is still being processed'));
    } catch (error) {
      return next(error);
    }

    const originalJson = res.json.bind(res);
    res.json = (body: unknown) => {
      // Only successful and client-error results are final; 5xx may succeed on retry.
      const final = res.statusCode < 500;
      const done = final ? idempotency.storeResponse(scope, key, { status: res.statusCode, body, fingerprint }) : Promise.resolve();
      void done.finally(() => idempotency.release(scope, key));
      return originalJson(body);
    };
    next();
  };
}
