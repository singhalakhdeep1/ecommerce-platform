import { QueryInterface } from 'sequelize';

/**
 * Initial schema. Written as explicit DDL so the database is created by reviewed SQL, not by
 * `sequelize.sync()`. Money is NUMERIC, every foreign key has an explicit ON DELETE rule, and
 * invariants (stock >= 0, rating 1..5, order totals >= 0) are enforced by the database itself.
 */
const UP = `
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TYPE enum_users_role AS ENUM ('customer', 'admin', 'seller');
CREATE TYPE enum_orders_status AS ENUM ('pending', 'processing', 'shipped', 'delivered', 'cancelled');
CREATE TYPE enum_orders_payment_status AS ENUM ('pending', 'paid', 'failed', 'refunded');
CREATE TYPE enum_payment_transactions_type AS ENUM ('charge', 'refund');
CREATE TYPE enum_payment_transactions_status AS ENUM ('succeeded', 'failed');
CREATE TYPE enum_wishlists_priority AS ENUM ('low', 'medium', 'high');
CREATE TYPE enum_discounts_type AS ENUM ('percentage', 'fixed', 'free_shipping');
CREATE TYPE enum_webhook_deliveries_status AS ENUM ('pending', 'delivered', 'failed');
CREATE TYPE enum_campaigns_type AS ENUM ('email', 'sms', 'push', 'social');
CREATE TYPE enum_campaigns_status AS ENUM ('draft', 'scheduled', 'sending', 'sent', 'paused', 'failed');
CREATE TYPE enum_saga_executions_status AS ENUM ('running', 'completed', 'compensated', 'failed');

CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL,
  email VARCHAR(255) NOT NULL UNIQUE,
  password VARCHAR(255) NOT NULL,
  role enum_users_role NOT NULL DEFAULT 'customer',
  phone VARCHAR(32),
  avatar VARCHAR(255),
  address JSONB,
  email_verified BOOLEAN NOT NULL DEFAULT FALSE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  stripe_customer_id VARCHAR(255),
  token_version INTEGER NOT NULL DEFAULT 0,
  last_login_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(120) NOT NULL UNIQUE,
  slug VARCHAR(150) NOT NULL UNIQUE,
  description TEXT,
  image VARCHAR(255),
  parent_id UUID REFERENCES categories(id) ON DELETE SET NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  published BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT categories_not_own_parent CHECK (parent_id IS NULL OR parent_id <> id)
);

CREATE TABLE products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(200) NOT NULL,
  slug VARCHAR(250) NOT NULL UNIQUE,
  description TEXT NOT NULL,
  price NUMERIC(12,2) NOT NULL CHECK (price >= 0),
  compare_price NUMERIC(12,2) CHECK (compare_price >= 0),
  stock INTEGER NOT NULL DEFAULT 0 CHECK (stock >= 0),
  sku VARCHAR(64) NOT NULL UNIQUE,
  barcode VARCHAR(64),
  images VARCHAR(255)[] NOT NULL DEFAULT '{}',
  featured BOOLEAN NOT NULL DEFAULT FALSE,
  published BOOLEAN NOT NULL DEFAULT TRUE,
  rating NUMERIC(3,2) NOT NULL DEFAULT 0,
  num_reviews INTEGER NOT NULL DEFAULT 0,
  specifications JSONB NOT NULL DEFAULT '{}',
  variants JSONB NOT NULL DEFAULT '[]',
  low_stock_threshold INTEGER NOT NULL DEFAULT 10,
  weight NUMERIC(12,2) CHECK (weight >= 0),
  dimensions JSONB NOT NULL DEFAULT '{"length":null,"width":null,"height":null}',
  tags VARCHAR(255)[] NOT NULL DEFAULT '{}',
  seo_title VARCHAR(255),
  seo_description TEXT,
  category_id UUID REFERENCES categories(id) ON DELETE SET NULL,
  seller_id UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE carts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  session_token VARCHAR(64) UNIQUE,
  total_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  last_activity_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reminder_sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT carts_has_owner CHECK (user_id IS NOT NULL OR session_token IS NOT NULL)
);

CREATE TABLE cart_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cart_id UUID NOT NULL REFERENCES carts(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  variant_name VARCHAR(120) NOT NULL DEFAULT '',
  quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity >= 1),
  price NUMERIC(12,2) NOT NULL CHECK (price >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT cart_items_unique_line UNIQUE (cart_id, product_id, variant_name)
);

CREATE TABLE orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number VARCHAR(40) NOT NULL UNIQUE,
  user_id UUID NOT NULL REFERENCES users(id),
  status enum_orders_status NOT NULL DEFAULT 'pending',
  subtotal NUMERIC(12,2) NOT NULL CHECK (subtotal >= 0),
  tax NUMERIC(12,2) NOT NULL DEFAULT 0,
  shipping_cost NUMERIC(12,2) NOT NULL DEFAULT 0,
  discount NUMERIC(12,2) NOT NULL DEFAULT 0,
  discount_code VARCHAR(50),
  total_amount NUMERIC(12,2) NOT NULL CHECK (total_amount >= 0),
  currency VARCHAR(3) NOT NULL DEFAULT 'USD',
  payment_method VARCHAR(32) NOT NULL,
  payment_status enum_orders_payment_status NOT NULL DEFAULT 'pending',
  payment_provider VARCHAR(32),
  stripe_payment_intent_id VARCHAR(255),
  paypal_order_id VARCHAR(255),
  shipping_address JSONB NOT NULL,
  billing_address JSONB,
  shipping_provider VARCHAR(32),
  shipping_service VARCHAR(32),
  notes TEXT,
  tracking_number VARCHAR(64),
  idempotency_key VARCHAR(64) UNIQUE,
  fraud_flag BOOLEAN NOT NULL DEFAULT FALSE,
  fraud_score INTEGER NOT NULL DEFAULT 0,
  paid_at TIMESTAMPTZ,
  shipped_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id UUID REFERENCES products(id) ON DELETE SET NULL,
  variant_name VARCHAR(120) NOT NULL DEFAULT '',
  quantity INTEGER NOT NULL CHECK (quantity >= 1),
  price NUMERIC(12,2) NOT NULL CHECK (price >= 0),
  total NUMERIC(12,2) NOT NULL CHECK (total >= 0),
  product_snapshot JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE order_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  from_status VARCHAR(32),
  to_status VARCHAR(32) NOT NULL,
  actor_id UUID,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE payment_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  provider VARCHAR(32) NOT NULL,
  provider_ref VARCHAR(255),
  type enum_payment_transactions_type NOT NULL,
  status enum_payment_transactions_status NOT NULL,
  amount NUMERIC(12,2) NOT NULL,
  platform_fee NUMERIC(12,2) NOT NULL DEFAULT 0,
  seller_payout NUMERIC(12,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  title VARCHAR(150) NOT NULL,
  comment TEXT NOT NULL,
  verified BOOLEAN NOT NULL DEFAULT FALSE,
  helpful INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT reviews_one_per_user_product UNIQUE (user_id, product_id)
);

CREATE TABLE wishlists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  notes TEXT,
  priority enum_wishlists_priority NOT NULL DEFAULT 'medium',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT wishlists_unique_item UNIQUE (user_id, product_id)
);

CREATE TABLE discounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(50) NOT NULL UNIQUE,
  type enum_discounts_type NOT NULL,
  value NUMERIC(12,2) NOT NULL CHECK (value >= 0),
  description TEXT,
  minimum_purchase NUMERIC(12,2) NOT NULL DEFAULT 0,
  max_discount NUMERIC(12,2),
  usage_limit INTEGER CHECK (usage_limit >= 1),
  usage_count INTEGER NOT NULL DEFAULT 0,
  user_limit INTEGER NOT NULL DEFAULT 1 CHECK (user_limit >= 1),
  applicable_products UUID[] NOT NULL DEFAULT '{}',
  applicable_categories UUID[] NOT NULL DEFAULT '{}',
  start_date TIMESTAMPTZ NOT NULL,
  end_date TIMESTAMPTZ NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT discounts_valid_window CHECK (end_date > start_date),
  CONSTRAINT discounts_percentage_range CHECK (type <> 'percentage' OR value <= 100)
);

CREATE TABLE discount_redemptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  discount_id UUID NOT NULL REFERENCES discounts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT discount_redemptions_one_per_order UNIQUE (discount_id, order_id)
);

CREATE TABLE subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  stripe_subscription_id VARCHAR(255) UNIQUE,
  plan_id VARCHAR(255) NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'pending',
  cancel_at_period_end BOOLEAN NOT NULL DEFAULT FALSE,
  current_period_start TIMESTAMPTZ NOT NULL,
  current_period_end TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE analytics_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  session_id VARCHAR(64),
  event_type VARCHAR(64) NOT NULL,
  event_data JSONB,
  ab_group VARCHAR(16),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE webhook_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_url VARCHAR(2048) NOT NULL,
  event VARCHAR(64) NOT NULL,
  secret VARCHAR(128) NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE webhook_deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id UUID NOT NULL REFERENCES webhook_subscriptions(id) ON DELETE CASCADE,
  event VARCHAR(64) NOT NULL,
  status enum_webhook_deliveries_status NOT NULL DEFAULT 'pending',
  attempts INTEGER NOT NULL DEFAULT 0,
  response_status INTEGER,
  last_error TEXT,
  next_attempt_at TIMESTAMPTZ,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE customer_segments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(120) NOT NULL UNIQUE,
  description TEXT,
  criteria JSONB NOT NULL DEFAULT '{}',
  customer_count INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(160) NOT NULL,
  type enum_campaigns_type NOT NULL DEFAULT 'email',
  subject VARCHAR(255),
  content TEXT NOT NULL,
  segment_id UUID REFERENCES customer_segments(id) ON DELETE SET NULL,
  status enum_campaigns_status NOT NULL DEFAULT 'draft',
  scheduled_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  sent_count INTEGER NOT NULL DEFAULT 0,
  failed_count INTEGER NOT NULL DEFAULT 0,
  opened_count INTEGER NOT NULL DEFAULT 0,
  clicked_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE ab_experiments (
  key VARCHAR(80) PRIMARY KEY,
  name VARCHAR(160) NOT NULL,
  description TEXT,
  variants VARCHAR(255)[] NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE ab_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  experiment_key VARCHAR(80) NOT NULL REFERENCES ab_experiments(key) ON DELETE CASCADE,
  subject_key VARCHAR(80) NOT NULL,
  variant VARCHAR(40) NOT NULL,
  conversions INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT ab_assignments_one_per_subject UNIQUE (experiment_key, subject_key)
);

CREATE TABLE saga_executions (
  id VARCHAR(64) PRIMARY KEY,
  saga_name VARCHAR(80) NOT NULL,
  status enum_saga_executions_status NOT NULL,
  completed_steps VARCHAR(255)[] NOT NULL DEFAULT '{}',
  compensated_steps VARCHAR(255)[] NOT NULL DEFAULT '{}',
  failed_step VARCHAR(80),
  error TEXT,
  started_at TIMESTAMPTZ NOT NULL,
  finished_at TIMESTAMPTZ
);

CREATE TABLE processed_webhook_events (
  event_id VARCHAR(128) PRIMARY KEY,
  provider VARCHAR(32) NOT NULL,
  type VARCHAR(80) NOT NULL,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
`;

const DOWN = `
DROP TABLE IF EXISTS processed_webhook_events, saga_executions, ab_assignments, ab_experiments, campaigns,
  customer_segments, webhook_deliveries, webhook_subscriptions, analytics_events, subscriptions,
  discount_redemptions, discounts, wishlists, reviews, payment_transactions, order_events, order_items,
  orders, cart_items, carts, products, categories, users CASCADE;
DROP TYPE IF EXISTS enum_saga_executions_status, enum_campaigns_status, enum_campaigns_type,
  enum_webhook_deliveries_status, enum_discounts_type, enum_wishlists_priority,
  enum_payment_transactions_status, enum_payment_transactions_type, enum_orders_payment_status,
  enum_orders_status, enum_users_role;
`;

export async function up(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.sequelize.query(UP);
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.sequelize.query(DOWN);
}
