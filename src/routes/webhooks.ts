import { randomBytes } from 'crypto';
import { promises as dns } from 'dns';
import { Router } from 'express';
import net from 'net';
import { z } from 'zod';
import { env } from '../config/env';
import { WebhookDelivery, WebhookSubscription } from '../models';
import { protect } from '../middleware/auth';
import { s, validate } from '../middleware/validate';
import { WEBHOOK_EVENTS, attemptDelivery } from '../services/notifications/webhookDispatcher';
import { AppError } from '../utils/appError';
import { asyncHandler } from '../utils/asyncHandler';

const router = Router();
router.use(protect);

function isPrivateAddress(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127);
  }
  const v6 = ip.toLowerCase();
  return v6 === '::1' || v6 === '::' || v6.startsWith('fc') || v6.startsWith('fd') || v6.startsWith('fe80') || v6.startsWith('::ffff:127.') || v6.startsWith('::ffff:10.') || v6.startsWith('::ffff:192.168.');
}

/** Blocks webhook targets on internal networks (SSRF), unless WEBHOOK_ALLOW_PRIVATE=true (local development). */
async function assertPublicTarget(url: string): Promise<void> {
  const parsed = new URL(url);
  if (!['http:', 'https:'].includes(parsed.protocol)) throw AppError.badRequest('Webhook URL must be http(s)');
  if (env.isProduction && parsed.protocol !== 'https:') throw AppError.badRequest('Webhook URL must use https');
  if (process.env.WEBHOOK_ALLOW_PRIVATE === 'true') return;
  const host = parsed.hostname.replace(/^\[|\]$/g, '');
  const addresses = net.isIP(host) ? [host] : (await dns.lookup(host, { all: true }).catch(() => [])).map((a) => a.address);
  if (addresses.length === 0) throw AppError.badRequest('Webhook host does not resolve');
  if (addresses.some(isPrivateAddress) || host === 'localhost') throw AppError.badRequest('Webhook URL must not point to a private or loopback address');
}

const owned = async (id: string, userId: string, isAdmin: boolean) => {
  const sub = await WebhookSubscription.findByPk(id);
  if (!sub || (sub.userId !== userId && !isAdmin)) throw AppError.notFound('Webhook subscription not found');
  return sub;
};

router.get('/events', (_req, res) => void res.json({ success: true, data: WEBHOOK_EVENTS }));

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const subs = await WebhookSubscription.findAll({ where: { userId: req.user!.id }, attributes: { exclude: ['secret'] }, order: [['createdAt', 'DESC']] });
    res.json({ success: true, data: subs });
  }),
);

/** The signing secret is returned once, at creation. Customers receive events about their own orders; admin subscriptions receive all. */
router.post(
  '/',
  validate(z.object({ targetUrl: z.string().url().max(2048), event: z.enum(WEBHOOK_EVENTS) })),
  asyncHandler(async (req, res) => {
    if (req.user!.role !== 'admin' && ['product.low_stock', 'review.created'].includes(req.body.event)) throw AppError.forbidden('Only admins can subscribe to store-wide events');
    await assertPublicTarget(req.body.targetUrl);
    const secret = `whsec_${randomBytes(24).toString('hex')}`;
    const sub = await WebhookSubscription.create({ userId: req.user!.id, targetUrl: req.body.targetUrl, event: req.body.event, secret });
    res.status(201).json({ success: true, data: { ...sub.toJSON(), secret } });
  }),
);

router.patch(
  '/:id',
  validate(s.idParam, 'params'),
  validate(z.object({ isActive: z.boolean() })),
  asyncHandler(async (req, res) => {
    const sub = await owned(req.params.id, req.user!.id, req.user!.role === 'admin');
    await sub.update({ isActive: req.body.isActive });
    res.json({ success: true, data: { id: sub.id, isActive: sub.isActive } });
  }),
);

router.delete(
  '/:id',
  validate(s.idParam, 'params'),
  asyncHandler(async (req, res) => {
    const sub = await owned(req.params.id, req.user!.id, req.user!.role === 'admin');
    await sub.destroy();
    res.json({ success: true, message: 'Webhook subscription deleted' });
  }),
);

router.get(
  '/:id/deliveries',
  validate(s.idParam, 'params'),
  asyncHandler(async (req, res) => {
    const sub = await owned(req.params.id, req.user!.id, req.user!.role === 'admin');
    const deliveries = await WebhookDelivery.findAll({ where: { subscriptionId: sub.id }, order: [['createdAt', 'DESC']], limit: 100 });
    res.json({ success: true, data: deliveries });
  }),
);

/** Sends a signed `ping` to check the receiver. */
router.post(
  '/:id/test',
  validate(s.idParam, 'params'),
  asyncHandler(async (req, res) => {
    const sub = await owned(req.params.id, req.user!.id, req.user!.role === 'admin');
    const delivery = await WebhookDelivery.create({ subscriptionId: sub.id, event: 'ping', status: 'pending', payload: { event: 'ping', createdAt: new Date().toISOString(), data: { message: 'Test delivery' } }, nextAttemptAt: new Date() });
    res.json({ success: true, data: await attemptDelivery(delivery.id) });
  }),
);

router.post(
  '/deliveries/:id/redeliver',
  validate(s.idParam, 'params'),
  asyncHandler(async (req, res) => {
    const delivery = await WebhookDelivery.findByPk(req.params.id);
    if (!delivery) throw AppError.notFound('Delivery not found');
    await owned(delivery.subscriptionId, req.user!.id, req.user!.role === 'admin');
    await delivery.update({ status: 'pending', attempts: 0, nextAttemptAt: new Date() });
    res.json({ success: true, data: await attemptDelivery(delivery.id) });
  }),
);

export default router;
