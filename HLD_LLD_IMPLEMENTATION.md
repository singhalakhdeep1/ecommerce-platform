# E-commerce Platform - HLD/LLD Implementation Guide

## Overview
This document maps every High-Level Design (HLD) and Low-Level Design (LLD) topic of the platform to the TypeScript code that implements it, and explains where it is used in a real request path. The datastore is PostgreSQL (the original draft of this guide used MongoDB examples; the implementation is PostgreSQL + Sequelize throughout), with Redis as the shared store for caching, rate limiting, idempotency and counters.

Everything listed here was exercised against a real PostgreSQL 18 and Redis 8 server (plus Elasticsearch 8.17 and stripe-mock for those adapters), see "Verification" at the end.

## Implemented Topics

### HLD Topics (High-Level Design)

#### 1. Saga Pattern
**Location:** `src/services/saga/sagaManager.ts` (used by `src/services/commerce/orderService.ts`)

**Description:** Orchestrated sagas with compensation. Every run is persisted in `saga_executions` (completed steps, compensated steps, failing step, error) and listed on `GET /api/system/sagas`.

**Where it runs:**
- **Checkout** (`POST /api/checkout`): `PlaceOrder` (reserve stock, create order, redeem discount) -> `CreatePaymentSession` (Stripe PaymentIntent / PayPal order / sandbox intent). If the provider call fails, `PlaceOrder` is compensated: the order is cancelled, stock and the discount use are released.
- **Refund** (`POST /api/payments/refund/:orderId`): `Restock` -> `ProviderRefund` -> `RecordRefund`. If the provider rejects the refund, the restock is compensated.

```ts
const result = await sagaManager.execute(
  {
    name: 'Checkout',
    steps: [
      { name: 'PlaceOrder', execute: async (c) => { c.order = await placeOrder(input); }, compensate: async (c) => cancelUnpaidOrder(c.order!.id, null, 'Payment could not be started') },
      { name: 'CreatePaymentSession', execute: async (c) => { c.payment = await startPayment(c.order!, user); } },
    ],
  },
  ctx,
);
```

#### 2. Database Sharding
**Location:** `src/services/sharding/databaseShardingService.ts`

**Description:** The analytics event stream (the highest-volume, append-only table) can be split across PostgreSQL shards. Keys (customer id, or session id for guests) are placed with consistent hashing on a ring of virtual nodes (100 per unit of weight), so adding a shard moves only about 1/N of the keys. Reports fan out to every shard and merge (`executeOnAllShards`); because the subject is the shard key, per-shard distinct counts can be summed.

**Configuration:** `DB_SHARDS=shard_a=postgres://...,shard_b=postgres://...`, then `npm run migrate:shards` (or `POST /api/system/shards/migrate`) to create the shard schema. Health and an optional key-distribution sample: `GET /api/system/shards?sample=10000`.

```ts
const shardId = sharding.getShardIdByCustomer(userId);
await sharding.executeOnShard(shardId, (db) => db.query('INSERT INTO analytics_events ...'));
const perShard = await sharding.executeOnAllShards((db) => db.query('SELECT ... GROUP BY event_type'));
```

`getShardId(region, segment)` routes by region/segment when shard ids carry those tokens (e.g. `us_premium`), otherwise it hashes the pair.

#### 3. Read Replicas
**Location:** `src/services/readReplica/readReplicaService.ts`

**Description:** Analytics and report queries (`src/services/analytics/analyticsService.ts`) run on PostgreSQL streaming replicas, chosen at random among healthy ones; writes always go to the primary. A health check every 15 s reads `pg_last_xact_replay_timestamp()` and takes a replica out of rotation when it lags more than `DB_REPLICA_MAX_LAG_SECONDS` or stops answering. A failed replica read is retried on the primary. With no replicas configured, reads use the primary.

**Configuration:** `DB_READ_REPLICAS=postgres://...` (optionally `region|postgres://...` for `getReplicaByRegion`). Lag: `GET /api/system/replicas`.

#### 4. Distributed Caching Coherency
**Location:** `src/services/caching/distributedCacheService.ts` on top of `src/services/infra/kvStore.ts`

**Description:** Cache-aside over Redis, so all API instances share one cache. Product lists, product detail pages and the category tree are cached; every product, category, review, stock or order change invalidates `products:*` / `categories:*` with SCAN (never `KEYS`). Concurrent misses for the same key share one database query (stampede guard). Hit/miss counts are exported as `ecommerce_cache_requests_total`. Without `REDIS_URL` an in-process store is used (single instance only); if Redis fails mid-request, the call degrades to the in-process store instead of failing.

```ts
const data = await cache.getOrSet(`products:detail:${slug}`, () => loadProduct(slug), 60);
await cache.invalidatePattern('products:*');
```

#### 5. Capacity Estimation
**Location:** `src/services/capacityEstimation/capacityEstimationService.ts`

**Description:** Storage, IOPS, CPU/server count, bandwidth and Redis memory estimates. `GET /api/system/capacity` feeds it the live volume (orders per day over the last 30 days, product and customer counts); query parameters (`dailyTransactions`, `productCount`, `customerCount`) model a hypothetical volume. Recommendations point at the switches this codebase actually has (shards, replicas, Redis Cluster, CDN).

#### 6. System Constraints Analysis
**Location:** `src/services/systemConstraints/systemConstraintsAnalysisService.ts`, measurements in `src/middleware/requestContext.ts`

**Description:** `GET /api/system/constraints?targetLatencyMs=200&targetTPS=50&targetUptime=99.9` compares targets with what the API measured over the last 5 minutes (average and p95 latency, requests per second, share of non-5xx responses) and lists the security and compliance controls that are really implemented (bcrypt, revocable JWTs, roles, rate limits, audit log, no card data stored, data export and erasure endpoints), with a compliance score.

### LLD Topics (Low-Level Design)

#### 1. Repository Pattern
**Location:** `src/services/repository/repository.ts`

**Description:** Generic repository over a Sequelize model: `findById` (optionally `SELECT ... FOR UPDATE`), `findWhere`, `findSingle`, `exists`, `count`, `create`, `bulkCreate`, `update`, `delete`, `paginate` (offset, capped at 100 per page) and `cursorPaginate` (keyset on `(createdAt, id)`, opaque base64url cursor). Used by the product, order, review and discount listings and by every Unit of Work.

```ts
const page = await new Repository(Product).paginate(1, 20, { where: { published: true } });
const next = await new Repository(Order).cursorPaginate(cursor, 20, { userId });
```

#### 2. Unit of Work Pattern
**Location:** `src/services/unitOfWork/unitOfWork.ts`

**Description:** One database transaction shared by all repositories it hands out; commits when the callback resolves, rolls back when it throws. `afterCommit` hooks run side effects (emails, webhooks, velocity counters, cache invalidation) only once the data is durable. Checkout, payment capture, cancellation, refunds and preorder release all run in a Unit of Work.

```ts
await UnitOfWork.run(async (uow) => {
  const order = await uow.repository(Order).create({ ... });
  await uow.repository(OrderItem).bulkCreate(items);
  uow.afterCommit(() => dispatch('order.created', { orderId: order.id }, userId));
});
```

#### 3. Connection Pooling
**Location:** `src/services/connectionPool/connectionPoolService.ts`

**Description:** The primary uses the Sequelize/pg pool (`DB_POOL_MAX`). Read replicas and shards get their clients from `ConnectionPoolService`, which keeps one pooled client per connection string, closes clients idle longer than `CONNECTION_POOL_LIFETIME`, caps the number of clients (`CONNECTION_POOL_MAX_SIZE`) and reports pool sizes, in-use, idle and waiting counts (`GET /api/system/health`, Prometheus gauge `ecommerce_db_pool_connections`). Connection strings are reported without credentials.

#### 4. Database Indexing
**Location:** `src/db/migrations/002-indexes-and-search.ts`, `src/services/indexing/databaseIndexingService.ts`

**Description:** Migration 002 creates the composite and partial indexes for the queries the API runs (catalog filters, a customer's order history, admin status queues, pending webhook deliveries, active discounts...) plus a weighted `tsvector` with a GIN index for full-text search. The indexing service lists indexes with their scan counts and sizes, finds never-used ones, and creates / drops / rebuilds indexes `CONCURRENTLY` (identifiers are validated; admin only): `GET /api/system/indexes`, `GET /api/system/indexes/unused`, `POST /api/system/indexes`, `DELETE /api/system/indexes/:name`, `POST /api/system/indexes/rebuild`.

#### 5. API Rate Limiting
**Location:** `src/services/rateLimiting/rateLimitingService.ts`, `src/middleware/rateLimit.ts`

**Description:** Token bucket per user (or IP when anonymous). The bucket lives in Redis and is updated by a Lua script, so concurrent requests on several instances can never spend the same token. Policies: global API (`RATE_LIMIT_BUCKET_CAPACITY` burst, `RATE_LIMIT_REFILL_RATE` tokens/s), auth endpoints (`AUTH_RATE_LIMIT_PER_MINUTE`), analytics tracking. Responses carry `RateLimit-Limit` / `RateLimit-Remaining`, and 429s carry `Retry-After`; rejections are counted in `ecommerce_rate_limited_total`.

#### 6. Idempotency Patterns
**Location:** `src/services/idempotency/idempotencyService.ts`, `src/middleware/idempotency.ts`

**Description:** `Idempotency-Key` on `POST /api/checkout`, `POST /api/orders`, `POST /api/payments/create-intent` and refunds. The first request takes a lock (`SET NX`), runs, and stores status + body for 24 h; a retry with the same key and body gets the stored response (`Idempotent-Replayed: true`), a concurrent duplicate gets 409, and the same key with a different body gets 422. Orders also store the key in a unique column, and the key is forwarded to Stripe and PayPal so the provider never charges twice. Webhooks are deduplicated by provider event id (`processed_webhook_events`).

#### 7. Structured Logging
**Location:** `src/services/logging/structuredLoggingService.ts`, `src/middleware/requestContext.ts`, `src/utils/logger.ts`

**Description:** Each request runs in an `AsyncLocalStorage` context with a correlation id (accepted from `X-Correlation-Id` or generated, echoed back and included in every error response), user id and IP, so every log line written while serving it carries them. JSON logs go to `logs/combined.log` and `logs/error.log`; payment, security and audit events (logins, failed logins, access denied, refunds, fraud decisions, account deletion, order lifecycle) also go to `logs/payments.log`.

```ts
structuredLog.logAuditEvent('OrderRefunded', `Refunded ${amount} on ${orderNumber}`, { orderId, amount });
structuredLog.logOrderEvent(orderId, 'PaymentCaptured', `Order ${orderNumber} paid via stripe`, { amount });
```

#### 8. Error Handling Patterns
**Location:** `src/services/errorHandling/errorHandlingService.ts`, `src/middleware/errorHandler.ts`

**Description:** Retry with exponential backoff and jitter, circuit breaker (closed / open / half-open) and timeout, composed by `executeWithResilience`, with one breaker per dependency: Stripe, PayPal, Shippo, Mailchimp, Klaviyo, SMTP and each search engine. Only transient failures (network errors, timeouts, 429, 5xx) are retried or count against the breaker; a declined card is not a provider outage. `executeWithFallback` powers search (an Elasticsearch/Algolia/Meilisearch failure is answered by PostgreSQL full-text search). Breaker states: `GET /api/system/circuits`, reset with `POST /api/system/circuits/:name/reset`, gauge `ecommerce_circuit_breaker_open`. The error middleware maps validation, unique/foreign-key violations, open circuits (503), timeouts (504) and Stripe card errors (402) to proper statuses.

#### 9. GoF Patterns

##### Strategy Pattern (Payment Providers)
**Location:** `src/services/patterns/paymentStrategy.ts`

**Description:** `PaymentStrategy` with three implementations: `StripePaymentStrategy` (PaymentIntents, refunds, idempotency keys), `PayPalPaymentStrategy` (Orders v2 REST API: OAuth client credentials, create, capture, refund by capture id) and `SandboxPaymentStrategy` (local test provider used when no Stripe key is set; confirms with Stripe-style test ids such as `pm_card_visa` and never sees card data). `PaymentStrategyFactory.fromEnv()` picks what is configured; `cardProvider()` decides whether cards go to Stripe or the sandbox, `getStrategyForCurrency()` selects by currency, and `calculateFee()` feeds the fee report.

```ts
const strategy = payments.getStrategy(order.paymentMethod === 'paypal' ? 'paypal' : payments.cardProvider());
const session = await strategy.createPayment({ orderId, amount, currency, idempotencyKey, ... });
const refund = await payments.getStrategy(charge.provider).processRefund({ providerRef, amount, currency, idempotencyKey });
```

##### Factory Pattern (Order Creation)
**Location:** `src/services/patterns/orderFactory.ts`

**Description:** `OrderFactory.createOrder(type)` returns `StandardOrder`, `ExpressOrder` or `PreorderOrder`. Each type validates the cart (stock; express orders max 20 items; preorders only for out-of-stock items), decides whether stock is reserved at checkout (preorders reserve it when an admin releases them to processing) and the default shipping service, and sets the status after payment (preorders wait in `pending`).

## Configuration

All settings are environment variables; `.env.example` documents every one. The HLD-specific ones:

```env
DATABASE_URL=postgres://postgres:postgres@localhost:5432/ecommerce
REDIS_URL=redis://localhost:6379

# Sharding (analytics events) and read replicas
DB_SHARDS=shard_a=postgres://.../shard_a,shard_b=postgres://.../shard_b
DB_READ_REPLICAS=us-east|postgres://replica-1/ecommerce
DB_REPLICA_MAX_LAG_SECONDS=30

# Cache
CACHE_DEFAULT_EXPIRATION=300
CACHE_KEY_PREFIX=ecommerce:

# Connection pool (replica/shard clients)
CONNECTION_POOL_MAX_SIZE=100
CONNECTION_POOL_LIFETIME=1800000

# Rate limiting
RATE_LIMIT_BUCKET_CAPACITY=100
RATE_LIMIT_REFILL_RATE=1.0

# Idempotency
IDEMPOTENCY_EXPIRATION=86400
IDEMPOTENCY_KEY_PREFIX=idempotency:

# Error handling
ERROR_HANDLING_RETRY_COUNT=2
ERROR_HANDLING_EXCEPTIONS_BEFORE_BREAKING=5
ERROR_HANDLING_BREAK_DURATION=30000
ERROR_HANDLING_TIMEOUT=15000

# Capacity
CAPACITY_CORES_PER_SERVER=4
CAPACITY_MEMORY_PER_SERVER_GB=16
CAPACITY_REDIS_MEMORY_PER_NODE_GB=8

# Compliance
COMPLIANCE_DATA_RETENTION_YEARS=7
COMPLIANCE_REQUIRE_ENCRYPTION=true
COMPLIANCE_REQUIRE_AUDIT_LOGGING=true
```

## Dependencies

Runtime dependencies are declared in `package.json`: express, sequelize + pg, ioredis, umzug, zod, jsonwebtoken, bcryptjs, helmet, cors, winston, prom-client, stripe, axios (PayPal, Shippo, Mailchimp, Klaviyo), nodemailer, graphql + graphql-http, @trpc/server, @elastic/elasticsearch, algoliasearch, meilisearch, swagger-ui-express.

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                     API Gateway Layer                        │
│  correlation id · helmet/CORS · JWT auth · token-bucket      │
│  rate limits · Idempotency-Key · REST / GraphQL / tRPC       │
└─────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────────────────────────────────────┐
│                   Application Layer                          │
│  routes/*  ·  services/commerce (cart, checkout, payments,    │
│  refunds, discounts, shipping, tax, membership)  ·  fraud    │
│  analytics + A/B tests  ·  marketing  ·  integrations · jobs │
└─────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────────────────────────────────────┐
│                   Business Logic Layer                       │
│  Saga Manager · Repository · Unit of Work ·                  │
│  Payment Strategy · Order Factory                            │
└─────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────────────────────────────────────┐
│                   Infrastructure Layer                       │
│  Sharding · Read Replicas · Distributed Cache ·              │
│  Connection Pool · Rate Limiting · Idempotency ·             │
│  Circuit breakers / retries / timeouts                       │
└─────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────────────────────────────────────┐
│                   Data Layer                                 │
│  PostgreSQL primary (+ replicas, + analytics shards)         │
│  Redis (cache, limits, idempotency, counters, job locks)     │
│  PostgreSQL FTS / Elasticsearch / Algolia / Meilisearch      │
└─────────────────────────────────────────────────────────────┘
```

## Monitoring and Observability

### Health Checks
- `GET /health` (liveness + database), `GET /ready` (no pending migrations)
- `GET /api/system/health` (admin): database latency, Redis, replica lag, shard health, pool statistics, circuit breakers, search engines, background jobs, live traffic

### Metrics (`GET /metrics`, Prometheus)
- `ecommerce_http_requests_total`, `ecommerce_http_request_duration_seconds` (by route)
- `ecommerce_cache_requests_total{result}` (hit/miss ratio)
- `ecommerce_rate_limited_total{policy}`
- `ecommerce_orders_created_total`, `ecommerce_payments_total{provider,outcome}`, `ecommerce_revenue_total`
- `ecommerce_circuit_breaker_open{name}`, `ecommerce_db_pool_connections{state}`
- default Node.js process metrics

### Logging
- Structured JSON logs with correlation ids; audit, payment and security events in `logs/payments.log`

## Security Features

- JWT authentication with server-side revocation (token version bumped on logout, password change and account deletion)
- bcrypt password hashing, password rules, brute-force limits on auth endpoints
- Role-based access (customer, seller, admin)
- Rate limiting, idempotency protection, webhook signature verification (Stripe and inbound partner webhooks), signed outgoing webhooks, SSRF protection for webhook targets, no open redirects in campaign links
- Card data never touches the API (Stripe Elements / PayPal / sandbox test ids)

## Compliance Features

- Data retention setting and audit log (`logs/payments.log`)
- GDPR/CCPA: `GET /api/auth/me/export` (data portability), `DELETE /api/auth/me` (erasure: account anonymised, orders kept for accounting)
- Compliance scoring on `GET /api/system/constraints`

## Performance Optimizations

- Analytics events sharded by customer when needed; report queries on read replicas
- Shared Redis cache for catalog reads with invalidation on writes
- Pooled connections for primary, replicas and shards
- Composite, partial and GIN indexes; full-text search instead of `LIKE` scans
- Keyset pagination for large lists

## Resilience Features

- Retry with exponential backoff and jitter, circuit breakers and timeouts per external dependency
- Search falls back to PostgreSQL when an external engine fails
- Replica failover to the primary; Redis failures degrade to the in-process store
- Outgoing webhooks stored first and retried with backoff by a background job
- Unpaid orders expire and release their stock; background jobs take a Redis lock so only one instance runs each tick

## Verification

Run on Windows against real services (Docker was not available on this machine, so the compose file and Dockerfiles were not run):
- PostgreSQL 18 + Redis 8: 146 end-to-end API checks (auth, catalog, guest cart merge, discounts, checkout saga, idempotent replay, sandbox payments, fulfilment, partial/full refund saga, reviews, wishlist, membership, signed outgoing and inbound webhooks, fraud flagging, analytics, A/B stats, campaigns with open/click tracking, search, GraphQL, tRPC, system endpoints, metrics, GDPR export/delete).
- The same suite with two shards and a read replica configured, and again with no Redis (in-process store) and Elasticsearch as the search engine; Elasticsearch shutdown falls back to PostgreSQL.
- Stripe paths against stripe-mock: PaymentIntent creation, signed webhook, duplicate webhook, refund.
- Migrations: up, down x3, up, seed twice (idempotent).
- Storefront and admin: 22 browser checks in Microsoft Edge.

Not verified here: live Stripe/PayPal/Shippo/Mailchimp/Klaviyo accounts, Algolia and Meilisearch (adapters written to their current SDKs, not run), real PostgreSQL streaming replication (replica routing was tested against a second connection to the primary), Docker images and Kubernetes.

## References

- [Saga Pattern](https://microservices.io/patterns/data/saga.html)
- [Repository Pattern](https://martinfowler.com/eaaCatalog/repository.html)
- [Unit of Work Pattern](https://martinfowler.com/eaaCatalog/unitOfWork.html)
- [Token Bucket Algorithm](https://en.wikipedia.org/wiki/Token_bucket)
- [Circuit Breaker Pattern](https://martinfowler.com/bliki/CircuitBreaker.html)
- [Consistent Hashing](https://en.wikipedia.org/wiki/Consistent_hashing)
- [Strategy Pattern](https://refactoring.guru/design-patterns/strategy)
- [Factory Pattern](https://refactoring.guru/design-patterns/factory-method)
- [Stripe idempotent requests](https://docs.stripe.com/api/idempotent_requests)
- [PostgreSQL full-text search](https://www.postgresql.org/docs/current/textsearch.html)
