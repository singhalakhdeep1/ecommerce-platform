import { Router } from 'express';
import { z } from 'zod';
import { adminOnly, optionalAuth } from '../middleware/auth';
import { s, validate } from '../middleware/validate';
import { trackSafe } from '../services/analytics/analyticsService';
import { CARRIERS, SERVICE_TYPES, allQuotes, validateAddress } from '../services/commerce/shipping';
import { calculateTax, supportedJurisdictions } from '../services/commerce/tax';
import { EngineName, configuredEngines, engineStatus, reindex, search } from '../services/search/searchService';
import { asyncHandler } from '../utils/asyncHandler';

/* ---------------- /api/shipping ---------------- */

export const shippingRouter = Router();

shippingRouter.get('/carriers', (_req, res) => {
  res.json({ success: true, data: Object.entries(CARRIERS).map(([code, c]) => ({ code, name: c.name, freeShippingThreshold: c.freeShippingThreshold, deliveryDays: c.deliveryDays })) });
});

shippingRouter.get(
  '/rates',
  validate(
    z.object({
      country: z.string().length(2),
      state: z.string().max(50).optional(),
      weightKg: z.coerce.number().min(0).max(1000).default(1),
      subtotal: z.coerce.number().min(0).default(0),
      serviceType: z.enum(SERVICE_TYPES as [string, ...string[]]).optional(),
    }),
    'query',
  ),
  (req, res) => {
    const q = req.query as unknown as { country: string; state?: string; weightKg: number; subtotal: number; serviceType?: 'ground' };
    res.json({ success: true, data: allQuotes({ weightKg: q.weightKg, subtotal: q.subtotal, serviceType: q.serviceType, address: { country: q.country.toUpperCase(), state: q.state?.toUpperCase() } }) });
  },
);

shippingRouter.post('/validate-address', (req, res) => void res.json({ success: true, data: validateAddress(req.body) }));

/* ---------------- /api/tax ---------------- */

export const taxRouter = Router();
taxRouter.get(
  '/',
  validate(z.object({ country: z.string().length(2), state: z.string().max(10).optional(), amount: z.coerce.number().min(0).default(100) }), 'query'),
  (req, res) => {
    const q = req.query as unknown as { country: string; state?: string; amount: number };
    res.json({ success: true, data: calculateTax(q.amount, { country: q.country, state: q.state }) });
  },
);
taxRouter.get('/jurisdictions', (_req, res) => void res.json({ success: true, data: supportedJurisdictions() }));

/* ---------------- /api/search ---------------- */

export const searchRouter = Router();

searchRouter.get(
  '/',
  optionalAuth,
  validate(
    z.object({
      q: z.string().trim().max(200).default(''),
      engine: z.enum(['postgres', 'elasticsearch', 'algolia', 'meilisearch']).optional(),
      category: s.uuid.optional(),
      minPrice: s.money.optional(),
      maxPrice: s.money.optional(),
      inStock: s.bool.optional(),
      page: s.page,
      limit: s.limit(50, 20),
    }),
    'query',
  ),
  asyncHandler(async (req, res) => {
    const q = req.query as unknown as { q: string; engine?: EngineName; category?: string; minPrice?: number; maxPrice?: number; inStock?: boolean; page: number; limit: number };
    const result = await search({ q: q.q, categoryId: q.category, minPrice: q.minPrice, maxPrice: q.maxPrice, inStock: q.inStock, limit: q.limit, offset: (q.page - 1) * q.limit }, q.engine);
    if (q.q) trackSafe({ userId: req.user?.id ?? null, sessionId: req.header('X-Session-Id') ?? null, eventType: 'search', eventData: { q: q.q, results: result.total, engine: result.engine } });
    res.json({ success: true, data: result, pagination: { page: q.page, limit: q.limit, total: result.total, pages: Math.ceil(result.total / q.limit) } });
  }),
);

/** Instant-search suggestions for the header search box. */
searchRouter.get(
  '/suggest',
  validate(z.object({ q: z.string().trim().min(1).max(100) }), 'query'),
  asyncHandler(async (req, res) => {
    const result = await search({ q: String(req.query.q), limit: 6 });
    res.json({ success: true, data: result.hits.map((h) => ({ id: h.id, name: h.name, slug: h.slug, price: h.price, image: h.image })) });
  }),
);

searchRouter.get('/engines', ...adminOnly, asyncHandler(async (_req, res) => void res.json({ success: true, data: await engineStatus() })));

searchRouter.post(
  '/reindex',
  ...adminOnly,
  validate(z.object({ engine: z.enum(['elasticsearch', 'algolia', 'meilisearch']).optional() })),
  asyncHandler(async (req, res) => {
    res.json({ success: true, data: { configured: configuredEngines(), indexed: await reindex(req.body.engine) } });
  }),
);
