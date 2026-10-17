# E-Commerce Platform

A TypeScript e-commerce backend (Express + PostgreSQL + Redis) with a Next.js storefront and admin console. It covers catalog, guest and account carts, checkout with discounts, shipping and tax, Stripe / PayPal / sandbox payments, refunds, fulfilment and tracking, reviews, wishlists, memberships, analytics with A/B testing, email campaigns, webhooks and third-party integrations. REST, GraphQL and tRPC all sit on the same services.

## What's inside

| Area | Highlights |
|---|---|
| Catalog | Products with variants (own price/stock/SKU), two-level category tree, PostgreSQL full-text search with prefix matching, filters, sorting, pagination, related products, low-stock alerts |
| Search | PostgreSQL FTS always on; Elasticsearch, Algolia and Meilisearch adapters with automatic sync and fallback to PostgreSQL |
| Cart | Account carts plus guest carts (`X-Cart-Token`) that merge on login/registration; stock checked on every change; live price quote |
| Checkout | Checkout saga (order + payment session, compensated on provider failure), Unit of Work transaction with row locks, order types (standard / express / pre-order), discount codes (percentage, fixed, free shipping, product/category scoped, global and per-customer limits), carrier rate cards (USPS/UPS/FedEx/DHL × ground/express/overnight, zones, free-shipping thresholds), destination tax (US states + ~45 countries), `Idempotency-Key` |
| Payments | Strategy pattern: Stripe PaymentIntents + signed webhooks, PayPal Orders v2 (create/capture/refund), sandbox provider for local use; platform fee / seller payout recorded per charge; refund saga with optional restock; unpaid orders expire and release stock |
| Fraud | Velocity rules in Redis (orders per user+IP, per device, failed payments), large orders, new accounts, country mismatch, blocklist; block or flag for review |
| Fulfilment | Status lifecycle with allowed transitions, audit trail (`order_events`), tracking numbers or Shippo labels, delivery estimates, customer cancellation (auto-refund when paid) |
| Customers | JWT auth with server-side revocation, profile and default address, password change, GDPR export and erasure, reviews (verified purchase, helpful votes), wishlist with move-to-cart, membership plans (free shipping; Stripe Billing or sandbox) |
| Growth | Event tracking (guest session or user), funnel, cohorts, sales/product/customer/inventory reports, A/B experiments with sticky assignment and a two-proportion z-test, customer segments, email campaigns with measured open/click rates, abandoned-cart reminders |
| Platform | Signed outgoing webhooks with retries, signed inbound fulfilment webhook, Mailchimp / Klaviyo / Shippo, background jobs with Redis locks |
| HLD/LLD | Saga, sharding (analytics events), read replicas, distributed cache, capacity estimation, constraints analysis, repository, unit of work, connection pooling, indexing, rate limiting, idempotency, structured logging, retry/circuit breaker/timeout, strategy and factory patterns. See [HLD_LLD_IMPLEMENTATION.md](HLD_LLD_IMPLEMENTATION.md) |
| Ops | Prometheus metrics, health/readiness probes, OpenAPI docs, Dockerfiles, docker compose, GitHub Actions CI |

## Tech stack

- **API:** Node.js 20+, TypeScript 5, Express 4, Sequelize 6 on PostgreSQL 14+ (umzug migrations with hand-written SQL), Redis 7 (ioredis), zod, JWT + bcrypt, Stripe SDK, PayPal REST, graphql + graphql-http, tRPC 11, Elasticsearch / Algolia / Meilisearch clients, winston, prom-client, Swagger UI
- **Storefront + admin (`frontend-test/`):** Next.js 14 (App Router), React 18, TypeScript, Tailwind CSS, Stripe Elements, PWA service worker

## Project structure

```
ecommerce-platform/
├── src/
│   ├── server.ts / app.ts           # bootstrap (migrations check, jobs, graceful shutdown) / Express app
│   ├── config/                      # env parsing, Sequelize connection
│   ├── db/                          # umzug runner + CLI, migrations 001-003, idempotent seed
│   ├── models/                      # User, Category, Product, Cart, Order (+items, events, transactions), engagement, platform tables
│   ├── middleware/                  # auth, validation (zod), errors, request context, rate limit, idempotency
│   ├── routes/                      # REST endpoints
│   ├── graphql/ trpc/ docs/         # GraphQL schema, tRPC router, OpenAPI document
│   └── services/
│       ├── commerce/                # cart, checkout/orders/payments/refunds, discounts, shipping, tax, memberships
│       ├── analytics/               # event tracking + reports, A/B testing
│       ├── marketing/ integrations/ notifications/ fraud/ search/
│       ├── saga/ repository/ unitOfWork/ patterns/        # LLD patterns
│       ├── caching/ rateLimiting/ idempotency/ errorHandling/ logging/
│       ├── readReplica/ sharding/ connectionPool/ indexing/ capacityEstimation/ systemConstraints/
│       ├── infra/kvStore.ts         # Redis or in-process store
│       ├── metrics.ts, jobs.ts
├── frontend-test/                   # Next.js storefront + admin console
├── docker-compose.yml, Dockerfile, frontend-test/Dockerfile
└── .github/workflows/ci.yml
```

## Getting started

### With Docker

```bash
docker compose up --build
```

Storefront http://localhost:3000, API http://localhost:5000 (docs at `/api-docs`). The API container runs migrations and the demo seed on start. `docker compose --profile search up` adds Elasticsearch and Meilisearch.

### Without Docker

Prerequisites: Node.js 20+, PostgreSQL 14+, optionally Redis 7.

```bash
npm install
cp .env.example .env          # set DATABASE_URL (and REDIS_URL if you have Redis)
npm run migrate               # create the schema
npm run seed                  # demo catalog, users, codes, segments, experiments
npm run dev                   # API on http://localhost:5000

cd frontend-test
npm install
cp .env.example .env.local    # NEXT_PUBLIC_API_URL=http://localhost:5000
npm run dev                   # storefront on http://localhost:3099
```

Seeded accounts: `admin@example.com / Admin123!` (admin, from `SEED_ADMIN_*`), `alice@example.com` and `bob@example.com` / `Customer123!`. Discount codes: `WELCOME10`, `SAVE20` (orders over $100), `FREESHIP`.

Without a Stripe key the store uses the **sandbox payment provider**: at checkout pick `pm_card_visa` or `pm_card_mastercard` to succeed, `pm_card_chargeDeclined` or `pm_card_insufficientFunds` to see a decline. Set `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY` and `STRIPE_WEBHOOK_SECRET` to switch cards to Stripe (Stripe Elements in the storefront, `POST /api/payments/webhook` for events). PayPal appears at checkout when `PAYPAL_CLIENT_ID`/`PAYPAL_CLIENT_SECRET` are set. Without SMTP settings, emails are logged and shown in Admin → System.

### Scripts

| Command | What it does |
|---|---|
| `npm run dev` | API with reload (tsx) |
| `npm run build` / `npm start` | compile to `dist/` / run compiled API |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run migrate` / `migrate:down` / `migrate:status` | apply / revert last / list migrations (`migrate:prod` for `dist/`) |
| `npm run migrate:shards` | create the analytics schema on every `DB_SHARDS` database |
| `npm run seed` | idempotent demo data (`seed:prod` for `dist/`) |

## API

Full list with auth levels: `GET /api-docs` (Swagger UI) or `/api-docs.json`. Responses are `{ success, data }`; errors are `{ success: false, error, details?, correlationId }`.

| Area | Endpoints |
|---|---|
| Auth | `POST /api/auth/register`, `POST /api/auth/login`, `GET/PUT/DELETE /api/auth/me`, `GET /api/auth/me/export`, `PUT /api/auth/password`, `POST /api/auth/logout` |
| Catalog | `GET /api/products`, `GET /api/products/:idOrSlug`, `GET /api/products/:id/reviews`, admin `POST/PUT/DELETE /api/products[/:id]`, `PATCH /api/products/:id/inventory`; `GET /api/categories[/:idOrSlug]`, admin `POST/PUT/DELETE /api/categories` |
| Cart | `GET/DELETE /api/cart`, `POST /api/cart/items`, `PUT/DELETE /api/cart/items/:itemId`, `POST /api/cart/merge`, `GET /api/cart/quote` |
| Orders | `POST /api/checkout` (saga), `POST /api/orders`, `GET /api/orders`, `GET /api/orders/:id`, `GET /api/orders/:id/track`, `POST /api/orders/:id/cancel`, admin `PATCH /api/orders/:id/status` |
| Payments | `GET /api/payments/config`, `POST /api/payments/create-intent`, `POST /api/payments/confirm`, `POST /api/payments/webhook`, `POST /api/payments/paypal/create`, `POST /api/payments/paypal/capture`, admin `POST /api/payments/refund/:orderId` |
| Engagement | `POST/PUT/DELETE /api/reviews[/:id]`, `POST /api/reviews/:id/helpful`; `GET/POST/PUT/DELETE /api/wishlist[/:id]`, `POST /api/wishlist/:id/move-to-cart`; `POST /api/discounts/validate` + admin CRUD; `GET /api/subscriptions/plans`, `GET/POST /api/subscriptions`, `POST /api/subscriptions/:id/cancel`, `.../resume`, `POST /api/subscriptions/webhook` |
| Search & shipping | `GET /api/search`, `GET /api/search/suggest`, admin `GET /api/search/engines`, `POST /api/search/reindex`; `GET /api/shipping/carriers`, `GET /api/shipping/rates`, `POST /api/shipping/validate-address`, `GET /api/tax` |
| Analytics | `POST /api/analytics/track`; admin `GET /api/analytics/{sales,products,customers,inventory,funnel,cohort,events}`; `GET /api/experiments`, `GET /api/experiments/:key/assignment`, `POST /api/experiments/:key/convert`, admin stats/CRUD |
| Marketing | admin `/api/marketing/campaigns` (CRUD, `send`, `pause`), `/api/marketing/segments` (CRUD, `members`), `POST /api/marketing/abandoned-cart`, `GET /api/marketing/analytics`; public tracking `/api/marketing/t/:token/open.gif` and `/click` |
| Integrations & webhooks | `POST /api/integrations/webhook` (signed), admin `GET /api/integrations/status`, `POST /api/integrations/{shippo,mailchimp,klaviyo}`; `GET/POST/PATCH/DELETE /api/webhooks`, deliveries, test ping, redeliver |
| System | `GET /health`, `GET /ready`, `GET /metrics`; admin `/api/system/{health,capacity,constraints,indexes,shards,replicas,sagas,circuits,outbox,fraud/:userId}`, `POST /api/system/jobs/:name/run`, `POST /api/system/cache/flush` |
| GraphQL / tRPC | `POST /graphql`, `/trpc/*` (see [ECOMMERCE_IMPLEMENTATION.md](ECOMMERCE_IMPLEMENTATION.md)) |

Request headers the API understands: `Authorization: Bearer <jwt>`, `X-Cart-Token` (guest cart), `X-Session-Id` (anonymous analytics / experiments), `Idempotency-Key` (checkout, orders, payment intents, refunds), `X-Correlation-Id`.

### Webhooks

Outgoing events: `order.created`, `order.paid`, `order.status_changed`, `order.refunded` (customers receive their own orders' events) and `product.low_stock`, `review.created` (admins). Each POST carries `X-Webhook-Id`, `X-Webhook-Event`, `X-Webhook-Timestamp` and `X-Webhook-Signature: sha256=HMAC(secret, "<timestamp>.<body>")`. Failed deliveries are retried after 1, 2, 4 and 8 minutes.

The inbound fulfilment webhook expects `X-Timestamp` and `X-Signature: sha256=HMAC(INTEGRATION_WEBHOOK_SECRET, "<timestamp>.<raw body>")` and accepts `order.shipped` / `order.delivered`.

## Storefront and admin (`frontend-test/`)

- **Shop:** home, catalog with category tree, price and stock filters and sorting, search suggestions, product pages with variants, reviews (write, sort, helpful votes) and related items, A/B-tested price display.
- **Buying:** guest cart that follows you into your account, discount codes and live tax/shipping quote, checkout with carrier, speed and order type, payment by sandbox test card, Stripe Elements or PayPal redirect, order history, tracking timeline, cancellation, pay-again after a decline.
- **Account:** wishlist, membership, profile and default address, password change, order webhooks, data export, account deletion.
- **Admin (role `admin`):** dashboard (revenue, funnel, top products and customers, low stock, cohorts), orders (filters, fraud flags, status changes, shipping, refunds), products (CRUD, variants, stock), discount codes, marketing (segments, campaigns, open/click rates, abandoned carts), experiments (live stats and significance), system (dependencies, breakers, jobs, capacity, sagas, unused indexes, email outbox).
- Installable PWA; the service worker never caches API responses.

## Security

JWTs are revocable (token version on the user), passwords are bcrypt-hashed with strength rules, auth endpoints have their own rate limit, every input is validated with zod, roles are enforced per route, Stripe and inbound webhooks are signature-checked and deduplicated, outgoing webhook targets cannot point at private networks (unless `WEBHOOK_ALLOW_PRIVATE=true`), campaign click redirects stay on the storefront origin, helmet sets security headers, and card data never reaches the API.

## Monitoring

Prometheus metrics on `/metrics` (HTTP rate and latency per route, cache hit ratio, rate-limit rejections, orders, payments, revenue, circuit breaker state, DB pool). JSON logs in `logs/` with correlation ids; payment, security and audit events also in `logs/payments.log`.

## Verification status

Verified locally against PostgreSQL 18 and Redis 8: 146 end-to-end API checks, repeated with two analytics shards plus a read replica, and with the in-process store plus Elasticsearch; Stripe flows against stripe-mock; migrations up/down/up and idempotent seed; 22 browser checks of the storefront and admin in Microsoft Edge; API and storefront typecheck, lint and production build.

Not verified on this machine: Docker images and compose (no Docker daemon), live Stripe / PayPal / Shippo / Mailchimp / Klaviyo accounts, Algolia and Meilisearch, real streaming replication. Tax uses base rate tables (no county/city surcharges) and shipping uses store rate cards; live carrier rates and labels need Shippo.

## License

Proprietary - All rights reserved.

## Author

**Alakhdeep Singh** - [GitHub](https://github.com/Alakhdeepsingh) · [LinkedIn](https://linkedin.com/in/alakhdeepsingh)
