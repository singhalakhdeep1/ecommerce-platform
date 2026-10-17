import { NextFunction, Request, Response } from 'express';
import { RateLimitingService } from '../services/rateLimiting/rateLimitingService';
import { metrics } from '../services/metrics';
import { structuredLog } from '../services/logging/structuredLoggingService';

/**
 * Token-bucket rate limiting middleware. Key = policy + (user id when signed in, else client IP).
 * Sets the IETF RateLimit-* headers and Retry-After on 429.
 */
export function rateLimit(policy: string, options: { capacity?: number; refillPerSecond?: number } = {}) {
  const limiter = new RateLimitingService({ bucketCapacity: options.capacity, refillRate: options.refillPerSecond, keyPrefix: `ratelimit:${policy}:` });
  return (req: Request, res: Response, next: NextFunction): void => {
    if (process.env.RATE_LIMIT_DISABLED === 'true') return next();
    const subject = req.user?.id ?? req.ip ?? 'unknown';
    limiter
      .consume(subject)
      .then((decision) => {
        res.setHeader('RateLimit-Limit', String(decision.limit));
        res.setHeader('RateLimit-Remaining', String(decision.remaining));
        if (decision.allowed) return next();
        metrics.rateLimited.inc({ policy });
        structuredLog.logWarning('Rate limit exceeded', { policy, subject });
        res.setHeader('Retry-After', String(decision.retryAfterSeconds));
        res.status(429).json({ success: false, error: 'Too many requests, slow down', retryAfterSeconds: decision.retryAfterSeconds });
      })
      .catch(next);
  };
}

/** Global API limit (HLD defaults: 100 burst, 1 token/s). */
export const apiRateLimit = rateLimit('api');
/** Brute-force protection for login / register / password changes: 10 attempts, then 1 per 6 s. */
export const authRateLimit = rateLimit('auth', {
  capacity: Number(process.env.AUTH_RATE_LIMIT_PER_MINUTE ?? 10),
  refillPerSecond: Number(process.env.AUTH_RATE_LIMIT_PER_MINUTE ?? 10) / 60,
});
