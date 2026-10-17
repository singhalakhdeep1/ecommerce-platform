import { createHash } from 'crypto';
import { QueryTypes, Sequelize } from 'sequelize';
import { AnalyticsEvent } from '../../models';
import { round2 } from '../../models/fields';
import { readReplicas } from '../readReplica/readReplicaService';
import { sharding } from '../sharding/databaseShardingService';
import { logger } from '../../utils/logger';

/** Events the storefront may send to POST /api/analytics/track; `purchase` is only recorded server-side. */
export const CLIENT_EVENTS = [
  'page_view',
  'product_view',
  'category_view',
  'search',
  'filter',
  'add_to_cart',
  'remove_from_cart',
  'checkout_start',
  'wishlist_add',
  'wishlist_remove',
  'review_submit',
  'newsletter_signup',
] as const;
export const SERVER_EVENTS = ['purchase', 'payment_failed', 'account_register', 'refund'] as const;
export const FUNNEL_STEPS = ['product_view', 'add_to_cart', 'checkout_start', 'purchase'] as const;

export interface TrackInput {
  userId?: string | null;
  sessionId?: string | null;
  eventType: string;
  eventData?: Record<string, unknown> | null;
}

/** Global A/B group for event-level splits (deterministic per subject). */
export function abGroupFor(subject: string): 'A' | 'B' {
  return createHash('md5').update(subject).digest()[0] % 2 === 0 ? 'A' : 'B';
}

/**
 * Stores an analytics event. With DB_SHARDS configured, the event goes to the shard owning its
 * subject (user id, else session id); otherwise to the primary's analytics_events table.
 */
export async function track(input: TrackInput): Promise<{ id: string; abGroup: string; shard: string | null }> {
  const subject = input.userId ?? input.sessionId ?? 'anonymous';
  const abGroup = abGroupFor(subject);
  if (!sharding.enabled) {
    const event = await AnalyticsEvent.create({
      userId: input.userId ?? null,
      sessionId: input.sessionId ?? null,
      eventType: input.eventType,
      eventData: input.eventData ?? null,
      abGroup,
    });
    return { id: event.id, abGroup, shard: null };
  }
  const shardId = sharding.getShardIdByCustomer(subject);
  const [row] = await sharding.executeOnShard(shardId, (db) =>
    db.query<{ id: string }>(
      `INSERT INTO analytics_events (user_id, session_id, event_type, event_data, ab_group) VALUES (:userId, :sessionId, :eventType, :eventData, :abGroup) RETURNING id`,
      {
        type: QueryTypes.SELECT,
        replacements: { userId: input.userId ?? null, sessionId: input.sessionId ?? null, eventType: input.eventType, eventData: input.eventData ? JSON.stringify(input.eventData) : null, abGroup },
      },
    ),
  );
  return { id: row.id, abGroup, shard: shardId };
}

/** Fire-and-forget variant for server-side events (never fails the business operation). */
export function trackSafe(input: TrackInput): void {
  track(input).catch((error) => logger.warn('Analytics event not stored', { eventType: input.eventType, error: error instanceof Error ? error.message : String(error) }));
}

/** Runs a read over every event store: all shards (cross-shard fan-out) or the primary/replica. */
async function overEventStores<T extends object>(sql: string, replacements: Record<string, unknown>): Promise<T[]> {
  if (sharding.enabled) {
    const parts = await sharding.executeOnAllShards((db: Sequelize) => db.query<T>(sql, { type: QueryTypes.SELECT, replacements }));
    return parts.flatMap((p) => p.result);
  }
  return readReplicas.query<T>(sql, replacements);
}

interface Range {
  from: Date;
  to: Date;
}

export function parseRange(startDate?: string, endDate?: string, defaultDays = 30): Range {
  const to = endDate ? new Date(endDate) : new Date();
  if (endDate && /^\d{4}-\d{2}-\d{2}$/.test(endDate)) to.setUTCHours(23, 59, 59, 999);
  const from = startDate ? new Date(startDate) : new Date(to.getTime() - defaultDays * 86_400_000);
  return { from, to };
}

/**
 * Funnel: distinct subjects (user, else session) per step. Subjects are the shard key, so per-shard
 * distinct counts can simply be summed.
 */
export async function funnel(range: Range) {
  const rows = await overEventStores<{ step: string; subjects: string }>(
    `SELECT event_type AS step, COUNT(DISTINCT COALESCE(user_id::text, session_id)) AS subjects
       FROM analytics_events
      WHERE event_type IN (:steps) AND created_at BETWEEN :from AND :to
      GROUP BY event_type`,
    { steps: [...FUNNEL_STEPS], from: range.from, to: range.to },
  );
  const counts = Object.fromEntries(FUNNEL_STEPS.map((s) => [s, 0])) as Record<(typeof FUNNEL_STEPS)[number], number>;
  for (const r of rows) counts[r.step as (typeof FUNNEL_STEPS)[number]] += Number(r.subjects);
  const pct = (a: number, b: number) => (b ? round2((a / b) * 100) : 0);
  return {
    range,
    counts,
    conversionRates: {
      viewToCart: pct(counts.add_to_cart, counts.product_view),
      cartToCheckout: pct(counts.checkout_start, counts.add_to_cart),
      checkoutToPurchase: pct(counts.purchase, counts.checkout_start),
      overall: pct(counts.purchase, counts.product_view),
    },
  };
}

export async function eventBreakdown(range: Range) {
  const rows = await overEventStores<{ eventType: string; abGroup: string | null; events: string }>(
    `SELECT event_type AS "eventType", ab_group AS "abGroup", COUNT(*) AS events FROM analytics_events
      WHERE created_at BETWEEN :from AND :to GROUP BY event_type, ab_group`,
    { from: range.from, to: range.to },
  );
  const merged = new Map<string, { eventType: string; total: number; byGroup: Record<string, number> }>();
  for (const r of rows) {
    const entry = merged.get(r.eventType) ?? { eventType: r.eventType, total: 0, byGroup: {} };
    entry.total += Number(r.events);
    entry.byGroup[r.abGroup ?? 'none'] = (entry.byGroup[r.abGroup ?? 'none'] ?? 0) + Number(r.events);
    merged.set(r.eventType, entry);
  }
  return [...merged.values()].sort((a, b) => b.total - a.total);
}

/** Retention by signup month: share of each cohort that paid for an order N months after signing up. */
export async function cohorts(months = 6) {
  const rows = await readReplicas.query<{ cohort: string; size: string; month: number | null; buyers: string }>(
    `WITH cohort AS (
        SELECT id, date_trunc('month', created_at) AS cohort_month FROM users
         WHERE role = 'customer' AND created_at >= date_trunc('month', NOW()) - (:months || ' months')::interval
     ), sizes AS (SELECT cohort_month, COUNT(*) AS size FROM cohort GROUP BY cohort_month),
     activity AS (
        SELECT c.cohort_month,
               (EXTRACT(YEAR FROM age(date_trunc('month', o.paid_at), c.cohort_month)) * 12
                + EXTRACT(MONTH FROM age(date_trunc('month', o.paid_at), c.cohort_month)))::int AS month,
               COUNT(DISTINCT o.user_id) AS buyers
          FROM cohort c JOIN orders o ON o.user_id = c.id AND o.payment_status IN ('paid', 'refunded') AND o.paid_at IS NOT NULL
         GROUP BY 1, 2
     )
     SELECT to_char(s.cohort_month, 'YYYY-MM') AS cohort, s.size, a.month, COALESCE(a.buyers, 0) AS buyers
       FROM sizes s LEFT JOIN activity a ON a.cohort_month = s.cohort_month
      ORDER BY s.cohort_month, a.month`,
    { months: String(months - 1) },
  );
  const byCohort = new Map<string, { cohort: string; size: number; retention: Record<string, { buyers: number; rate: number }> }>();
  for (const r of rows) {
    const entry = byCohort.get(r.cohort) ?? { cohort: r.cohort, size: Number(r.size), retention: {} };
    if (r.month !== null) entry.retention[`month${r.month}`] = { buyers: Number(r.buyers), rate: round2((Number(r.buyers) / Number(r.size)) * 100) };
    byCohort.set(r.cohort, entry);
  }
  return [...byCohort.values()];
}

export async function sales(range: Range, groupBy: 'day' | 'week' | 'month' = 'day') {
  const [totals] = await readReplicas.query<{ orders: string; revenue: string; refunded: string; discounts: string; tax: string; shipping: string }>(
    `SELECT COUNT(*) AS orders, COALESCE(SUM(total_amount), 0) AS revenue, COALESCE(SUM(refunded_amount), 0) AS refunded,
            COALESCE(SUM(discount), 0) AS discounts, COALESCE(SUM(tax), 0) AS tax, COALESCE(SUM(shipping_cost), 0) AS shipping
       FROM orders WHERE payment_status IN ('paid', 'refunded') AND paid_at BETWEEN :from AND :to`,
    range as unknown as Record<string, unknown>,
  );
  const trend = await readReplicas.query<{ period: string; orders: string; revenue: string }>(
    `SELECT to_char(date_trunc(:unit, paid_at), 'YYYY-MM-DD') AS period, COUNT(*) AS orders, SUM(total_amount - refunded_amount) AS revenue
       FROM orders WHERE payment_status IN ('paid', 'refunded') AND paid_at BETWEEN :from AND :to
      GROUP BY 1 ORDER BY 1`,
    { unit: groupBy, from: range.from, to: range.to },
  );
  const byStatus = await readReplicas.query<{ status: string; orders: string }>(
    `SELECT status::text, COUNT(*) AS orders FROM orders WHERE created_at BETWEEN :from AND :to GROUP BY status`,
    range as unknown as Record<string, unknown>,
  );
  const orders = Number(totals.orders);
  const gross = Number(totals.revenue);
  const refunded = Number(totals.refunded);
  return {
    range,
    totalOrders: orders,
    grossRevenue: round2(gross),
    refunded: round2(refunded),
    netRevenue: round2(gross - refunded),
    averageOrderValue: orders ? round2(gross / orders) : 0,
    discountsGiven: round2(Number(totals.discounts)),
    taxCollected: round2(Number(totals.tax)),
    shippingCollected: round2(Number(totals.shipping)),
    ordersByStatus: Object.fromEntries(byStatus.map((r) => [r.status, Number(r.orders)])),
    salesTrend: trend.map((t) => ({ date: t.period, orders: Number(t.orders), revenue: round2(Number(t.revenue)) })),
  };
}

export async function productPerformance(range: Range, limit = 10) {
  const top = await readReplicas.query<{ productId: string; name: string; sku: string; units: string; revenue: string; orders: string }>(
    `SELECT oi.product_id AS "productId", oi.product_snapshot->>'name' AS name, oi.product_snapshot->>'sku' AS sku,
            SUM(oi.quantity) AS units, SUM(oi.total) AS revenue, COUNT(DISTINCT oi.order_id) AS orders
       FROM order_items oi JOIN orders o ON o.id = oi.order_id
      WHERE o.payment_status IN ('paid', 'refunded') AND o.paid_at BETWEEN :from AND :to
      GROUP BY 1, 2, 3 ORDER BY revenue DESC LIMIT :limit`,
    { from: range.from, to: range.to, limit },
  );
  const views = await overEventStores<{ productId: string; views: string }>(
    `SELECT event_data->>'productId' AS "productId", COUNT(*) AS views FROM analytics_events
      WHERE event_type = 'product_view' AND created_at BETWEEN :from AND :to AND event_data->>'productId' IS NOT NULL
      GROUP BY 1`,
    { from: range.from, to: range.to },
  );
  const viewMap = new Map<string, number>();
  for (const v of views) viewMap.set(v.productId, (viewMap.get(v.productId) ?? 0) + Number(v.views));
  const ratings = await readReplicas.query<{ id: string; name: string; rating: string; numReviews: number }>(
    `SELECT id, name, rating, num_reviews AS "numReviews" FROM products WHERE num_reviews > 0 ORDER BY rating DESC, num_reviews DESC LIMIT :limit`,
    { limit },
  );
  return {
    range,
    topSelling: top.map((t) => {
      const v = viewMap.get(t.productId) ?? 0;
      return { productId: t.productId, name: t.name, sku: t.sku, unitsSold: Number(t.units), revenue: round2(Number(t.revenue)), orders: Number(t.orders), views: v, viewToOrderRate: v ? round2((Number(t.orders) / v) * 100) : null };
    }),
    mostViewed: [...viewMap.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit).map(([productId, v]) => ({ productId, views: v })),
    topRated: ratings.map((r) => ({ ...r, rating: Number(r.rating) })),
  };
}

export async function customerAnalytics(range: Range, limit = 10) {
  const [counts] = await readReplicas.query<{ total: string; newCustomers: string; buyers: string; repeat: string }>(
    `SELECT (SELECT COUNT(*) FROM users WHERE role = 'customer') AS total,
            (SELECT COUNT(*) FROM users WHERE role = 'customer' AND created_at BETWEEN :from AND :to) AS "newCustomers",
            (SELECT COUNT(DISTINCT user_id) FROM orders WHERE payment_status = 'paid' AND paid_at BETWEEN :from AND :to) AS buyers,
            (SELECT COUNT(*) FROM (SELECT user_id FROM orders WHERE payment_status = 'paid' GROUP BY user_id HAVING COUNT(*) > 1) r) AS repeat`,
    range as unknown as Record<string, unknown>,
  );
  const top = await readReplicas.query<{ userId: string; name: string; email: string; orders: string; spent: string; lastOrderAt: Date }>(
    `SELECT u.id AS "userId", u.name, u.email, COUNT(o.id) AS orders, SUM(o.total_amount - o.refunded_amount) AS spent, MAX(o.paid_at) AS "lastOrderAt"
       FROM users u JOIN orders o ON o.user_id = u.id AND o.payment_status IN ('paid', 'refunded')
      GROUP BY u.id ORDER BY spent DESC LIMIT :limit`,
    { limit },
  );
  const buyersAllTime = await readReplicas.query<{ avg: string | null }>(
    `SELECT AVG(spent) AS avg FROM (SELECT SUM(total_amount - refunded_amount) AS spent FROM orders WHERE payment_status IN ('paid','refunded') GROUP BY user_id) t`,
  );
  const total = Number(counts.total);
  const buyers = Number(counts.buyers);
  return {
    range,
    totalCustomers: total,
    newCustomers: Number(counts.newCustomers),
    activeBuyers: buyers,
    repeatCustomers: Number(counts.repeat),
    repeatRate: total ? round2((Number(counts.repeat) / total) * 100) : 0,
    averageLifetimeValue: round2(Number(buyersAllTime[0]?.avg ?? 0)),
    topCustomers: top.map((t) => ({ ...t, orders: Number(t.orders), spent: round2(Number(t.spent)) })),
  };
}

export async function inventory(range: Range) {
  const products = await readReplicas.query<{ id: string; name: string; sku: string; stock: number; lowStockThreshold: number; price: string; sold: string }>(
    `SELECT p.id, p.name, p.sku, p.stock, p.low_stock_threshold AS "lowStockThreshold", p.price,
            COALESCE((SELECT SUM(oi.quantity) FROM order_items oi JOIN orders o ON o.id = oi.order_id
                       WHERE oi.product_id = p.id AND o.status <> 'cancelled' AND o.created_at BETWEEN :from AND :to), 0) AS sold
       FROM products p ORDER BY p.name`,
    range as unknown as Record<string, unknown>,
  );
  const list = products.map((p) => ({ ...p, price: Number(p.price), sold: Number(p.sold) }));
  const totalStock = list.reduce((s, p) => s + p.stock, 0);
  const totalSold = list.reduce((s, p) => s + p.sold, 0);
  return {
    range,
    summary: {
      totalProducts: list.length,
      lowStockCount: list.filter((p) => p.stock > 0 && p.stock <= p.lowStockThreshold).length,
      outOfStockCount: list.filter((p) => p.stock === 0).length,
      totalUnitsInStock: totalStock,
      totalInventoryValue: round2(list.reduce((s, p) => s + p.price * p.stock, 0)),
      unitsSold: totalSold,
      // Sell-through: share of (sold + on hand) that sold during the period.
      sellThroughRate: totalSold + totalStock ? round2((totalSold / (totalSold + totalStock)) * 100) : 0,
    },
    lowStockProducts: list.filter((p) => p.stock > 0 && p.stock <= p.lowStockThreshold).map(({ id, name, sku, stock, lowStockThreshold }) => ({ id, name, sku, stock, threshold: lowStockThreshold })),
    outOfStockProducts: list.filter((p) => p.stock === 0).map(({ id, name, sku }) => ({ id, name, sku })),
    topSellingProducts: [...list].sort((a, b) => b.sold - a.sold).filter((p) => p.sold > 0).slice(0, 10).map(({ id, name, sku, sold }) => ({ productId: id, name, sku, quantitySold: sold })),
    slowMovingProducts: list.filter((p) => p.stock > 10 && p.sold < 5).map(({ id, name, sku, stock, sold }) => ({ productId: id, name, sku, stock, sales: sold })),
  };
}

/** Real numbers for the capacity planner: average orders/day over 30 days, products, customers. */
export async function liveVolume() {
  const [row] = await readReplicas.query<{ orders: string; products: string; customers: string }>(
    `SELECT (SELECT COUNT(*) FROM orders WHERE created_at > NOW() - INTERVAL '30 days') AS orders,
            (SELECT COUNT(*) FROM products) AS products,
            (SELECT COUNT(*) FROM users WHERE role = 'customer') AS customers`,
  );
  return { dailyTransactions: Math.ceil(Number(row.orders) / 30), productCount: Number(row.products), customerCount: Number(row.customers) };
}

