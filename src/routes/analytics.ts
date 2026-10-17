import { Router } from 'express';
import { z } from 'zod';
import { adminOnly, optionalAuth } from '../middleware/auth';
import { rateLimit } from '../middleware/rateLimit';
import { validate } from '../middleware/validate';
import {
  CLIENT_EVENTS,
  cohorts,
  customerAnalytics,
  eventBreakdown,
  funnel,
  inventory,
  parseRange,
  productPerformance,
  sales,
  track,
} from '../services/analytics/analyticsService';
import { AppError } from '../utils/appError';
import { asyncHandler } from '../utils/asyncHandler';

const router = Router();

/**
 * Behaviour tracking from the storefront. Anonymous visitors identify with X-Session-Id
 * (any random 8-64 char id the client keeps in local storage).
 */
router.post(
  '/track',
  optionalAuth,
  rateLimit('track', { capacity: 120, refillPerSecond: 2 }),
  validate(z.object({ eventType: z.enum(CLIENT_EVENTS), eventData: z.record(z.unknown()).optional(), sessionId: z.string().regex(/^[A-Za-z0-9_-]{8,64}$/).optional() })),
  asyncHandler(async (req, res) => {
    const sessionId = req.body.sessionId ?? req.header('X-Session-Id') ?? null;
    if (!req.user && !sessionId) throw AppError.badRequest('Anonymous events need a session id (X-Session-Id header or sessionId)');
    if (sessionId && !/^[A-Za-z0-9_-]{8,64}$/.test(sessionId)) throw AppError.badRequest('Invalid session id');
    if (req.body.eventData && JSON.stringify(req.body.eventData).length > 4000) throw AppError.badRequest('eventData must be under 4 KB');
    const result = await track({ userId: req.user?.id ?? null, sessionId, eventType: req.body.eventType, eventData: req.body.eventData ?? null });
    res.status(201).json({ success: true, data: result });
  }),
);

const rangeQuery = z.object({
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}/).optional(),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}/).optional(),
  groupBy: z.enum(['day', 'week', 'month']).default('day'),
  months: z.coerce.number().int().min(1).max(24).default(6),
  limit: z.coerce.number().int().min(1).max(50).default(10),
});
type RangeQuery = z.infer<typeof rangeQuery>;

router.use(...adminOnly, validate(rangeQuery, 'query'));
const range = (q: RangeQuery) => parseRange(q.startDate, q.endDate);

router.get('/funnel', asyncHandler(async (req, res) => void res.json({ success: true, data: await funnel(range(req.query as unknown as RangeQuery)) })));
router.get('/cohort', asyncHandler(async (req, res) => void res.json({ success: true, data: await cohorts((req.query as unknown as RangeQuery).months) })));
router.get('/sales', asyncHandler(async (req, res) => void res.json({ success: true, data: await sales(range(req.query as unknown as RangeQuery), (req.query as unknown as RangeQuery).groupBy) })));
router.get('/products', asyncHandler(async (req, res) => void res.json({ success: true, data: await productPerformance(range(req.query as unknown as RangeQuery), (req.query as unknown as RangeQuery).limit) })));
router.get('/customers', asyncHandler(async (req, res) => void res.json({ success: true, data: await customerAnalytics(range(req.query as unknown as RangeQuery), (req.query as unknown as RangeQuery).limit) })));
router.get('/inventory', asyncHandler(async (req, res) => void res.json({ success: true, data: await inventory(range(req.query as unknown as RangeQuery)) })));
router.get('/events', asyncHandler(async (req, res) => void res.json({ success: true, data: await eventBreakdown(range(req.query as unknown as RangeQuery)) })));

export default router;
