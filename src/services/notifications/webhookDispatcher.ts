import axios from 'axios';
import { createHmac } from 'crypto';
import { Op } from 'sequelize';
import { WebhookDelivery, WebhookSubscription } from '../../models';
import { logger } from '../../utils/logger';

export const WEBHOOK_EVENTS = ['order.created', 'order.paid', 'order.status_changed', 'order.refunded', 'product.low_stock', 'review.created'] as const;
export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number];

const MAX_ATTEMPTS = 5;

export function signPayload(secret: string, body: string, timestamp: number): string {
  return createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex');
}

/**
 * Outgoing webhooks. Each event is stored as a delivery row first (outbox), then POSTed with an
 * HMAC-SHA256 signature over `timestamp.body`. Failures are retried by the background worker with
 * exponential backoff (1, 2, 4, 8 minutes) until MAX_ATTEMPTS, so a receiver outage or an API
 * restart does not lose events.
 *
 * Who receives what: a subscription owned by an admin receives every event of its type; a
 * customer's subscription receives only events about that customer's own orders.
 */
export async function dispatch(event: WebhookEvent, data: Record<string, unknown>, ownerUserId?: string | null): Promise<number> {
  const subscriptions = await WebhookSubscription.findAll({
    where: { event, isActive: true },
    include: [{ association: 'user', attributes: ['id', 'role'] }],
  });
  const targets = subscriptions.filter((s) => {
    const role = (s as unknown as { user?: { role: string } }).user?.role;
    return role === 'admin' || (ownerUserId && s.userId === ownerUserId);
  });
  const deliveries = await Promise.all(
    targets.map((s) =>
      WebhookDelivery.create({ subscriptionId: s.id, event, status: 'pending', payload: { event, createdAt: new Date().toISOString(), data }, nextAttemptAt: new Date() }),
    ),
  );
  await Promise.all(deliveries.map((d) => attemptDelivery(d.id)));
  return deliveries.length;
}

export async function attemptDelivery(deliveryId: string): Promise<WebhookDelivery | null> {
  const delivery = await WebhookDelivery.findByPk(deliveryId, { include: [{ model: WebhookSubscription, as: 'subscription' }] });
  const subscription = (delivery as unknown as { subscription?: WebhookSubscription })?.subscription;
  if (!delivery || !subscription || delivery.status !== 'pending') return delivery;

  const body = JSON.stringify({ id: delivery.id, ...delivery.payload });
  const timestamp = Math.floor(Date.now() / 1000);
  const attempts = delivery.attempts + 1;
  try {
    const response = await axios.post(subscription.targetUrl, body, {
      timeout: 5_000,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'ECommerce-Webhooks/2.0',
        'X-Webhook-Id': delivery.id,
        'X-Webhook-Event': delivery.event,
        'X-Webhook-Timestamp': String(timestamp),
        'X-Webhook-Signature': `sha256=${signPayload(subscription.secret, body, timestamp)}`,
      },
      validateStatus: () => true,
    });
    if (response.status >= 200 && response.status < 300) {
      return delivery.update({ status: 'delivered', attempts, responseStatus: response.status, lastError: null, nextAttemptAt: null });
    }
    return scheduleRetry(delivery, attempts, `HTTP ${response.status}`, response.status);
  } catch (error) {
    return scheduleRetry(delivery, attempts, error instanceof Error ? error.message : String(error), null);
  }
}

async function scheduleRetry(delivery: WebhookDelivery, attempts: number, error: string, status: number | null): Promise<WebhookDelivery> {
  const giveUp = attempts >= MAX_ATTEMPTS;
  if (giveUp) logger.warn('Webhook delivery failed permanently', { deliveryId: delivery.id, error });
  return delivery.update({
    attempts,
    responseStatus: status,
    lastError: error.slice(0, 1000),
    status: giveUp ? 'failed' : 'pending',
    nextAttemptAt: giveUp ? null : new Date(Date.now() + 60_000 * 2 ** (attempts - 1)),
  });
}

/** Called by the job runner: retries every pending delivery whose backoff has elapsed. */
export async function retryDueDeliveries(): Promise<number> {
  const due = await WebhookDelivery.findAll({
    where: { status: 'pending', nextAttemptAt: { [Op.lte]: new Date() } },
    limit: 50,
    order: [['nextAttemptAt', 'ASC']],
  });
  for (const d of due) await attemptDelivery(d.id);
  return due.length;
}
