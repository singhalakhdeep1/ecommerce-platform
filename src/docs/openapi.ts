/**
 * OpenAPI 3 description served at /api-docs (Swagger UI) and /api-docs.json. Every route is listed
 * with its auth level; the main write endpoints also document their request bodies.
 */
type Access = 'public' | 'user' | 'admin' | 'optional';
type Route = [method: string, path: string, summary: string, access: Access, body?: string];

const ROUTES: Record<string, Route[]> = {
  Auth: [
    ['post', '/api/auth/register', 'Create an account (merges a guest cart sent in X-Cart-Token)', 'public', 'Register'],
    ['post', '/api/auth/login', 'Sign in and get a JWT', 'public', 'Login'],
    ['get', '/api/auth/me', 'Current user', 'user'],
    ['put', '/api/auth/me', 'Update profile', 'user'],
    ['delete', '/api/auth/me', 'Delete (anonymise) my account', 'user'],
    ['get', '/api/auth/me/export', 'Export my data (JSON)', 'user'],
    ['put', '/api/auth/password', 'Change password (signs out other sessions)', 'user'],
    ['post', '/api/auth/logout', 'Revoke all my tokens', 'user'],
  ],
  Products: [
    ['get', '/api/products', 'List / filter / sort / paginate products', 'optional'],
    ['get', '/api/products/{idOrSlug}', 'Product with category, reviews and related products', 'optional'],
    ['get', '/api/products/{id}/reviews', 'Paginated reviews + rating distribution', 'public'],
    ['post', '/api/products', 'Create product', 'admin', 'Product'],
    ['put', '/api/products/{id}', 'Update product', 'admin', 'Product'],
    ['delete', '/api/products/{id}', 'Delete product', 'admin'],
    ['patch', '/api/products/{id}/inventory', 'Set stock or adjust it by a delta', 'admin'],
  ],
  Categories: [
    ['get', '/api/categories', 'Category tree with product counts (?flat=true for a list)', 'public'],
    ['get', '/api/categories/{idOrSlug}', 'Category with parent and children', 'public'],
    ['post', '/api/categories', 'Create category', 'admin'],
    ['put', '/api/categories/{id}', 'Update category', 'admin'],
    ['delete', '/api/categories/{id}', 'Delete category', 'admin'],
  ],
  Cart: [
    ['get', '/api/cart', 'Current cart (account cart, or guest cart via X-Cart-Token)', 'optional'],
    ['post', '/api/cart/items', 'Add item (returns X-Cart-Token for new guest carts)', 'optional', 'CartAdd'],
    ['put', '/api/cart/items/{itemId}', 'Change quantity', 'optional'],
    ['delete', '/api/cart/items/{itemId}', 'Remove item', 'optional'],
    ['delete', '/api/cart', 'Empty the cart', 'optional'],
    ['post', '/api/cart/merge', 'Merge a guest cart into my cart', 'user'],
    ['get', '/api/cart/quote', 'Price breakdown: discount, shipping, tax, total', 'optional'],
  ],
  Checkout: [
    ['post', '/api/checkout', 'Checkout saga: place order + open payment session (Idempotency-Key supported)', 'user', 'PlaceOrder'],
    ['post', '/api/orders', 'Place order from cart (no payment yet)', 'user', 'PlaceOrder'],
    ['get', '/api/orders', 'My orders (admins: ?all=true with filters)', 'user'],
    ['get', '/api/orders/{id}', 'Order with items, events and payment transactions', 'user'],
    ['get', '/api/orders/{id}/track', 'Tracking timeline and delivery estimate', 'user'],
    ['post', '/api/orders/{id}/cancel', 'Cancel (refunds paid orders)', 'user'],
    ['patch', '/api/orders/{id}/status', 'Move order through its lifecycle', 'admin', 'OrderStatus'],
  ],
  Payments: [
    ['get', '/api/payments/config', 'Which payment providers are active', 'public'],
    ['post', '/api/payments/create-intent', 'Start card payment (Stripe PaymentIntent or sandbox)', 'user'],
    ['post', '/api/payments/confirm', 'Confirm card payment (sandbox test method / Stripe re-check)', 'user'],
    ['post', '/api/payments/webhook', 'Stripe webhook (signature verified)', 'public'],
    ['post', '/api/payments/refund/{orderId}', 'Full or partial refund (refund saga)', 'admin'],
    ['post', '/api/payments/paypal/create', 'Create PayPal order, get approval URL', 'user'],
    ['post', '/api/payments/paypal/capture', 'Capture approved PayPal order', 'user'],
  ],
  Reviews: [
    ['post', '/api/reviews', 'Write a review (verified if purchased)', 'user'],
    ['put', '/api/reviews/{id}', 'Edit my review', 'user'],
    ['delete', '/api/reviews/{id}', 'Delete my review (admins: any)', 'user'],
    ['post', '/api/reviews/{id}/helpful', 'Mark helpful (once per user)', 'user'],
  ],
  Wishlist: [
    ['get', '/api/wishlist', 'My wishlist', 'user'],
    ['post', '/api/wishlist', 'Add product', 'user'],
    ['put', '/api/wishlist/{id}', 'Update notes / priority', 'user'],
    ['delete', '/api/wishlist/{id}', 'Remove item', 'user'],
    ['delete', '/api/wishlist', 'Clear wishlist', 'user'],
    ['post', '/api/wishlist/{id}/move-to-cart', 'Move to cart', 'user'],
  ],
  Discounts: [
    ['post', '/api/discounts/validate', 'Validate a code against the cart', 'optional'],
    ['get', '/api/discounts', 'List codes', 'admin'],
    ['get', '/api/discounts/{id}', 'Code with redemptions', 'admin'],
    ['post', '/api/discounts', 'Create code', 'admin'],
    ['put', '/api/discounts/{id}', 'Update code', 'admin'],
    ['delete', '/api/discounts/{id}', 'Delete (or deactivate if used)', 'admin'],
  ],
  Subscriptions: [
    ['get', '/api/subscriptions/plans', 'Membership plans (members get free shipping)', 'public'],
    ['get', '/api/subscriptions', 'My subscriptions', 'user'],
    ['post', '/api/subscriptions', 'Subscribe (Stripe Checkout or sandbox)', 'user'],
    ['post', '/api/subscriptions/{id}/cancel', 'Cancel now or at period end', 'user'],
    ['post', '/api/subscriptions/{id}/resume', 'Undo cancel-at-period-end', 'user'],
    ['post', '/api/subscriptions/webhook', 'Stripe Billing webhook', 'public'],
  ],
  Search: [
    ['get', '/api/search', 'Search products (postgres / elasticsearch / algolia / meilisearch, with fallback)', 'optional'],
    ['get', '/api/search/suggest', 'Instant suggestions', 'public'],
    ['get', '/api/search/engines', 'Engine health', 'admin'],
    ['post', '/api/search/reindex', 'Rebuild external indexes', 'admin'],
  ],
  Shipping: [
    ['get', '/api/shipping/carriers', 'Carriers and rate cards', 'public'],
    ['get', '/api/shipping/rates', 'Quotes for a destination and weight', 'public'],
    ['post', '/api/shipping/validate-address', 'Validate an address', 'public'],
    ['get', '/api/tax', 'Tax for an amount and destination', 'public'],
    ['get', '/api/tax/jurisdictions', 'Supported tax jurisdictions', 'public'],
  ],
  Analytics: [
    ['post', '/api/analytics/track', 'Track a storefront event (X-Session-Id for guests)', 'optional'],
    ['get', '/api/analytics/sales', 'Revenue, AOV, trend', 'admin'],
    ['get', '/api/analytics/products', 'Top sellers, views, ratings', 'admin'],
    ['get', '/api/analytics/customers', 'Customers, repeat rate, LTV, top customers', 'admin'],
    ['get', '/api/analytics/inventory', 'Stock health and sell-through', 'admin'],
    ['get', '/api/analytics/funnel', 'View > cart > checkout > purchase', 'admin'],
    ['get', '/api/analytics/cohort', 'Monthly signup cohorts and purchase retention', 'admin'],
    ['get', '/api/analytics/events', 'Event counts by type and A/B group', 'admin'],
  ],
  Experiments: [
    ['get', '/api/experiments', 'Experiments', 'optional'],
    ['get', '/api/experiments/{key}/assignment', 'My variant (sticky)', 'optional'],
    ['post', '/api/experiments/{key}/convert', 'Record a conversion', 'optional'],
    ['get', '/api/experiments/{key}/stats', 'Conversion rates and z-test', 'admin'],
    ['post', '/api/experiments', 'Create experiment', 'admin'],
    ['patch', '/api/experiments/{key}', 'Update / pause experiment', 'admin'],
    ['delete', '/api/experiments/{key}', 'Delete experiment', 'admin'],
  ],
  Marketing: [
    ['get', '/api/marketing/campaigns', 'Campaigns', 'admin'],
    ['get', '/api/marketing/campaigns/{id}', 'Campaign with recipients', 'admin'],
    ['post', '/api/marketing/campaigns', 'Create (draft or scheduled)', 'admin'],
    ['put', '/api/marketing/campaigns/{id}', 'Edit draft / scheduled campaign', 'admin'],
    ['post', '/api/marketing/campaigns/{id}/send', 'Send now', 'admin'],
    ['post', '/api/marketing/campaigns/{id}/pause', 'Pause scheduled campaign', 'admin'],
    ['delete', '/api/marketing/campaigns/{id}', 'Delete campaign', 'admin'],
    ['get', '/api/marketing/segments', 'Segments', 'admin'],
    ['post', '/api/marketing/segments', 'Create segment', 'admin'],
    ['put', '/api/marketing/segments/{id}', 'Update segment', 'admin'],
    ['get', '/api/marketing/segments/{id}/members', 'Preview members', 'admin'],
    ['delete', '/api/marketing/segments/{id}', 'Delete segment', 'admin'],
    ['post', '/api/marketing/abandoned-cart', 'Send abandoned-cart reminders now', 'admin'],
    ['get', '/api/marketing/analytics', 'Measured open / click rates', 'admin'],
    ['get', '/api/marketing/t/{token}/open.gif', 'Open-tracking pixel', 'public'],
    ['get', '/api/marketing/t/{token}/click', 'Click tracking redirect', 'public'],
  ],
  Integrations: [
    ['post', '/api/integrations/webhook', 'Signed inbound fulfilment webhook', 'public'],
    ['get', '/api/integrations/status', 'Configured integrations', 'admin'],
    ['post', '/api/integrations/shippo', 'Buy a Shippo label and ship the order', 'admin'],
    ['post', '/api/integrations/mailchimp', 'Subscribe an email to a Mailchimp list', 'admin'],
    ['post', '/api/integrations/klaviyo', 'Send an event to Klaviyo', 'admin'],
  ],
  Webhooks: [
    ['get', '/api/webhooks/events', 'Event types', 'user'],
    ['get', '/api/webhooks', 'My webhook subscriptions', 'user'],
    ['post', '/api/webhooks', 'Subscribe a URL (secret shown once)', 'user'],
    ['patch', '/api/webhooks/{id}', 'Enable / disable', 'user'],
    ['delete', '/api/webhooks/{id}', 'Delete', 'user'],
    ['get', '/api/webhooks/{id}/deliveries', 'Delivery log', 'user'],
    ['post', '/api/webhooks/{id}/test', 'Send a signed ping', 'user'],
    ['post', '/api/webhooks/deliveries/{id}/redeliver', 'Retry a delivery', 'user'],
  ],
  System: [
    ['get', '/health', 'Liveness + database check', 'public'],
    ['get', '/ready', 'Readiness (database + migrations)', 'public'],
    ['get', '/metrics', 'Prometheus metrics', 'public'],
    ['get', '/api/system/health', 'Detailed health (replicas, shards, pools, breakers, engines)', 'admin'],
    ['get', '/api/system/capacity', 'Capacity estimate from live volume', 'admin'],
    ['get', '/api/system/constraints', 'Measured latency / TPS / availability vs targets', 'admin'],
    ['get', '/api/system/indexes', 'Indexes with usage counts', 'admin'],
    ['get', '/api/system/indexes/unused', 'Never-used indexes', 'admin'],
    ['post', '/api/system/indexes', 'Create index concurrently', 'admin'],
    ['delete', '/api/system/indexes/{name}', 'Drop index concurrently', 'admin'],
    ['post', '/api/system/indexes/rebuild', 'REINDEX a table', 'admin'],
    ['get', '/api/system/shards', 'Shard health (+ ?sample=N key distribution)', 'admin'],
    ['post', '/api/system/shards/migrate', 'Create the analytics schema on every shard', 'admin'],
    ['get', '/api/system/replicas', 'Replica lag', 'admin'],
    ['get', '/api/system/sagas', 'Saga executions', 'admin'],
    ['get', '/api/system/circuits', 'Circuit breakers', 'admin'],
    ['post', '/api/system/circuits/{name}/reset', 'Reset a breaker', 'admin'],
    ['post', '/api/system/cache/flush', 'Flush cache keys', 'admin'],
    ['get', '/api/system/outbox', 'Recent emails', 'admin'],
    ['post', '/api/system/jobs/{name}/run', 'Run a background job now', 'admin'],
    ['get', '/api/system/fraud/{userId}', 'Fraud velocity counters for a user', 'admin'],
  ],
};

const address = {
  type: 'object',
  required: ['name', 'address', 'city', 'zip', 'country'],
  properties: { name: { type: 'string' }, address: { type: 'string' }, city: { type: 'string' }, state: { type: 'string' }, zip: { type: 'string' }, country: { type: 'string', example: 'US' } },
};

const schemas: Record<string, object> = {
  Register: { type: 'object', required: ['name', 'email', 'password'], properties: { name: { type: 'string' }, email: { type: 'string', format: 'email' }, password: { type: 'string', minLength: 8 } } },
  Login: { type: 'object', required: ['email', 'password'], properties: { email: { type: 'string' }, password: { type: 'string' } } },
  CartAdd: { type: 'object', required: ['productId'], properties: { productId: { type: 'string', format: 'uuid' }, quantity: { type: 'integer', default: 1 }, variantName: { type: 'string' } } },
  Address: address,
  PlaceOrder: {
    type: 'object',
    required: ['shippingAddress'],
    properties: {
      shippingAddress: { $ref: '#/components/schemas/Address' },
      billingAddress: { $ref: '#/components/schemas/Address' },
      paymentMethod: { type: 'string', enum: ['card', 'paypal'] },
      shippingProvider: { type: 'string', enum: ['usps', 'ups', 'fedex', 'dhl'] },
      shippingService: { type: 'string', enum: ['ground', 'express', 'overnight'] },
      orderType: { type: 'string', enum: ['standard', 'express', 'preorder'] },
      discountCode: { type: 'string' },
      notes: { type: 'string' },
    },
  },
  OrderStatus: {
    type: 'object',
    required: ['status'],
    properties: { status: { type: 'string', enum: ['pending', 'processing', 'shipped', 'delivered', 'cancelled'] }, trackingNumber: { type: 'string' }, shippingProvider: { type: 'string' }, createLabel: { type: 'boolean' }, note: { type: 'string' } },
  },
  Product: {
    type: 'object',
    required: ['name', 'description', 'price', 'sku'],
    properties: {
      name: { type: 'string' },
      description: { type: 'string' },
      price: { type: 'number' },
      comparePrice: { type: 'number' },
      stock: { type: 'integer' },
      sku: { type: 'string' },
      categoryId: { type: 'string', format: 'uuid' },
      images: { type: 'array', items: { type: 'string' } },
      tags: { type: 'array', items: { type: 'string' } },
      variants: { type: 'array', items: { type: 'object', properties: { name: { type: 'string' }, price: { type: 'number' }, quantity: { type: 'integer' } } } },
    },
  },
  Error: { type: 'object', properties: { success: { type: 'boolean', example: false }, error: { type: 'string' }, details: {}, correlationId: { type: 'string' } } },
};

export function openApiDocument(serverUrl: string) {
  const paths: Record<string, Record<string, object>> = {};
  for (const [tag, routes] of Object.entries(ROUTES)) {
    for (const [method, path, summary, access, body] of routes) {
      const params = [...path.matchAll(/\{(\w+)\}/g)].map((m) => ({ name: m[1], in: 'path', required: true, schema: { type: 'string' } }));
      paths[path] ??= {};
      paths[path][method] = {
        tags: [tag],
        summary,
        description: access === 'admin' ? 'Requires an admin token.' : access === 'user' ? 'Requires a user token.' : access === 'optional' ? 'Token optional.' : undefined,
        ...(params.length ? { parameters: params } : {}),
        ...(access === 'user' || access === 'admin' ? { security: [{ bearerAuth: [] }] } : {}),
        ...(body ? { requestBody: { required: true, content: { 'application/json': { schema: { $ref: `#/components/schemas/${body}` } } } } } : {}),
        responses: {
          200: { description: 'OK' },
          400: { description: 'Validation failed', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
          ...(access === 'user' || access === 'admin' ? { 401: { description: 'Missing or invalid token' } } : {}),
          ...(access === 'admin' ? { 403: { description: 'Not an admin' } } : {}),
        },
      };
    }
  }
  return {
    openapi: '3.0.3',
    info: { title: 'E-Commerce Platform API', version: '2.0.0', description: 'REST API. GraphQL is at /graphql and tRPC at /trpc.' },
    servers: [{ url: serverUrl }],
    components: { securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' } }, schemas },
    paths,
  };
}
