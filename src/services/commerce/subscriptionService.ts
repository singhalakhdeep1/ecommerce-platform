import { Op } from 'sequelize';
import Stripe from 'stripe';
import { env } from '../../config/env';
import { Subscription, User } from '../../models';
import { AppError } from '../../utils/appError';
import { logger } from '../../utils/logger';
import { StripePaymentStrategy, payments } from '../patterns/paymentStrategy';

export interface Plan {
  id: string;
  name: string;
  price: number;
  interval: 'month' | 'year';
  stripePriceId: string | null;
  perks: string[];
}

/**
 * Store membership plans. Members get free shipping on every order (applied in cart pricing).
 * Override with SUBSCRIPTION_PLANS='[{"id":...,"stripePriceId":"price_..."}]'.
 */
export function plans(): Plan[] {
  if (process.env.SUBSCRIPTION_PLANS) {
    try {
      return JSON.parse(process.env.SUBSCRIPTION_PLANS) as Plan[];
    } catch {
      logger.error('SUBSCRIPTION_PLANS is not valid JSON; using defaults');
    }
  }
  return [
    { id: 'member-monthly', name: 'Member (monthly)', price: 9.99, interval: 'month', stripePriceId: process.env.STRIPE_PRICE_MEMBER_MONTHLY ?? null, perks: ['Free shipping on every order', 'Early access to sales'] },
    { id: 'member-yearly', name: 'Member (yearly)', price: 99, interval: 'year', stripePriceId: process.env.STRIPE_PRICE_MEMBER_YEARLY ?? null, perks: ['Free shipping on every order', 'Early access to sales', 'Two months free'] },
  ];
}

const ACTIVE = ['active', 'trialing'];

export async function isMember(userId: string | null | undefined): Promise<boolean> {
  if (!userId) return false;
  return (await Subscription.count({ where: { userId, status: { [Op.in]: ACTIVE }, currentPeriodEnd: { [Op.gt]: new Date() } } })) > 0;
}

function addInterval(from: Date, interval: 'month' | 'year'): Date {
  const d = new Date(from);
  if (interval === 'month') d.setMonth(d.getMonth() + 1);
  else d.setFullYear(d.getFullYear() + 1);
  return d;
}

function stripe(): Stripe | null {
  return payments.has('stripe') ? (payments.getStrategy('stripe') as StripePaymentStrategy).client : null;
}

/** Stripe Checkout in subscription mode when the plan has a Stripe price; otherwise an immediately active sandbox membership. */
export async function subscribe(user: User, planId: string) {
  const plan = plans().find((p) => p.id === planId || p.stripePriceId === planId);
  if (!plan) throw AppError.badRequest('Unknown plan');
  if (await isMember(user.id)) throw AppError.conflict('You already have an active membership');
  const client = stripe();
  if (client && plan.stripePriceId) {
    let customerId = user.stripeCustomerId;
    if (!customerId) {
      const customer = await client.customers.create({ email: user.email, name: user.name, metadata: { userId: user.id } });
      customerId = customer.id;
      await user.update({ stripeCustomerId: customerId });
    }
    const session = await client.checkout.sessions.create({
      customer: customerId,
      mode: 'subscription',
      line_items: [{ price: plan.stripePriceId, quantity: 1 }],
      success_url: `${env.clientUrl}/account/subscription?status=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${env.clientUrl}/account/subscription?status=cancelled`,
      metadata: { userId: user.id, planId: plan.id },
    });
    return { mode: 'stripe' as const, sessionId: session.id, checkoutUrl: session.url };
  }
  const now = new Date();
  const subscription = await Subscription.create({ userId: user.id, planId: plan.id, status: 'active', currentPeriodStart: now, currentPeriodEnd: addInterval(now, plan.interval) });
  return { mode: 'sandbox' as const, subscription };
}

export async function cancel(user: User, subscriptionId: string, atPeriodEnd: boolean) {
  const subscription = await Subscription.findByPk(subscriptionId);
  if (!subscription || (subscription.userId !== user.id && user.role !== 'admin')) throw AppError.notFound('Subscription not found');
  if (subscription.status === 'canceled') throw AppError.conflict('Subscription is already cancelled');
  const client = stripe();
  if (subscription.stripeSubscriptionId && client) {
    if (atPeriodEnd) await client.subscriptions.update(subscription.stripeSubscriptionId, { cancel_at_period_end: true });
    else await client.subscriptions.cancel(subscription.stripeSubscriptionId);
  }
  return subscription.update(atPeriodEnd ? { cancelAtPeriodEnd: true } : { status: 'canceled', cancelAtPeriodEnd: false, currentPeriodEnd: new Date() });
}

export async function resume(user: User, subscriptionId: string) {
  const subscription = await Subscription.findByPk(subscriptionId);
  if (!subscription || subscription.userId !== user.id) throw AppError.notFound('Subscription not found');
  if (subscription.status === 'canceled' || !subscription.cancelAtPeriodEnd) throw AppError.conflict('Only subscriptions set to cancel at period end can be resumed');
  const client = stripe();
  if (subscription.stripeSubscriptionId && client) await client.subscriptions.update(subscription.stripeSubscriptionId, { cancel_at_period_end: false });
  return subscription.update({ cancelAtPeriodEnd: false });
}

/** Applies Stripe Billing webhook events to the local subscription rows. */
export async function applyStripeEvent(event: Stripe.Event): Promise<void> {
  const client = stripe();
  switch (event.type) {
    case 'customer.subscription.created':
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted': {
      const sub = event.data.object as Stripe.Subscription;
      const customer = client ? ((await client.customers.retrieve(sub.customer as string)) as Stripe.Customer) : null;
      const userId = customer?.metadata?.userId ?? (await User.findOne({ where: { stripeCustomerId: sub.customer as string } }))?.id;
      if (!userId) {
        logger.warn('Stripe subscription for unknown customer', { customer: sub.customer });
        return;
      }
      const item = sub.items.data[0] as Stripe.SubscriptionItem & { current_period_start?: number; current_period_end?: number };
      const periodStart = (sub as unknown as { current_period_start?: number }).current_period_start ?? item?.current_period_start ?? Math.floor(Date.now() / 1000);
      const periodEnd = (sub as unknown as { current_period_end?: number }).current_period_end ?? item?.current_period_end ?? periodStart;
      const plan = plans().find((p) => p.stripePriceId === item?.price.id);
      const values = {
        userId,
        stripeSubscriptionId: sub.id,
        planId: plan?.id ?? item?.price.id ?? 'unknown',
        status: event.type === 'customer.subscription.deleted' ? 'canceled' : sub.status,
        cancelAtPeriodEnd: sub.cancel_at_period_end,
        currentPeriodStart: new Date(periodStart * 1000),
        currentPeriodEnd: new Date(periodEnd * 1000),
      };
      const existing = await Subscription.findOne({ where: { stripeSubscriptionId: sub.id } });
      if (existing) await existing.update(values);
      else await Subscription.create(values);
      return;
    }
    case 'invoice.payment_failed': {
      const invoice = event.data.object as Stripe.Invoice & { subscription?: string };
      if (invoice.subscription) await Subscription.update({ status: 'past_due' }, { where: { stripeSubscriptionId: invoice.subscription } });
      return;
    }
    default:
      logger.debug(`Unhandled billing event ${event.type}`);
  }
}

/** Job for sandbox memberships (Stripe manages its own): end cancelled ones, roll the period of the rest. */
export async function renewSandboxSubscriptions(): Promise<number> {
  const due = await Subscription.findAll({ where: { stripeSubscriptionId: null, status: 'active', currentPeriodEnd: { [Op.lte]: new Date() } } });
  for (const sub of due) {
    if (sub.cancelAtPeriodEnd) await sub.update({ status: 'canceled' });
    else {
      const plan = plans().find((p) => p.id === sub.planId);
      await sub.update({ currentPeriodStart: sub.currentPeriodEnd, currentPeriodEnd: addInterval(sub.currentPeriodEnd, plan?.interval ?? 'month') });
    }
  }
  return due.length;
}
