import axios from 'axios';
import { createHash, createHmac, timingSafeEqual } from 'crypto';
import { env } from '../../config/env';
import { Order, OrderItem, Product } from '../../models';
import type { Address } from '../../models/User';
import { AppError } from '../../utils/appError';
import { logger } from '../../utils/logger';
import { resilience } from '../errorHandling/errorHandlingService';
import { payments } from '../patterns/paymentStrategy';

const SHIPPO = 'https://api.goshippo.com';

const warehouse = (): Record<string, string> => ({
  name: process.env.WAREHOUSE_NAME ?? 'E-Commerce Warehouse',
  street1: process.env.WAREHOUSE_STREET ?? '215 Clayton St',
  city: process.env.WAREHOUSE_CITY ?? 'San Francisco',
  state: process.env.WAREHOUSE_STATE ?? 'CA',
  zip: process.env.WAREHOUSE_ZIP ?? '94117',
  country: process.env.WAREHOUSE_COUNTRY ?? 'US',
  email: env.email.adminEmail,
});

function shippoAddress(a: Address): Record<string, string> {
  return { name: a.name ?? '', street1: a.address ?? a.street ?? '', city: a.city ?? '', state: a.state ?? '', zip: a.zip ?? '', country: a.country ?? 'US' };
}

function shippoHeaders() {
  return { Authorization: `ShippoToken ${env.integrations.shippoToken}`, 'Content-Type': 'application/json' };
}

/**
 * Buys the cheapest label for an order through Shippo (shipment -> rates -> transaction) and returns
 * the carrier tracking number and label PDF URL.
 */
export async function createShippoLabel(order: Order): Promise<{ trackingNumber: string; labelUrl: string; carrier: string; amount: string }> {
  if (!env.integrations.shippoToken) throw AppError.badRequest('Shippo is not configured (SHIPPO_API_TOKEN)');
  const items = await OrderItem.findAll({ where: { orderId: order.id } });
  const products = await Product.findAll({ where: { id: items.map((i) => i.productId).filter(Boolean) as string[] } });
  const weightKg = items.reduce((sum, i) => sum + Number(products.find((p) => p.id === i.productId)?.weight ?? 0.5) * i.quantity, 0);
  const breaker = resilience('shippo');
  const shipment = await breaker.executeWithResilience(() =>
    axios.post(
      `${SHIPPO}/shipments/`,
      {
        address_from: warehouse(),
        address_to: shippoAddress(order.shippingAddress),
        parcels: [{ length: '30', width: '20', height: '15', distance_unit: 'cm', weight: Math.max(0.1, weightKg).toFixed(2), mass_unit: 'kg' }],
        async: false,
      },
      { headers: shippoHeaders(), timeout: 20_000 },
    ),
  );
  const rates = (shipment.data.rates ?? []) as Array<{ object_id: string; amount: string; provider: string }>;
  if (!rates.length) throw AppError.badGateway('Shippo returned no rates for this address');
  const preferred = order.shippingProvider ? rates.filter((r) => r.provider.toLowerCase().includes(order.shippingProvider!.toLowerCase())) : [];
  const rate = (preferred.length ? preferred : rates).sort((a, b) => Number(a.amount) - Number(b.amount))[0];
  const transaction = await breaker.executeWithResilience(() =>
    axios.post(`${SHIPPO}/transactions/`, { rate: rate.object_id, label_file_type: 'PDF', async: false }, { headers: shippoHeaders(), timeout: 20_000 }),
  );
  if (transaction.data.status !== 'SUCCESS') throw AppError.badGateway(`Shippo could not buy the label: ${JSON.stringify(transaction.data.messages ?? [])}`);
  return { trackingNumber: transaction.data.tracking_number, labelUrl: transaction.data.label_url, carrier: rate.provider, amount: rate.amount };
}

/** Live carrier events from Shippo tracking; null when Shippo is not configured or the lookup fails. */
export async function shippoTracking(carrier: string, trackingNumber: string) {
  if (!env.integrations.shippoToken) return null;
  try {
    const { data } = await resilience('shippo').executeWithResilience(() =>
      axios.get(`${SHIPPO}/tracks/${encodeURIComponent(carrier)}/${encodeURIComponent(trackingNumber)}`, { headers: shippoHeaders(), timeout: 10_000 }),
    );
    return {
      status: data.tracking_status?.status ?? null,
      eta: data.eta ?? null,
      history: ((data.tracking_history ?? []) as Array<{ status: string; status_details: string; status_date: string; location?: { city?: string } }>).map((h) => ({
        status: h.status,
        details: h.status_details,
        at: h.status_date,
        location: h.location?.city ?? null,
      })),
    };
  } catch (error) {
    logger.warn('Shippo tracking lookup failed', { error: error instanceof Error ? error.message : String(error) });
    return null;
  }
}

/** Adds or updates a list member (PUT by subscriber hash is idempotent, unlike POST). */
export async function mailchimpSubscribe(email: string, listId: string, mergeFields: Record<string, string> = {}) {
  if (!env.integrations.mailchimpApiKey) throw AppError.badRequest('Mailchimp is not configured (MAILCHIMP_API_KEY)');
  const hash = createHash('md5').update(email.toLowerCase()).digest('hex');
  const { data } = await resilience('mailchimp').executeWithResilience(() =>
    axios.put(
      `https://${env.integrations.mailchimpDataCenter}.api.mailchimp.com/3.0/lists/${encodeURIComponent(listId)}/members/${hash}`,
      { email_address: email, status_if_new: 'subscribed', merge_fields: mergeFields },
      { auth: { username: 'anystring', password: env.integrations.mailchimpApiKey }, timeout: 10_000 },
    ),
  );
  return { id: data.id, status: data.status, email: data.email_address };
}

/** Klaviyo Events API (2024-10-15 revision): metric by name, profile by email. */
export async function klaviyoTrack(email: string, eventName: string, properties: Record<string, unknown> = {}, value?: number) {
  if (!env.integrations.klaviyoApiKey) throw AppError.badRequest('Klaviyo is not configured (KLAVIYO_API_KEY)');
  await resilience('klaviyo').executeWithResilience(() =>
    axios.post(
      'https://a.klaviyo.com/api/events/',
      {
        data: {
          type: 'event',
          attributes: {
            properties,
            ...(value !== undefined ? { value } : {}),
            time: new Date().toISOString(),
            metric: { data: { type: 'metric', attributes: { name: eventName } } },
            profile: { data: { type: 'profile', attributes: { email } } },
          },
        },
      },
      { headers: { Authorization: `Klaviyo-API-Key ${env.integrations.klaviyoApiKey}`, revision: '2024-10-15', 'Content-Type': 'application/json' }, timeout: 10_000 },
    ),
  );
  return { tracked: true, eventName, email };
}

export function integrationStatus() {
  return {
    stripe: { configured: payments.has('stripe'), mode: payments.has('stripe') ? (env.payments.stripeSecretKey.startsWith('sk_live') ? 'live' : 'test') : 'sandbox fallback' },
    paypal: { configured: payments.has('paypal'), baseUrl: env.payments.paypalBaseUrl },
    shippo: { configured: Boolean(env.integrations.shippoToken) },
    mailchimp: { configured: Boolean(env.integrations.mailchimpApiKey), dataCenter: env.integrations.mailchimpDataCenter },
    klaviyo: { configured: Boolean(env.integrations.klaviyoApiKey) },
    smtp: { configured: Boolean(env.email.host) },
  };
}

/** Verifies an inbound partner webhook: `X-Signature: sha256=<hmac(INTEGRATION_WEBHOOK_SECRET, timestamp.body)>`, max 5 minutes old. */
export function verifyInboundSignature(rawBody: Buffer, signatureHeader: string | undefined, timestampHeader: string | undefined): boolean {
  const secret = process.env.INTEGRATION_WEBHOOK_SECRET;
  if (!secret || !signatureHeader || !timestampHeader) return false;
  const timestamp = Number(timestampHeader);
  if (!Number.isFinite(timestamp) || Math.abs(Date.now() / 1000 - timestamp) > 300) return false;
  const expected = `sha256=${createHmac('sha256', secret).update(`${timestamp}.`).update(rawBody).digest('hex')}`;
  const a = Buffer.from(expected);
  const b = Buffer.from(signatureHeader);
  return a.length === b.length && timingSafeEqual(a, b);
}
