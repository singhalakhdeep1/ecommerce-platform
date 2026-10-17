import { Router } from 'express';
import Stripe from 'stripe';
import { z } from 'zod';
import { env } from '../config/env';
import { Order, ProcessedWebhookEvent, User } from '../models';
import { adminOnly, protect } from '../middleware/auth';
import { idempotent } from '../middleware/idempotency';
import { s, validate } from '../middleware/validate';
import { capturePaypal, confirmCardPayment, getOwnedOrder, markPaid, markPaymentFailed, refundOrder, startPayment } from '../services/commerce/orderService';
import { structuredLog } from '../services/logging/structuredLoggingService';
import { SandboxPaymentStrategy, StripePaymentStrategy, payments } from '../services/patterns/paymentStrategy';
import { AppError } from '../utils/appError';
import { asyncHandler } from '../utils/asyncHandler';
import { logger } from '../utils/logger';

const router = Router();

/** What the storefront needs to render the payment step. */
router.get('/config', (_req, res) => {
  const card = payments.has('stripe') ? 'stripe' : payments.has('sandbox') ? 'sandbox' : null;
  res.json({
    success: true,
    data: {
      cardProvider: card,
      stripePublishableKey: card === 'stripe' ? env.payments.stripePublishableKey || null : null,
      paypalEnabled: payments.has('paypal'),
      sandboxTestMethods: card === 'sandbox' ? Object.entries(SandboxPaymentStrategy.TEST_METHODS).map(([id, o]) => ({ id, succeeds: o.ok, description: o.message })) : [],
      currency: 'USD',
    },
  });
});

const orderIdBody = z.object({ orderId: s.uuid });

/** Starts a card payment for an unpaid order: a Stripe PaymentIntent (client secret for Stripe.js) or a sandbox intent. */
router.post(
  '/create-intent',
  protect,
  idempotent('payment-intent'),
  validate(orderIdBody),
  asyncHandler(async (req, res) => {
    const order = await getOwnedOrder(req.body.orderId, req.user!);
    if (order.paymentMethod !== 'card') throw AppError.badRequest('This order is paid with PayPal');
    const session = await startPayment(order, req.user!);
    res.json({ success: true, data: { ...session, paymentIntentId: session.providerRef, amount: Number(order.totalAmount), currency: order.currency } });
  }),
);

/**
 * Confirms a card payment server-side. Sandbox: `paymentMethod` is a test id (pm_card_visa...).
 * Stripe: re-reads the PaymentIntent after Stripe.js confirmed it (webhooks remain the source of truth).
 */
router.post(
  '/confirm',
  protect,
  validate(orderIdBody.extend({ paymentMethod: z.string().max(64).optional() })),
  asyncHandler(async (req, res) => {
    const order = await getOwnedOrder(req.body.orderId, req.user!);
    const paid = await confirmCardPayment(order, req.body.paymentMethod);
    res.json({ success: true, data: paid });
  }),
);

/** Stripe webhook (raw body + signature verified). Events are processed once (processed_webhook_events). */
router.post(
  '/webhook',
  asyncHandler(async (req, res) => {
    const stripeStrategy = payments.has('stripe') ? (payments.getStrategy('stripe') as StripePaymentStrategy) : null;
    if (!stripeStrategy || !env.payments.stripeWebhookSecret) throw AppError.unavailable('Stripe webhooks are not configured');
    let event: Stripe.Event;
    try {
      event = stripeStrategy.client.webhooks.constructEvent(req.rawBody ?? Buffer.from(''), req.header('stripe-signature') ?? '', env.payments.stripeWebhookSecret);
    } catch (error) {
      structuredLog.logAuditEvent('WebhookRejected', 'Invalid Stripe signature', { error: error instanceof Error ? error.message : String(error) });
      throw AppError.badRequest('Invalid Stripe signature');
    }
    const [, created] = await ProcessedWebhookEvent.findOrCreate({ where: { eventId: event.id }, defaults: { eventId: event.id, provider: 'stripe', type: event.type } });
    if (!created) return void res.json({ received: true, duplicate: true });

    try {
      if (event.type === 'payment_intent.succeeded' || event.type === 'payment_intent.payment_failed') {
        const intent = event.data.object as Stripe.PaymentIntent;
        const order = await Order.findOne({ where: { stripePaymentIntentId: intent.id } });
        if (!order) logger.warn('Stripe event for unknown payment intent', { intent: intent.id });
        else if (event.type === 'payment_intent.succeeded') await markPaid(order, 'stripe', intent.id, intent.amount_received / 100);
        else await markPaymentFailed(order, 'stripe', intent.last_payment_error?.message ?? 'payment failed');
      } else if (event.type === 'charge.refunded') {
        logger.info('Stripe charge refunded', { charge: (event.data.object as Stripe.Charge).id });
      } else {
        logger.debug(`Unhandled Stripe event ${event.type}`);
      }
    } catch (error) {
      // Let Stripe retry: forget the event so the retry is processed.
      await ProcessedWebhookEvent.destroy({ where: { eventId: event.id } });
      throw error;
    }
    res.json({ received: true });
  }),
);

const refundSchema = z.object({
  amount: s.money.optional(),
  reason: z.string().max(500).optional(),
  restock: z.boolean().optional(),
});

const refund = asyncHandler(async (req, res) => {
  const orderId = req.params.orderId ?? req.body.orderId;
  if (!z.string().uuid().safeParse(orderId).success) throw AppError.badRequest('orderId is required');
  const order = await refundOrder(orderId, { amount: req.body.amount, reason: req.body.reason, restock: req.body.restock, actorId: req.user!.id });
  res.json({ success: true, message: 'Refund processed', data: order });
});
router.post('/refund/:orderId', ...adminOnly, idempotent('refund'), validate(refundSchema), refund);
router.post('/refund', ...adminOnly, idempotent('refund'), validate(refundSchema.extend({ orderId: s.uuid })), refund);

/** PayPal: create the PayPal order and return the approval link. */
router.post(
  '/paypal/create',
  protect,
  validate(orderIdBody),
  asyncHandler(async (req, res) => {
    const order = await getOwnedOrder(req.body.orderId, req.user!);
    if (order.paymentMethod !== 'paypal') throw AppError.badRequest('This order is paid by card');
    const session = await startPayment(order, req.user!);
    res.json({ success: true, data: { paypalOrderId: session.providerRef, approvalUrl: session.approvalUrl } });
  }),
);

/** PayPal: capture after the buyer approved (the storefront's return page calls this). */
router.post(
  '/paypal/capture',
  protect,
  validate(z.object({ paypalOrderId: z.string().min(5).max(64) })),
  asyncHandler(async (req, res) => {
    const order = await capturePaypal(req.body.paypalOrderId, req.user as User);
    res.json({ success: true, status: order.paymentStatus, data: order });
  }),
);

export default router;
