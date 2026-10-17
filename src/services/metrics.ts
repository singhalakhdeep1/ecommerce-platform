import client from 'prom-client';

/** Prometheus metrics, exposed on GET /metrics. */
export const registry = new client.Registry();
client.collectDefaultMetrics({ register: registry, prefix: 'ecommerce_' });

export const metrics = {
  httpRequests: new client.Counter({
    name: 'ecommerce_http_requests_total',
    help: 'HTTP requests by method, route and status',
    labelNames: ['method', 'route', 'status'] as const,
    registers: [registry],
  }),
  httpDuration: new client.Histogram({
    name: 'ecommerce_http_request_duration_seconds',
    help: 'HTTP request latency',
    labelNames: ['method', 'route'] as const,
    buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
    registers: [registry],
  }),
  cacheRequests: new client.Counter({
    name: 'ecommerce_cache_requests_total',
    help: 'Cache lookups by result',
    labelNames: ['result'] as const,
    registers: [registry],
  }),
  rateLimited: new client.Counter({
    name: 'ecommerce_rate_limited_total',
    help: 'Requests rejected by the rate limiter',
    labelNames: ['policy'] as const,
    registers: [registry],
  }),
  ordersCreated: new client.Counter({
    name: 'ecommerce_orders_created_total',
    help: 'Orders created',
    registers: [registry],
  }),
  payments: new client.Counter({
    name: 'ecommerce_payments_total',
    help: 'Payment outcomes by provider',
    labelNames: ['provider', 'outcome'] as const,
    registers: [registry],
  }),
  revenue: new client.Counter({
    name: 'ecommerce_revenue_total',
    help: 'Captured revenue (order currency units)',
    registers: [registry],
  }),
  circuitState: new client.Gauge({
    name: 'ecommerce_circuit_breaker_open',
    help: '1 when the named circuit breaker is open',
    labelNames: ['name'] as const,
    registers: [registry],
  }),
  dbPool: new client.Gauge({
    name: 'ecommerce_db_pool_connections',
    help: 'Primary database pool connections by state',
    labelNames: ['state'] as const,
    registers: [registry],
  }),
};
