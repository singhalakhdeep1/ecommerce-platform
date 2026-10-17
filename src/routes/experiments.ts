import { Request, Router } from 'express';
import { z } from 'zod';
import { AbExperiment } from '../models';
import { adminOnly, optionalAuth } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { assignVariant, experimentStats, trackConversion } from '../services/analytics/abTesting';
import { AppError } from '../utils/appError';
import { asyncHandler } from '../utils/asyncHandler';

const router = Router();
const keyParam = z.object({ key: z.string().regex(/^[a-z0-9_-]{2,80}$/) });

/** Signed-in users are bucketed by user id, guests by their X-Session-Id. */
function subject(req: Request): string {
  if (req.user) return req.user.id;
  const sessionId = req.header('X-Session-Id');
  if (!sessionId || !/^[A-Za-z0-9_-]{8,64}$/.test(sessionId)) throw AppError.badRequest('Send X-Session-Id (8-64 chars) or sign in');
  return `session:${sessionId}`;
}

router.get(
  '/',
  optionalAuth,
  asyncHandler(async (req, res) => {
    const where = req.user?.role === 'admin' ? {} : { active: true };
    res.json({ success: true, data: await AbExperiment.findAll({ where, order: [['createdAt', 'DESC']] }) });
  }),
);

router.get(
  '/:key/assignment',
  optionalAuth,
  validate(keyParam, 'params'),
  asyncHandler(async (req, res) => {
    res.json({ success: true, data: await assignVariant(req.params.key, subject(req)) });
  }),
);

router.post(
  '/:key/convert',
  optionalAuth,
  validate(keyParam, 'params'),
  asyncHandler(async (req, res) => {
    const counted = await trackConversion(req.params.key, subject(req));
    if (!counted) throw AppError.badRequest('Not enrolled in this experiment: request an assignment first');
    res.json({ success: true, data: { counted } });
  }),
);

router.get('/:key/stats', ...adminOnly, validate(keyParam, 'params'), asyncHandler(async (req, res) => void res.json({ success: true, data: await experimentStats(req.params.key) })));

const experimentSchema = z.object({
  key: z.string().regex(/^[a-z0-9_-]{2,80}$/),
  name: z.string().trim().min(2).max(160),
  description: z.string().max(2000).nullable().optional(),
  variants: z.array(z.string().trim().min(1).max(40)).min(2).max(10).refine((v) => new Set(v).size === v.length, 'Variants must be unique'),
  active: z.boolean().default(true),
});

router.post(
  '/',
  ...adminOnly,
  validate(experimentSchema),
  asyncHandler(async (req, res) => {
    if (await AbExperiment.findByPk(req.body.key)) throw AppError.conflict('An experiment with this key exists');
    res.status(201).json({ success: true, data: await AbExperiment.create(req.body) });
  }),
);

router.patch(
  '/:key',
  ...adminOnly,
  validate(keyParam, 'params'),
  validate(experimentSchema.pick({ name: true, description: true, active: true }).partial()),
  asyncHandler(async (req, res) => {
    const experiment = await AbExperiment.findByPk(req.params.key);
    if (!experiment) throw AppError.notFound('Experiment not found');
    res.json({ success: true, data: await experiment.update(req.body) });
  }),
);

router.delete(
  '/:key',
  ...adminOnly,
  validate(keyParam, 'params'),
  asyncHandler(async (req, res) => {
    const removed = await AbExperiment.destroy({ where: { key: req.params.key } });
    if (!removed) throw AppError.notFound('Experiment not found');
    res.json({ success: true, message: 'Experiment and its assignments deleted' });
  }),
);

export default router;
