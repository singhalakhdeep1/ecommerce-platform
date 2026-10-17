import { Router } from 'express';
import Stripe from 'stripe';
import { z } from 'zod';
import { env } from '../config/env';
import { ProcessedWebhookEvent, Subscription } from '../models';
import { protect } from '../middleware/auth';
import { s, validate } from '../middleware/validate';
import { applyStripeEvent, cancel, isMember, plans, resume, subscribe } from '../services/commerce/subscriptionService';
import { StripePaymentStrategy, payments } from '../services/patterns/paymentStrategy';
import { AppError } from '../utils/appError';
import { asyncHandler } from '../utils/asyncHandler';

const router = Router();

router.get('/plans', (_req, res) => {
  res.json({ success: true, data: plans().map(({ stripePriceId, ...p }) => ({ ...p, billing: stripePriceId && payments.has('stripe') ? 'stripe' : 'sandbox' })) });
});

router.get(
  '/',
  protect,
  asyncHandler(async (req, res) => {
    const subscriptions = await Subscription.findAll({ where: { userId: req.user!.id }, order: [['createdAt', 'DESC']] });
    const catalog = plans();
    res.json({
      success: true,
      data: subscriptions.map((sub) => ({ ...sub.toJSON(), plan: catalog.find((p) => p.id === sub.planId) ?? null })),
      member: await isMember(req.user!.id),
    });
  }),
);

const create = asyncHandler(async (req, res) => {
  const result = await subscribe(req.user!, req.body.planId ?? req.body.priceId);
  res.status(result.mode === 'sandbox' ? 201 : 200).json({ success: true, ...result });
});
const createSchema = z.object({ planId: z.string().max(100).optional(), priceId: z.string().max(100).optional() }).refine((b) => b.planId || b.priceId, 'planId is required');
router.post('/', protect, validate(createSchema), create);
router.post('/create', protect, validate(createSchema), create);

router.post(
  '/:id/cancel',
  protect,
  validate(s.idParam, 'params'),
  validate(z.object({ atPeriodEnd: z.boolean().default(true) })),
  asyncHandler(async (req, res) => {
    res.json({ success: true, data: await cancel(req.user!, req.params.id, req.body.atPeriodEnd) });
  }),
);

router.post(
  '/:id/resume',
  protect,
  validate(s.idParam, 'params'),
  asyncHandler(async (req, res) => {
    res.json({ success: true, data: await resume(req.user!, req.params.id) });
  }),
);

/** Stripe Billing webhook (customer.subscription.*, invoice.payment_failed). */
router.post(
  '/webhook',
  asyncHandler(async (req, res) => {
    const secret = env.payments.stripeBillingWebhookSecret || env.payments.stripeWebhookSecret;
    if (!payments.has('stripe') || !secret) throw AppError.unavailable('Stripe billing webhooks are not configured');
    let event: Stripe.Event;
    try {
      event = (payments.getStrategy('stripe') as StripePaymentStrategy).client.webhooks.constructEvent(req.rawBody ?? Buffer.from(''), req.header('stripe-signature') ?? '', secret);
    } catch {
      throw AppError.badRequest('Invalid Stripe signature');
    }
    const [, created] = await ProcessedWebhookEvent.findOrCreate({ where: { eventId: event.id }, defaults: { eventId: event.id, provider: 'stripe-billing', type: event.type } });
    if (!created) return void res.json({ received: true, duplicate: true });
    try {
      await applyStripeEvent(event);
    } catch (error) {
      await ProcessedWebhookEvent.destroy({ where: { eventId: event.id } });
      throw error;
    }
    res.json({ received: true });
  }),
);

export default router;
