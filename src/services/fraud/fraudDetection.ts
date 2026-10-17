import { createHash } from 'crypto';
import { getKvStore } from '../infra/kvStore';
import { structuredLog } from '../logging/structuredLoggingService';
import type { User } from '../../models/User';
import type { Address } from '../../models/User';

/**
 * Rule-based fraud scoring for checkout, with velocity counters in the shared store (Redis):
 *   orders per user+IP per hour, failed payments per user per day, orders per device per day,
 *   order amount, new account with a large basket, mismatched billing/shipping country, blocklisted countries.
 * Score >= 70 blocks the order, >= 40 flags it for manual review (order.fraudFlag).
 */
export const FRAUD_RULES = {
  maxOrdersPerHour: Number(process.env.FRAUD_MAX_ORDERS_PER_HOUR ?? 5),
  maxOrdersPerDevicePerDay: Number(process.env.FRAUD_MAX_ORDERS_PER_DEVICE_PER_DAY ?? 15),
  largeOrderAmount: Number(process.env.FRAUD_LARGE_ORDER_AMOUNT ?? 5000),
  maxFailedPayments: Number(process.env.FRAUD_MAX_FAILED_PAYMENTS ?? 3),
  blockedCountries: (process.env.FRAUD_BLOCKED_COUNTRIES ?? '').split(',').map((c) => c.trim().toUpperCase()).filter(Boolean),
  blockScore: 70,
  reviewScore: 40,
};

export interface FraudAssessment {
  score: number;
  reasons: string[];
  action: 'allow' | 'review' | 'block';
}

const store = () => getKvStore();
const deviceKey = (userAgent: string) => createHash('sha1').update(userAgent).digest('hex').slice(0, 16);

export async function assessOrder(input: {
  user: User;
  ip: string;
  userAgent: string;
  amount: number;
  shippingAddress: Address;
  billingAddress?: Address | null;
}): Promise<FraudAssessment> {
  const reasons: string[] = [];
  let score = 0;
  if (input.user.role === 'admin') return { score: 0, reasons, action: 'allow' };

  const [recentOrders, failedPayments, deviceOrders] = await Promise.all([
    store().get(`fraud:orders:${input.user.id}:${input.ip}`),
    store().get(`fraud:failed:${input.user.id}`),
    store().get(`fraud:device:${deviceKey(input.userAgent)}`),
  ]).then((values) => values.map((v) => Number(v ?? 0)));

  if (recentOrders >= FRAUD_RULES.maxOrdersPerHour) {
    score += 30;
    reasons.push(`${recentOrders} orders in the last hour`);
  }
  if (input.amount > FRAUD_RULES.largeOrderAmount) {
    score += 25;
    reasons.push('Unusually large order amount');
  }
  if (failedPayments >= FRAUD_RULES.maxFailedPayments) {
    score += 40;
    reasons.push(`${failedPayments} failed payments in the last 24h`);
  }
  const country = input.shippingAddress.country?.toUpperCase();
  if (country && FRAUD_RULES.blockedCountries.includes(country)) {
    score += 35;
    reasons.push(`Shipping to blocked country ${country}`);
  }
  if (deviceOrders > FRAUD_RULES.maxOrdersPerDevicePerDay) {
    score += 20;
    reasons.push('Too many orders from the same device today');
  }
  const accountAgeDays = (Date.now() - new Date(input.user.createdAt).getTime()) / 86_400_000;
  if (accountAgeDays < 1 && input.amount > 500) {
    score += 15;
    reasons.push('New account with a large order');
  }
  const billingCountry = input.billingAddress?.country?.toUpperCase();
  if (billingCountry && country && billingCountry !== country) {
    score += 10;
    reasons.push('Billing and shipping countries differ');
  }

  const action = score >= FRAUD_RULES.blockScore ? 'block' : score >= FRAUD_RULES.reviewScore ? 'review' : 'allow';
  if (action !== 'allow') structuredLog.logAuditEvent('FraudCheck', `Order ${action === 'block' ? 'blocked' : 'flagged for review'}`, { score, reasons, userId: input.user.id });
  return { score, reasons, action };
}

/** Counts an order that passed the check (velocity windows: 1h per user+IP, 24h per device). */
export async function recordOrder(userId: string, ip: string, userAgent: string): Promise<void> {
  await Promise.all([store().incr(`fraud:orders:${userId}:${ip}`, 3600), store().incr(`fraud:device:${deviceKey(userAgent)}`, 86_400)]);
}

export async function recordFailedPayment(userId: string): Promise<number> {
  const count = await store().incr(`fraud:failed:${userId}`, 86_400);
  structuredLog.logAuditEvent('PaymentFailed', 'Failed payment recorded', { userId, count });
  return count;
}

export async function clearFailedPayments(userId: string): Promise<void> {
  await store().del(`fraud:failed:${userId}`);
}

export async function getFraudReport(userId: string) {
  const [orders, failed] = await Promise.all([store().scan(`fraud:orders:${userId}:*`), store().get(`fraud:failed:${userId}`)]);
  const counts = await Promise.all(orders.map((k) => store().get(k)));
  const recentOrders = counts.reduce((sum, v) => sum + Number(v ?? 0), 0);
  const failedPayments = Number(failed ?? 0);
  return {
    userId,
    recentOrders,
    failedPayments,
    riskLevel: failedPayments >= FRAUD_RULES.maxFailedPayments ? 'high' : recentOrders >= 3 ? 'medium' : 'low',
  };
}
