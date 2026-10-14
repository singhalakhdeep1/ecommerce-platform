import { QueryInterface } from 'sequelize';

/**
 * Secondary indexes for the query patterns the API actually runs, plus PostgreSQL full-text search
 * (a generated tsvector column with a GIN index) backing /api/search and the product `search` filter.
 */
const UP = `
-- catalog browsing: published products filtered by category / price / featured, newest first
CREATE INDEX idx_products_published_category_price ON products (published, category_id, price);
CREATE INDEX idx_products_featured ON products (featured) WHERE featured = TRUE;
CREATE INDEX idx_products_created_at ON products (created_at DESC);
CREATE INDEX idx_products_low_stock ON products (stock) WHERE stock <= 10;
CREATE INDEX idx_products_tags ON products USING GIN (tags);
CREATE INDEX idx_categories_parent ON categories (parent_id);

-- full-text search: weighted name > tags > description. A trigger maintains the tsvector because
-- array_to_string() is not IMMUTABLE, which rules out a GENERATED column.
ALTER TABLE products ADD COLUMN search_vector tsvector;
CREATE FUNCTION products_search_vector_update() RETURNS trigger AS $$
BEGIN
  NEW.search_vector :=
    setweight(to_tsvector('english', coalesce(NEW.name, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(array_to_string(NEW.tags, ' '), '')), 'B') ||
    setweight(to_tsvector('english', coalesce(NEW.description, '')), 'C');
  RETURN NEW;
END
$$ LANGUAGE plpgsql;
CREATE TRIGGER trg_products_search_vector
  BEFORE INSERT OR UPDATE OF name, tags, description ON products
  FOR EACH ROW EXECUTE FUNCTION products_search_vector_update();
UPDATE products SET name = name;
CREATE INDEX idx_products_search_vector ON products USING GIN (search_vector);

-- orders: a customer's history, admin status queues, revenue reports
CREATE INDEX idx_orders_user_created ON orders (user_id, created_at DESC);
CREATE INDEX idx_orders_status_created ON orders (status, created_at DESC);
CREATE INDEX idx_orders_payment_status ON orders (payment_status);
CREATE INDEX idx_orders_stripe_intent ON orders (stripe_payment_intent_id) WHERE stripe_payment_intent_id IS NOT NULL;
CREATE INDEX idx_orders_paypal_order ON orders (paypal_order_id) WHERE paypal_order_id IS NOT NULL;
CREATE INDEX idx_order_items_order ON order_items (order_id);
CREATE INDEX idx_order_items_product ON order_items (product_id);
CREATE INDEX idx_order_events_order ON order_events (order_id, created_at);
CREATE INDEX idx_payment_transactions_order ON payment_transactions (order_id);

-- carts and engagement
CREATE INDEX idx_cart_items_cart ON cart_items (cart_id);
CREATE INDEX idx_carts_activity ON carts (last_activity_at) WHERE reminder_sent_at IS NULL;
CREATE INDEX idx_reviews_product ON reviews (product_id, created_at DESC);
CREATE INDEX idx_wishlists_user ON wishlists (user_id, created_at DESC);
CREATE INDEX idx_discounts_active_window ON discounts (is_active, start_date, end_date);
CREATE INDEX idx_discount_redemptions_user ON discount_redemptions (discount_id, user_id);

-- analytics and webhooks
CREATE INDEX idx_analytics_type_created ON analytics_events (event_type, created_at DESC);
CREATE INDEX idx_analytics_user ON analytics_events (user_id, created_at);
CREATE INDEX idx_webhook_subscriptions_event ON webhook_subscriptions (event, is_active);
CREATE INDEX idx_webhook_deliveries_pending ON webhook_deliveries (next_attempt_at) WHERE status = 'pending';
CREATE INDEX idx_subscriptions_user ON subscriptions (user_id);
CREATE INDEX idx_ab_assignments_experiment ON ab_assignments (experiment_key, variant);
`;

const DOWN = `
DROP INDEX IF EXISTS idx_ab_assignments_experiment, idx_subscriptions_user, idx_webhook_deliveries_pending,
  idx_webhook_subscriptions_event, idx_analytics_user, idx_analytics_type_created,
  idx_discount_redemptions_user, idx_discounts_active_window, idx_wishlists_user, idx_reviews_product,
  idx_carts_activity, idx_cart_items_cart, idx_payment_transactions_order, idx_order_events_order,
  idx_order_items_product, idx_order_items_order, idx_orders_paypal_order, idx_orders_stripe_intent,
  idx_orders_payment_status, idx_orders_status_created, idx_orders_user_created, idx_products_search_vector,
  idx_categories_parent, idx_products_tags, idx_products_low_stock, idx_products_created_at,
  idx_products_featured, idx_products_published_category_price;
DROP TRIGGER IF EXISTS trg_products_search_vector ON products;
DROP FUNCTION IF EXISTS products_search_vector_update();
ALTER TABLE products DROP COLUMN IF EXISTS search_vector;
`;

export async function up(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.sequelize.query(UP);
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.sequelize.query(DOWN);
}
