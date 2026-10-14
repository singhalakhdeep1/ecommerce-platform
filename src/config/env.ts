import dotenv from 'dotenv';

dotenv.config();

const int = (value: string | undefined, fallback: number): number => {
  const parsed = parseInt(value ?? '', 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const list = (value: string | undefined): string[] =>
  (value ?? '')
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);

const nodeEnv = process.env.NODE_ENV ?? 'development';

/** In production a missing or default JWT secret is a hard error rather than a silent fallback. */
function jwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (secret && secret.length >= 16 && secret !== 'change-me-to-a-long-random-string') return secret;
  if (nodeEnv === 'production') {
    throw new Error('JWT_SECRET must be set (16+ characters) in production');
  }
  return 'dev-only-insecure-secret-do-not-use-in-production';
}

export const env = {
  nodeEnv,
  isProduction: nodeEnv === 'production',
  isTest: nodeEnv === 'test',
  port: int(process.env.PORT, 5000),
  clientUrl: process.env.CLIENT_URL ?? 'http://localhost:3000',
  logLevel: process.env.LOG_LEVEL ?? (nodeEnv === 'production' ? 'info' : 'debug'),

  db: {
    url: process.env.DATABASE_URL || '',
    host: process.env.DB_HOST ?? 'localhost',
    port: int(process.env.DB_PORT, 5432),
    name: process.env.DB_NAME ?? 'ecommerce_db',
    user: process.env.DB_USER ?? 'postgres',
    password: process.env.DB_PASSWORD ?? 'postgres',
    poolMax: int(process.env.DB_POOL_MAX, 10),
    readReplicas: list(process.env.DB_READ_REPLICAS),
    shards: list(process.env.DB_SHARDS).map((entry) => {
      const idx = entry.indexOf('=');
      return { id: entry.slice(0, idx), connectionString: entry.slice(idx + 1) };
    }),
  },

  redisUrl: process.env.REDIS_URL || '',

  auth: {
    jwtSecret: jwtSecret(),
    jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? '7d',
    bcryptRounds: int(process.env.BCRYPT_ROUNDS, 12),
  },

  payments: {
    provider: (process.env.PAYMENT_PROVIDER ?? 'auto') as 'auto' | 'stripe' | 'sandbox',
    stripeSecretKey: process.env.STRIPE_SECRET_KEY ?? '',
    stripePublishableKey: process.env.STRIPE_PUBLISHABLE_KEY ?? '',
    stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET ?? '',
    stripeBillingWebhookSecret: process.env.STRIPE_BILLING_WEBHOOK_SECRET ?? '',
    paypalClientId: process.env.PAYPAL_CLIENT_ID ?? '',
    paypalClientSecret: process.env.PAYPAL_CLIENT_SECRET ?? '',
    paypalBaseUrl: process.env.PAYPAL_BASE_URL ?? 'https://api-m.sandbox.paypal.com',
    platformFeePercent: Number(process.env.PLATFORM_FEE_PERCENT ?? 10),
  },

  email: {
    host: process.env.EMAIL_HOST ?? '',
    port: int(process.env.EMAIL_PORT, 587),
    user: process.env.EMAIL_USERNAME ?? '',
    pass: process.env.EMAIL_PASSWORD ?? '',
    from: process.env.EMAIL_FROM ?? 'noreply@ecommerce.local',
    adminEmail: process.env.ADMIN_EMAIL ?? 'admin@ecommerce.local',
  },

  search: {
    elasticsearchUrl: process.env.ELASTICSEARCH_URL ?? '',
    elasticsearchUser: process.env.ELASTICSEARCH_USERNAME ?? '',
    elasticsearchPassword: process.env.ELASTICSEARCH_PASSWORD ?? '',
    algoliaAppId: process.env.ALGOLIA_APP_ID ?? '',
    algoliaApiKey: process.env.ALGOLIA_API_KEY ?? '',
    meilisearchUrl: process.env.MEILISEARCH_URL ?? '',
    meilisearchApiKey: process.env.MEILISEARCH_API_KEY ?? '',
  },

  integrations: {
    shippoToken: process.env.SHIPPO_API_TOKEN ?? '',
    mailchimpApiKey: process.env.MAILCHIMP_API_KEY ?? '',
    mailchimpDataCenter: process.env.MAILCHIMP_DATA_CENTER ?? 'us1',
    klaviyoApiKey: process.env.KLAVIYO_API_KEY ?? '',
  },
};

export type Env = typeof env;
