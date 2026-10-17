import { QueryInterface } from 'sequelize';

/**
 * Order types (standard / express / preorder from the order factory), partial refunds, shipping
 * labels, and per-recipient campaign delivery so open/click rates are measured instead of guessed.
 */
const UP = `
ALTER TABLE orders
  ADD COLUMN order_type VARCHAR(16) NOT NULL DEFAULT 'standard' CHECK (order_type IN ('standard', 'express', 'preorder')),
  ADD COLUMN refunded_amount NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (refunded_amount >= 0),
  ADD COLUMN label_url VARCHAR(2048);

CREATE TABLE campaign_recipients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  email VARCHAR(255) NOT NULL,
  token VARCHAR(64) NOT NULL UNIQUE,
  status VARCHAR(16) NOT NULL DEFAULT 'sent' CHECK (status IN ('sent', 'failed')),
  error TEXT,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  opened_at TIMESTAMPTZ,
  clicked_at TIMESTAMPTZ,
  CONSTRAINT campaign_recipients_once UNIQUE (campaign_id, email)
);
CREATE INDEX idx_campaign_recipients_campaign ON campaign_recipients (campaign_id);
`;

const DOWN = `
DROP TABLE IF EXISTS campaign_recipients;
ALTER TABLE orders DROP COLUMN IF EXISTS label_url, DROP COLUMN IF EXISTS refunded_amount, DROP COLUMN IF EXISTS order_type;
`;

export async function up(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.sequelize.query(UP);
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.sequelize.query(DOWN);
}
