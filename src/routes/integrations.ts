import { Router } from 'express';
import { z } from 'zod';
import { Order, ProcessedWebhookEvent } from '../models';
import { adminOnly } from '../middleware/auth';
import { s, validate } from '../middleware/validate';
import { createShippoLabel, integrationStatus, klaviyoTrack, mailchimpSubscribe, verifyInboundSignature } from '../services/integrations/thirdParty';
import { structuredLog } from '../services/logging/structuredLoggingService';
import { updateStatus } from '../services/commerce/orderService';
import { AppError } from '../utils/appError';
import { asyncHandler } from '../utils/asyncHandler';

const router = Router();

/**
 * Inbound partner webhook (e.g. a 3PL/warehouse reporting fulfilment). Signed with
 * INTEGRATION_WEBHOOK_SECRET: X-Timestamp + X-Signature: sha256=HMAC(secret, `${timestamp}.${rawBody}`).
 * Supported events: order.shipped {orderId, trackingNumber, carrier}, order.delivered {orderId}.
 */
router.post(
  '/webhook',
  asyncHandler(async (req, res) => {
    if (!verifyInboundSignature(req.rawBody ?? Buffer.from(''), req.header('X-Signature'), req.header('X-Timestamp'))) {
      structuredLog.logAuditEvent('WebhookRejected', 'Inbound integration webhook with a bad signature');
      throw AppError.unauthorized('Invalid webhook signature');
    }
    const body = z
      .object({ id: z.string().min(1).max(128), event: z.enum(['order.shipped', 'order.delivered']), data: z.object({ orderId: s.uuid, trackingNumber: z.string().max(64).optional(), carrier: z.string().max(32).optional() }) })
      .parse(req.body);
    const [, created] = await ProcessedWebhookEvent.findOrCreate({ where: { eventId: `integration:${body.id}` }, defaults: { eventId: `integration:${body.id}`, provider: 'integration', type: body.event } });
    if (!created) return void res.json({ success: true, duplicate: true });
    const order = await Order.findByPk(body.data.orderId);
    if (!order) throw AppError.notFound('Order not found');
    const system = { id: null, role: 'admin' } as never;
    const updated = await updateStatus(
      order.id,
      body.event === 'order.shipped'
        ? { status: 'shipped', trackingNumber: body.data.trackingNumber, shippingProvider: body.data.carrier?.toLowerCase(), note: 'Reported by fulfilment partner' }
        : { status: 'delivered', note: 'Reported by fulfilment partner' },
      system,
    );
    res.json({ success: true, data: { orderId: updated.id, status: updated.status } });
  }),
);

router.use(...adminOnly);

router.get('/status', (_req, res) => void res.json({ success: true, data: integrationStatus() }));

/** Buys a shipping label with Shippo and marks the order shipped. */
router.post(
  '/shippo',
  validate(z.object({ orderId: s.uuid })),
  asyncHandler(async (req, res) => {
    const order = await Order.findByPk(req.body.orderId);
    if (!order) throw AppError.notFound('Order not found');
    if (order.status !== 'processing') throw AppError.conflict('Only processing orders can be shipped');
    const label = await createShippoLabel(order);
    await updateStatus(order.id, { status: 'shipped', trackingNumber: label.trackingNumber, note: `Shippo label (${label.carrier}, ${label.amount})` }, req.user!);
    await order.reload();
    await order.update({ labelUrl: label.labelUrl });
    res.json({ success: true, data: label });
  }),
);

router.post(
  '/mailchimp',
  validate(z.object({ email: z.string().email(), listId: z.string().min(1).max(50), mergeFields: z.record(z.string()).optional() })),
  asyncHandler(async (req, res) => void res.json({ success: true, data: await mailchimpSubscribe(req.body.email, req.body.listId, req.body.mergeFields) })),
);

router.post(
  '/klaviyo',
  validate(z.object({ email: z.string().email(), eventName: z.string().min(1).max(100), properties: z.record(z.unknown()).optional(), value: z.number().optional() })),
  asyncHandler(async (req, res) => void res.json({ success: true, data: await klaviyoTrack(req.body.email, req.body.eventName, req.body.properties, req.body.value) })),
);

export default router;
