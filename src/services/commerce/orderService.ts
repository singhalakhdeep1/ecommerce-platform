import { randomBytes } from 'crypto';
import { Op, Transaction } from 'sequelize';
import { env } from '../../config/env';
import { Category, Order, OrderEvent, OrderItem, PaymentTransaction, Product, User } from '../../models';
import { round2 } from '../../models/fields';
import { ORDER_TRANSITIONS, OrderStatus } from '../../models/Order';
import type { Address } from '../../models/User';
import { AppError } from '../../utils/appError';
import { logger } from '../../utils/logger';
import { trackPurchaseConversions } from '../analytics/abTesting';
import { trackSafe } from '../analytics/analyticsService';
import { cache } from '../caching/distributedCacheService';
import { syncProduct } from '../search/searchService';
import { getKvStore } from '../infra/kvStore';
import { structuredLog } from '../logging/structuredLoggingService';
import { metrics } from '../metrics';
import { sendEmail, templates } from '../notifications/email';
import { dispatch } from '../notifications/webhookDispatcher';
import { OrderType, orderFactory } from '../patterns/orderFactory';
import { PaymentSession, SandboxPaymentStrategy, StripePaymentStrategy, payments } from '../patterns/paymentStrategy';
import { sagaManager } from '../saga/sagaManager';
import { UnitOfWork } from '../unitOfWork/unitOfWork';
import { CartOwner, CartWithItems, clearCart, findCart, lineTerms } from './cartService';
import { DiscountEvaluation, PricedLine, evaluateDiscount, redeem, releaseRedemption } from './discountService';
import { assessOrder, clearFailedPayments, recordFailedPayment, recordOrder } from '../fraud/fraudDetection';
import { ServiceType, ShippingQuote, deliveryWindow, generateTrackingNumber, quote as shippingQuote, validateAddress } from './shipping';
import { TaxResult, calculateTax } from './tax';
import { createShippoLabel, shippoTracking } from '../integrations/thirdParty';
import { isMember } from './subscriptionService';

/* ------------------------------------------------------------------ pricing */

export interface QuoteOptions {
  address?: Address | null;
  shippingProvider?: string;
  shippingService?: ServiceType;
  discountCode?: string | null;
  orderType?: OrderType;
  userId?: string | null;
  /** Active members get free domestic ground shipping. */
  member?: boolean;
}

export interface QuoteLine extends PricedLine {
  name: string;
  sku: string;
  image: string | null;
  variantName: string;
  quantity: number;
  price: number;
  weight: number;
  stock: number;
  variantStock: number | null;
}

export interface Quote {
  lines: QuoteLine[];
  subtotal: number;
  discount: { code: string; type: string; amount: number; freeShipping: boolean } | null;
  shipping: ShippingQuote;
  tax: TaxResult;
  total: number;
  currency: string;
}

async function buildLines(cart: CartWithItems, products: Map<string, Product>): Promise<QuoteLine[]> {
  const categoryIds = [...new Set([...products.values()].map((p) => p.categoryId).filter(Boolean))] as string[];
  const categories = categoryIds.length ? await Category.findAll({ where: { id: categoryIds }, attributes: ['id', 'parentId'] }) : [];
  const parentOf = new Map(categories.map((c) => [c.id, c.parentId]));
  return cart.items.map((item) => {
    const product = products.get(item.productId);
    if (!product || !product.published) throw AppError.conflict('A product in your cart is no longer available; remove it and try again');
    const terms = lineTerms(product, item.variantName);
    const variant = item.variantName ? product.variants.find((v) => v.name === item.variantName) : null;
    return {
      productId: product.id,
      categoryId: product.categoryId,
      parentCategoryId: product.categoryId ? parentOf.get(product.categoryId) ?? null : null,
      name: product.name,
      sku: variant?.sku ?? product.sku,
      image: product.images[0] ?? null,
      variantName: item.variantName,
      quantity: item.quantity,
      price: terms.price,
      lineTotal: round2(terms.price * item.quantity),
      weight: Number(product.weight ?? 0.5),
      stock: product.stock,
      variantStock: variant?.quantity ?? null,
    };
  });
}

function priceLines(lines: QuoteLine[], options: QuoteOptions, evaluation: DiscountEvaluation | null): Quote {
  const subtotal = round2(lines.reduce((s, l) => s + l.lineTotal, 0));
  const factory = orderFactory.createOrder(options.orderType ?? 'standard');
  const service = options.shippingService ?? factory.defaultService;
  const weightKg = lines.reduce((s, l) => s + l.weight * l.quantity, 0);
  let shipping = shippingQuote(options.shippingProvider ?? 'usps', { weightKg, subtotal, serviceType: service, address: options.address });
  if (evaluation?.freeShipping || (options.member && service === 'ground' && shipping.zone < 3)) shipping = { ...shipping, cost: 0, isFreeShipping: true };
  const discountAmount = evaluation?.amount ?? 0;
  // Sales tax applies to the discounted merchandise; shipping is treated as non-taxable.
  const tax = calculateTax(Math.max(0, subtotal - discountAmount), options.address);
  const total = round2(Math.max(0, subtotal - discountAmount) + shipping.cost + tax.taxAmount);
  return {
    lines,
    subtotal,
    discount: evaluation ? { code: evaluation.discount.code, type: evaluation.discount.type, amount: discountAmount, freeShipping: evaluation.freeShipping } : null,
    shipping,
    tax,
    total,
    currency: 'USD',
  };
}

async function loadProducts(cart: CartWithItems, transaction?: Transaction): Promise<Map<string, Product>> {
  const ids = [...new Set(cart.items.map((i) => i.productId))];
  const rows = await Product.findAll({ where: { id: ids }, transaction, ...(transaction ? { lock: transaction.LOCK.UPDATE } : {}), order: [['id', 'ASC']] });
  return new Map(rows.map((p) => [p.id, p]));
}

/** Price the current cart without placing an order (GET /api/cart/quote). */
export async function quoteCart(owner: CartOwner, options: QuoteOptions): Promise<Quote> {
  const cart = await findCart(owner);
  if (!cart || cart.items.length === 0) throw AppError.badRequest('Cart is empty');
  const lines = await buildLines(cart, await loadProducts(cart));
  const evaluation = options.discountCode ? await evaluateDiscount(options.discountCode, options.userId ?? null, lines) : null;
  return priceLines(lines, { ...options, member: await isMember(options.userId) }, evaluation);
}

/* ------------------------------------------------------------------ orders */

export interface PlaceOrderInput {
  user: User;
  cartToken?: string | null;
  shippingAddress: Address;
  billingAddress?: Address | null;
  paymentMethod: 'card' | 'paypal';
  shippingProvider?: string;
  shippingService?: ServiceType;
  discountCode?: string | null;
  orderType?: OrderType;
  notes?: string | null;
  idempotencyKey?: string | null;
  ip: string;
  userAgent: string;
}

function orderNumber(): string {
  const d = new Date();
  const ymd = `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}`;
  return `ORD-${ymd}-${randomBytes(4).toString('hex').toUpperCase()}`;
}

async function adjustStock(order: Order, items: OrderItem[], direction: 1 | -1, transaction: Transaction): Promise<void> {
  for (const item of items) {
    if (!item.productId) continue;
    const product = await Product.findByPk(item.productId, { transaction, lock: transaction.LOCK.UPDATE });
    if (!product) continue;
    const variants = item.variantName
      ? product.variants.map((v) => (v.name === item.variantName && v.quantity !== undefined ? { ...v, quantity: v.quantity + direction * item.quantity } : v))
      : product.variants;
    await product.update({ stock: product.stock + direction * item.quantity, variants }, { transaction });
  }
  logger.debug(`Stock ${direction > 0 ? 'restored' : 'reserved'} for order ${order.orderNumber}`);
  // Cached product pages and search documents carry stock: refresh them once the change is committed.
  const ids = items.map((i) => i.productId).filter(Boolean) as string[];
  transaction.afterCommit(() => void stockChanged(ids));
}

async function stockChanged(productIds: string[]): Promise<void> {
  try {
    await cache.invalidatePattern('products:*');
    for (const product of await Product.findAll({ where: { id: productIds } })) await syncProduct(product);
  } catch (error) {
    logger.warn('Could not refresh product caches after a stock change', { error: error instanceof Error ? error.message : String(error) });
  }
}

async function addEvent(orderId: string, fromStatus: string | null, toStatus: string, note: string | null, actorId: string | null, transaction?: Transaction) {
  await OrderEvent.create({ orderId, fromStatus, toStatus, note, actorId }, { transaction });
}

/**
 * Creates an order from the cart in one transaction (Unit of Work): locks the products, re-checks
 * stock, prices the basket (discount, shipping, tax), runs the fraud rules, writes the order + items
 * + audit event + discount redemption, reserves stock and empties the cart. Side effects (velocity
 * counters, webhooks, low-stock alerts) run after commit.
 */
export async function placeOrder(input: PlaceOrderInput): Promise<Order> {
  if (input.idempotencyKey) {
    const existing = await Order.findOne({ where: { idempotencyKey: input.idempotencyKey, userId: input.user.id } });
    if (existing) return existing;
  }
  const addressCheck = validateAddress(input.shippingAddress);
  if (!addressCheck.isValid) throw AppError.badRequest('Invalid shipping address', addressCheck.errors);
  if (input.paymentMethod === 'paypal' && !payments.has('paypal')) throw AppError.badRequest('PayPal is not configured on this store');
  const factory = orderFactory.createOrder(input.orderType ?? 'standard');
  const owner: CartOwner = { user: input.user };

  const order = await UnitOfWork.run(async (uow) => {
    const t = uow.transaction;
    const cart = await findCart(owner, t);
    if (!cart || cart.items.length === 0) throw AppError.badRequest('Cart is empty');
    const products = await loadProducts(cart, t);
    const lines = await buildLines(cart, products);
    factory.validate(lines.map((l) => ({ productId: l.productId, name: l.name, quantity: l.quantity, stock: l.stock, variantName: l.variantName, variantStock: l.variantStock })));

    const evaluation = input.discountCode ? await evaluateDiscount(input.discountCode, input.user.id, lines, t) : null;
    const priced = priceLines(lines, { ...input, address: input.shippingAddress, userId: input.user.id, member: await isMember(input.user.id) }, evaluation);

    const fraud = await assessOrder({ user: input.user, ip: input.ip, userAgent: input.userAgent, amount: priced.total, shippingAddress: input.shippingAddress, billingAddress: input.billingAddress });
    if (fraud.action === 'block') throw new AppError('Order blocked by our fraud checks. Contact support if this is a mistake.', 403, { score: fraud.score, reasons: fraud.reasons });

    const created = await uow.repository(Order).create({
      orderNumber: orderNumber(),
      userId: input.user.id,
      orderType: factory.type,
      subtotal: priced.subtotal,
      tax: priced.tax.taxAmount,
      shippingCost: priced.shipping.cost,
      discount: priced.discount?.amount ?? 0,
      discountCode: priced.discount?.code ?? null,
      totalAmount: priced.total,
      currency: priced.currency,
      paymentMethod: input.paymentMethod,
      paymentProvider: input.paymentMethod === 'paypal' ? 'paypal' : payments.cardProvider(),
      shippingAddress: input.shippingAddress,
      billingAddress: input.billingAddress ?? input.shippingAddress,
      shippingProvider: priced.shipping.providerCode,
      shippingService: priced.shipping.serviceType,
      notes: input.notes ?? null,
      idempotencyKey: input.idempotencyKey ?? null,
      fraudFlag: fraud.action === 'review',
      fraudScore: fraud.score,
    });
    const items = await uow.repository(OrderItem).bulkCreate(
      lines.map((l) => ({
        orderId: created.id,
        productId: l.productId,
        variantName: l.variantName,
        quantity: l.quantity,
        price: l.price,
        total: l.lineTotal,
        productSnapshot: { name: l.name, sku: l.sku, image: l.image },
      })),
    );
    if (factory.reservesStock) await adjustStock(created, items, -1, t);
    await addEvent(created.id, null, 'pending', `Order placed (${factory.type}${fraud.action === 'review' ? ', flagged for fraud review' : ''})`, input.user.id, t);
    if (evaluation) await redeem(evaluation, input.user.id, created.id, t);
    await clearCart(owner, t);

    uow.afterCommit(async () => {
      await recordOrder(input.user.id, input.ip, input.userAgent);
      metrics.ordersCreated.inc();
      structuredLog.logOrderEvent(created.id, 'OrderPlaced', `Order ${created.orderNumber} placed`, { total: priced.total, fraudScore: fraud.score });
      trackSafe({ userId: input.user.id, eventType: 'checkout_start', eventData: { orderId: created.id, total: priced.total } });
      await dispatch('order.created', { orderId: created.id, orderNumber: created.orderNumber, totalAmount: priced.total, currency: priced.currency }, input.user.id);
      await alertLowStock(lines.map((l) => l.productId));
    });
    return created;
  });
  return order;
}

/**
 * Checkout saga: (1) place the order (reserving stock), (2) open a payment session with the
 * provider. If the provider call fails, step 1 is compensated: the order is cancelled, stock and the
 * discount use are given back, so a provider outage never leaves stock locked by a dead order.
 */
export async function checkout(input: PlaceOrderInput): Promise<{ order: Order; payment: PaymentSession; sagaId: string }> {
  const ctx: { order?: Order; payment?: PaymentSession } = {};
  const result = await sagaManager.execute(
    {
      name: 'Checkout',
      steps: [
        {
          name: 'PlaceOrder',
          execute: async (c) => {
            c.order = await placeOrder(input);
          },
          compensate: async (c) => {
            if (c.order) await cancelUnpaidOrder(c.order.id, null, 'Payment could not be started');
          },
        },
        {
          name: 'CreatePaymentSession',
          execute: async (c) => {
            c.payment = await startPayment(c.order!, input.user);
          },
        },
      ],
    },
    ctx,
  );
  if (result.status !== 'completed') {
    if (result.error instanceof AppError) throw result.error;
    throw AppError.badGateway(`Checkout failed: ${result.error instanceof Error ? result.error.message : String(result.error)}`);
  }
  return { order: ctx.order!, payment: ctx.payment!, sagaId: result.executionId };
}

/* ------------------------------------------------------------------ payments */

/** The order if it belongs to `user` (admins see every order); 404 otherwise, so ids cannot be probed. */
export async function getOwnedOrder(orderId: string, user: User): Promise<Order> {
  const order = await Order.findByPk(orderId);
  if (!order || (order.userId !== user.id && user.role !== 'admin')) throw AppError.notFound('Order not found');
  return order;
}

/** Opens (or re-opens) a payment session for an unpaid order with its provider. */
export async function startPayment(order: Order, user: User): Promise<PaymentSession> {
  if (order.paymentStatus === 'paid') throw AppError.conflict('Order is already paid');
  if (order.status === 'cancelled') throw AppError.conflict('Order is cancelled');
  const provider = order.paymentMethod === 'paypal' ? 'paypal' : payments.cardProvider();
  const strategy = payments.getStrategy(provider);
  const session = await strategy.createPayment({
    orderId: order.id,
    orderNumber: order.orderNumber,
    customerId: order.userId,
    customerEmail: user.email,
    amount: Number(order.totalAmount),
    currency: order.currency,
    description: `Order ${order.orderNumber}`,
    // New key per attempt after a failure, stable otherwise.
    idempotencyKey: `${order.id}-${order.paymentStatus === 'failed' ? Date.now() : 0}`,
  });
  if (provider === 'paypal') await order.update({ paypalOrderId: session.providerRef, paymentProvider: 'paypal' });
  else await order.update({ stripePaymentIntentId: session.providerRef, paymentProvider: provider });
  return session;
}

/** Sandbox / Stripe confirmation endpoint. Stripe: verifies the PaymentIntent server-side (useful without webhooks). */
export async function confirmCardPayment(order: Order, paymentMethod?: string): Promise<Order> {
  if (order.paymentStatus === 'paid') return order;
  if (!order.stripePaymentIntentId) throw AppError.badRequest('Start the payment first (POST /api/payments/create-intent)');
  if (order.paymentProvider === 'sandbox') {
    const strategy = payments.getStrategy('sandbox') as SandboxPaymentStrategy;
    const outcome = strategy.confirm(paymentMethod ?? '');
    if (!outcome.ok) {
      await markPaymentFailed(order, 'sandbox', outcome.message);
      throw new AppError(outcome.message, 402);
    }
    return markPaid(order, 'sandbox', order.stripePaymentIntentId, Number(order.totalAmount));
  }
  const strategy = payments.getStrategy('stripe') as StripePaymentStrategy;
  const intent = await strategy.retrieve(order.stripePaymentIntentId);
  if (intent.status === 'succeeded') return markPaid(order, 'stripe', intent.id, intent.amount_received / 100);
  if (intent.status === 'canceled' || intent.last_payment_error) {
    await markPaymentFailed(order, 'stripe', intent.last_payment_error?.message ?? intent.status);
    throw new AppError(intent.last_payment_error?.message ?? 'Payment failed', 402);
  }
  throw new AppError(`Payment not completed yet (status: ${intent.status})`, 409);
}

/**
 * Idempotent "payment captured" transition used by Stripe webhooks, PayPal capture and sandbox
 * confirmation: records the charge with the platform fee / seller payout split, moves the order on,
 * then sends the confirmation email, webhook, analytics and A/B conversions.
 */
export async function markPaid(order: Order, provider: string, providerRef: string, amount: number): Promise<Order> {
  const factory = orderFactory.createOrder(order.orderType);
  const updated = await UnitOfWork.run(async (uow) => {
    const fresh = await uow.repository(Order).findById(order.id, undefined, true);
    if (!fresh) throw AppError.notFound('Order not found');
    if (fresh.paymentStatus === 'paid' || fresh.paymentStatus === 'refunded') return { order: fresh, changed: false };
    if (Math.abs(amount - Number(fresh.totalAmount)) > 0.01) {
      structuredLog.logAuditEvent('PaymentAmountMismatch', `Captured ${amount} for order total ${fresh.totalAmount}`, { orderId: fresh.id, provider });
      await fresh.update({ fraudFlag: true }, { transaction: uow.transaction });
    }
    const platformFee = round2(amount * (env.payments.platformFeePercent / 100));
    await uow.repository(PaymentTransaction).create({ orderId: fresh.id, provider, providerRef, type: 'charge', status: 'succeeded', amount, platformFee, sellerPayout: round2(amount - platformFee) });
    const nextStatus = fresh.status === 'cancelled' ? 'cancelled' : factory.statusAfterPayment();
    await addEvent(fresh.id, fresh.status, nextStatus, `Payment captured via ${provider}`, null, uow.transaction);
    await fresh.update({ paymentStatus: 'paid', status: nextStatus, paidAt: new Date(), paymentProvider: provider }, { transaction: uow.transaction });
    return { order: fresh, changed: true };
  });
  if (!updated.changed) return updated.order;

  const paid = updated.order;
  metrics.payments.inc({ provider, outcome: 'succeeded' });
  metrics.revenue.inc(amount);
  structuredLog.logOrderEvent(paid.id, 'PaymentCaptured', `Order ${paid.orderNumber} paid via ${provider}`, { amount });
  void (async () => {
    const [user, items] = await Promise.all([User.findByPk(paid.userId), OrderItem.findAll({ where: { orderId: paid.id } })]);
    await clearFailedPayments(paid.userId);
    trackSafe({ userId: paid.userId, eventType: 'purchase', eventData: { orderId: paid.id, total: amount } });
    await trackPurchaseConversions([paid.userId]);
    if (user) {
      await sendEmail({ to: user.email, ...templates.orderConfirmation({ orderNumber: paid.orderNumber, totalAmount: amount, currency: paid.currency, items: items.map((i) => ({ name: i.productSnapshot.name, quantity: i.quantity, total: Number(i.total) })) }) });
    }
    const platformFee = round2(amount * (env.payments.platformFeePercent / 100));
    await dispatch('order.paid', { orderId: paid.id, orderNumber: paid.orderNumber, totalAmount: amount, platformFee, sellerPayout: round2(amount - platformFee), paymentMethod: provider }, paid.userId);
  })().catch((error) => logger.warn('Post-payment side effects failed', { orderId: paid.id, error: error instanceof Error ? error.message : String(error) }));
  return paid;
}

export async function markPaymentFailed(order: Order, provider: string, reason: string): Promise<void> {
  if (order.paymentStatus === 'paid') return;
  await order.update({ paymentStatus: 'failed' });
  await PaymentTransaction.create({ orderId: order.id, provider, providerRef: order.stripePaymentIntentId ?? order.paypalOrderId, type: 'charge', status: 'failed', amount: Number(order.totalAmount) });
  await addEvent(order.id, order.status, order.status, `Payment failed: ${reason}`, null);
  await recordFailedPayment(order.userId);
  metrics.payments.inc({ provider, outcome: 'failed' });
  trackSafe({ userId: order.userId, eventType: 'payment_failed', eventData: { orderId: order.id, reason } });
}

export async function capturePaypal(paypalOrderId: string, user: User): Promise<Order> {
  const order = await Order.findOne({ where: { paypalOrderId } });
  if (!order || (order.userId !== user.id && user.role !== 'admin')) throw AppError.notFound('Order not found for this PayPal payment');
  if (order.paymentStatus === 'paid') return order;
  const strategy = payments.getStrategy('paypal') as unknown as { capture(id: string): Promise<{ status: string; captureId: string | null; amount: number }> };
  const capture = await strategy.capture(paypalOrderId);
  if (capture.status !== 'COMPLETED' || !capture.captureId) {
    await markPaymentFailed(order, 'paypal', `PayPal status ${capture.status}`);
    throw new AppError(`PayPal payment not completed (status ${capture.status})`, 402);
  }
  return markPaid(order, 'paypal', capture.captureId, capture.amount);
}

/* ------------------------------------------------------------------ cancel / refund */

/** Cancels an order that was never paid: restock (if reserved), give back the discount use. */
export async function cancelUnpaidOrder(orderId: string, actorId: string | null, reason: string): Promise<Order> {
  return UnitOfWork.run(async (uow) => {
    const order = await uow.repository(Order).findById(orderId, undefined, true);
    if (!order) throw AppError.notFound('Order not found');
    if (order.status === 'cancelled') return order;
    if (order.paymentStatus === 'paid') throw AppError.conflict('Order is paid: use refund');
    const items = await uow.repository(OrderItem).findWhere({ orderId });
    if (orderFactory.createOrder(order.orderType).reservesStock) await adjustStock(order, items, 1, uow.transaction);
    await releaseRedemption(order.id, uow.transaction);
    await addEvent(order.id, order.status, 'cancelled', reason, actorId, uow.transaction);
    await order.update({ status: 'cancelled', cancelledAt: new Date() }, { transaction: uow.transaction });
    uow.afterCommit(() => dispatch('order.status_changed', { orderId: order.id, orderNumber: order.orderNumber, status: 'cancelled', reason }, order.userId).then(() => undefined));
    return order;
  });
}

/**
 * Refund saga: (1) restock the items (when requested), (2) refund at the provider, (3) record the
 * refund, release the discount on a full refund and update the order. If the provider refund fails,
 * step 1 is compensated (stock taken back out), so stock never goes up for money that was not returned.
 */
export async function refundOrder(orderId: string, options: { amount?: number; reason?: string; restock?: boolean; cancel?: boolean; actorId: string | null }): Promise<Order> {
  const order = await Order.findByPk(orderId);
  if (!order) throw AppError.notFound('Order not found');
  if (order.paymentStatus !== 'paid') throw AppError.conflict(`Only paid orders can be refunded (payment status: ${order.paymentStatus})`);
  const charge = await PaymentTransaction.findOne({ where: { orderId, type: 'charge', status: 'succeeded' }, order: [['createdAt', 'DESC']] });
  if (!charge?.providerRef) throw AppError.conflict('No captured payment found for this order');
  const remaining = round2(Number(order.totalAmount) - Number(order.refundedAmount));
  const amount = round2(options.amount ?? remaining);
  if (amount <= 0 || amount > remaining) throw AppError.badRequest(`Refund amount must be between 0.01 and ${remaining.toFixed(2)}`);
  const full = Math.abs(amount - remaining) < 0.01;
  const items = await OrderItem.findAll({ where: { orderId } });
  const restock = (options.restock ?? full) && orderFactory.createOrder(order.orderType).reservesStock;

  const ctx: { refundRef?: string } = {};
  const result = await sagaManager.execute(
    {
      name: 'Refund',
      steps: [
        {
          name: 'Restock',
          execute: async () => {
            if (restock) await UnitOfWork.run((uow) => adjustStock(order, items, 1, uow.transaction));
          },
          compensate: async () => {
            if (restock) await UnitOfWork.run((uow) => adjustStock(order, items, -1, uow.transaction));
          },
        },
        {
          name: 'ProviderRefund',
          execute: async (c) => {
            const refund = await payments.getStrategy(charge.provider).processRefund({
              providerRef: charge.providerRef!,
              amount,
              currency: order.currency,
              reason: options.reason,
              idempotencyKey: `${order.id}-${Number(order.refundedAmount).toFixed(2)}-${amount.toFixed(2)}`,
            });
            if (refund.status === 'failed') throw new Error('Provider rejected the refund');
            c.refundRef = refund.refundRef;
          },
        },
        {
          name: 'RecordRefund',
          execute: async (c) => {
            await UnitOfWork.run(async (uow) => {
              const fresh = await uow.repository(Order).findById(order.id, undefined, true);
              if (!fresh) return;
              const refunded = round2(Number(fresh.refundedAmount) + amount);
              const fully = refunded >= Number(fresh.totalAmount) - 0.01;
              const nextStatus: OrderStatus = options.cancel || (fully && ['pending', 'processing'].includes(fresh.status)) ? 'cancelled' : fresh.status;
              await uow.repository(PaymentTransaction).create({ orderId: fresh.id, provider: charge.provider, providerRef: c.refundRef ?? null, type: 'refund', status: 'succeeded', amount: -amount });
              if (fully) await releaseRedemption(fresh.id, uow.transaction);
              await addEvent(fresh.id, fresh.status, nextStatus, `Refunded ${amount.toFixed(2)} ${fresh.currency}${options.reason ? `: ${options.reason}` : ''}`, options.actorId, uow.transaction);
              await fresh.update(
                { refundedAmount: refunded, paymentStatus: fully ? 'refunded' : 'paid', status: nextStatus, ...(nextStatus === 'cancelled' && fresh.status !== 'cancelled' ? { cancelledAt: new Date() } : {}) },
                { transaction: uow.transaction },
              );
            });
          },
        },
      ],
    },
    ctx,
  );
  if (result.status !== 'completed') {
    throw AppError.badGateway(`Refund failed: ${result.error instanceof Error ? result.error.message : String(result.error)}`);
  }
  const refunded = (await Order.findByPk(orderId))!;
  structuredLog.logAuditEvent('OrderRefunded', `Refunded ${amount} on ${refunded.orderNumber}`, { orderId, amount, actorId: options.actorId, sagaId: result.executionId });
  trackSafe({ userId: refunded.userId, eventType: 'refund', eventData: { orderId, amount } });
  void (async () => {
    const user = await User.findByPk(refunded.userId);
    if (user) await sendEmail({ to: user.email, ...templates.refund(refunded.orderNumber, amount, refunded.currency) });
    await dispatch('order.refunded', { orderId, orderNumber: refunded.orderNumber, amount, fullyRefunded: refunded.paymentStatus === 'refunded' }, refunded.userId);
  })().catch(() => undefined);
  return refunded;
}

/** Customer (own order) or admin cancellation. Paid orders are refunded in full. Shipped orders cannot be cancelled. */
export async function cancelOrder(order: Order, actor: User, reason = 'Cancelled by customer'): Promise<Order> {
  if (!['pending', 'processing'].includes(order.status)) throw AppError.conflict(`Order cannot be cancelled once it is ${order.status}`);
  if (order.paymentStatus === 'paid') return refundOrder(order.id, { reason, restock: true, cancel: true, actorId: actor.id });
  return cancelUnpaidOrder(order.id, actor.id, reason);
}

/* ------------------------------------------------------------------ fulfilment */

export async function updateStatus(
  orderId: string,
  input: { status: OrderStatus; trackingNumber?: string | null; shippingProvider?: string | null; createLabel?: boolean; note?: string | null },
  actor: User,
): Promise<Order> {
  const order = await Order.findByPk(orderId);
  if (!order) throw AppError.notFound('Order not found');
  if (input.status === order.status) return order;
  const allowed = ORDER_TRANSITIONS[order.status as OrderStatus];
  if (!allowed.includes(input.status)) {
    throw AppError.conflict(`Cannot move an order from ${order.status} to ${input.status} (allowed: ${allowed.join(', ') || 'none'})`);
  }
  if (input.status === 'cancelled') return cancelOrder(order, actor, input.note ?? 'Cancelled by admin');
  if ((input.status === 'processing' || input.status === 'shipped') && order.paymentStatus !== 'paid') {
    throw AppError.conflict('Unpaid orders cannot be fulfilled');
  }
  if (input.status === 'processing' && order.orderType === 'preorder') {
    // Stock for a preorder is taken when it is released for fulfilment.
    await UnitOfWork.run(async (uow) => {
      const items = await uow.repository(OrderItem).findWhere({ orderId });
      for (const item of items) {
        const product = item.productId ? await Product.findByPk(item.productId, { transaction: uow.transaction, lock: uow.lock }) : null;
        if (product && product.stock < item.quantity) throw AppError.conflict(`Not enough stock yet to release preorder item ${product.name}`);
      }
      await adjustStock(order, items, -1, uow.transaction);
    });
  }

  const changes: Partial<Order> = { status: input.status };
  if (input.status === 'shipped') {
    const provider = (input.shippingProvider ?? order.shippingProvider ?? 'usps').toLowerCase();
    changes.shippingProvider = provider;
    changes.shippedAt = new Date();
    if (input.trackingNumber) changes.trackingNumber = input.trackingNumber;
    else if (input.createLabel) {
      const label = await createShippoLabel(order);
      changes.trackingNumber = label.trackingNumber;
      changes.labelUrl = label.labelUrl;
    } else changes.trackingNumber = order.trackingNumber ?? generateTrackingNumber(provider);
  }
  if (input.status === 'delivered') changes.deliveredAt = new Date();

  await UnitOfWork.run(async (uow) => {
    await addEvent(order.id, order.status, input.status, input.note ?? null, actor.id, uow.transaction);
    await order.update(changes, { transaction: uow.transaction });
  });
  structuredLog.logOrderEvent(order.id, 'StatusChanged', `Order ${order.orderNumber} -> ${input.status}`, { actorId: actor.id });
  void (async () => {
    const user = await User.findByPk(order.userId);
    if (user) await sendEmail({ to: user.email, ...templates.orderStatus(order.orderNumber, input.status, order.trackingNumber) });
    await dispatch('order.status_changed', { orderId: order.id, orderNumber: order.orderNumber, status: input.status, trackingNumber: order.trackingNumber }, order.userId);
  })().catch(() => undefined);
  return order;
}

/** Tracking page data: the order's own event timeline, the carrier delivery window, and live carrier events when Shippo is configured. */
export async function tracking(order: Order) {
  const events = await OrderEvent.findAll({ where: { orderId: order.id }, order: [['createdAt', 'ASC']] });
  const window = order.shippedAt ? deliveryWindow(order.shippingProvider ?? 'usps', (order.shippingService as ServiceType) ?? 'ground', order.shippedAt) : null;
  const carrier = order.trackingNumber ? await shippoTracking(order.shippingProvider ?? 'usps', order.trackingNumber) : null;
  const steps: OrderStatus[] = ['pending', 'processing', 'shipped', 'delivered'];
  return {
    orderId: order.id,
    orderNumber: order.orderNumber,
    status: order.status,
    paymentStatus: order.paymentStatus,
    trackingNumber: order.trackingNumber,
    carrier: order.shippingProvider,
    service: order.shippingService,
    labelUrl: order.labelUrl,
    progress: order.status === 'cancelled' ? null : steps.indexOf(order.status) / (steps.length - 1),
    estimatedDelivery: order.deliveredAt ? null : window ? { earliest: window.earliest, latest: window.latest } : null,
    timeline: events.map((e) => ({ at: e.createdAt, from: e.fromStatus, to: e.toStatus, note: e.note })),
    carrierEvents: carrier,
  };
}

/* ------------------------------------------------------------------ background jobs */

/** Cancels orders left unpaid longer than ORDER_PAYMENT_TIMEOUT_MINUTES, releasing their stock. */
export async function expireUnpaidOrders(): Promise<number> {
  const minutes = Number(process.env.ORDER_PAYMENT_TIMEOUT_MINUTES ?? 60);
  const stale = await Order.findAll({
    where: { status: 'pending', paymentStatus: { [Op.in]: ['pending', 'failed'] }, createdAt: { [Op.lt]: new Date(Date.now() - minutes * 60_000) } },
    limit: 100,
  });
  for (const order of stale) {
    await cancelUnpaidOrder(order.id, null, `Payment not received within ${minutes} minutes`).catch((error) =>
      logger.warn('Could not expire order', { orderId: order.id, error: error instanceof Error ? error.message : String(error) }),
    );
  }
  return stale.length;
}

/** Emails the admin and fires product.low_stock once per product per day when stock crosses the threshold. */
export async function alertLowStock(productIds: string[]): Promise<void> {
  if (!productIds.length) return;
  const low = await Product.findAll({ where: { id: productIds, stock: { [Op.lte]: Product.sequelize!.col('low_stock_threshold') } } });
  const fresh: Product[] = [];
  for (const p of low) {
    if (await getKvStore().setIfAbsent(`lowstock:${p.id}`, '1', 86_400)) fresh.push(p);
  }
  if (!fresh.length) return;
  await sendEmail({ to: env.email.adminEmail, ...templates.lowStock(fresh.map((p) => ({ name: p.name, sku: p.sku, stock: p.stock }))) });
  for (const p of fresh) await dispatch('product.low_stock', { productId: p.id, sku: p.sku, name: p.name, stock: p.stock, threshold: p.lowStockThreshold });
}
