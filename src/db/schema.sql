-- PayCat Database Schema
-- Cloudflare D1 (SQLite)

-- Apps (Multi-tenant)
CREATE TABLE IF NOT EXISTS apps (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  api_key TEXT UNIQUE NOT NULL,
  apple_config TEXT,
  google_config TEXT,
  stripe_config TEXT,
  created_at INTEGER NOT NULL
);

-- Entitlements Definition
CREATE TABLE IF NOT EXISTS entitlement_definitions (
  id TEXT PRIMARY KEY,
  app_id TEXT NOT NULL REFERENCES apps(id),
  identifier TEXT NOT NULL,
  display_name TEXT,
  created_at INTEGER NOT NULL,
  UNIQUE(app_id, identifier)
);

-- Product to Entitlement Mapping
CREATE TABLE IF NOT EXISTS product_entitlements (
  id TEXT PRIMARY KEY,
  app_id TEXT NOT NULL REFERENCES apps(id),
  product_id TEXT NOT NULL,
  platform TEXT NOT NULL,
  entitlement_id TEXT NOT NULL REFERENCES entitlement_definitions(id),
  created_at INTEGER NOT NULL
);

-- Subscribers
CREATE TABLE IF NOT EXISTS subscribers (
  id TEXT PRIMARY KEY,
  app_id TEXT NOT NULL REFERENCES apps(id),
  app_user_id TEXT NOT NULL,
  first_seen_at INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL,
  attributes TEXT,
  created_at INTEGER NOT NULL,
  UNIQUE(app_id, app_user_id)
);

-- Subscriptions
CREATE TABLE IF NOT EXISTS subscriptions (
  id TEXT PRIMARY KEY,
  subscriber_id TEXT NOT NULL REFERENCES subscribers(id),
  app_id TEXT NOT NULL REFERENCES apps(id),
  platform TEXT NOT NULL,
  product_id TEXT NOT NULL,
  original_transaction_id TEXT,
  purchase_token TEXT,
  stripe_subscription_id TEXT,
  status TEXT NOT NULL,
  purchase_date INTEGER NOT NULL,
  expires_at INTEGER,
  cancelled_at INTEGER,
  grace_period_expires_at INTEGER,
  is_trial INTEGER DEFAULT 0,
  is_intro_offer INTEGER DEFAULT 0,
  is_sandbox INTEGER DEFAULT 0,
  will_renew INTEGER DEFAULT 1,
  price_amount INTEGER,
  price_currency TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- Transactions (Audit log)
CREATE TABLE IF NOT EXISTS transactions (
  id TEXT PRIMARY KEY,
  subscription_id TEXT REFERENCES subscriptions(id),
  app_id TEXT NOT NULL REFERENCES apps(id),
  transaction_id TEXT NOT NULL,
  original_transaction_id TEXT,
  product_id TEXT NOT NULL,
  platform TEXT NOT NULL,
  type TEXT NOT NULL,
  purchase_date INTEGER NOT NULL,
  expires_date INTEGER,
  revenue_amount INTEGER,
  revenue_currency TEXT,
  is_refunded INTEGER DEFAULT 0,
  refund_date INTEGER,
  raw_data TEXT,
  created_at INTEGER NOT NULL
);

-- Webhook Endpoints
CREATE TABLE IF NOT EXISTS webhooks (
  id TEXT PRIMARY KEY,
  app_id TEXT NOT NULL REFERENCES apps(id),
  url TEXT NOT NULL,
  secret TEXT NOT NULL,
  events TEXT NOT NULL,
  active INTEGER DEFAULT 1,
  created_at INTEGER NOT NULL
);

-- Webhook Deliveries
CREATE TABLE IF NOT EXISTS webhook_deliveries (
  id TEXT PRIMARY KEY,
  webhook_id TEXT NOT NULL REFERENCES webhooks(id),
  event_type TEXT NOT NULL,
  payload TEXT NOT NULL,
  response_status INTEGER,
  response_body TEXT,
  attempts INTEGER DEFAULT 0,
  next_retry_at INTEGER,
  delivered_at INTEGER,
  created_at INTEGER NOT NULL
);

-- Analytics Events
CREATE TABLE IF NOT EXISTS analytics_events (
  id TEXT PRIMARY KEY,
  app_id TEXT NOT NULL REFERENCES apps(id),
  subscriber_id TEXT REFERENCES subscribers(id),
  event_type TEXT NOT NULL,
  event_date INTEGER NOT NULL,
  product_id TEXT,
  platform TEXT,
  revenue_amount INTEGER,
  revenue_currency TEXT,
  created_at INTEGER NOT NULL
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_apps_api_key ON apps(api_key);
CREATE INDEX IF NOT EXISTS idx_subscribers_app_user ON subscribers(app_id, app_user_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_subscriber ON subscriptions(subscriber_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON subscriptions(app_id, status);
CREATE INDEX IF NOT EXISTS idx_subscriptions_expires ON subscriptions(expires_at);
CREATE INDEX IF NOT EXISTS idx_subscriptions_original_tx ON subscriptions(original_transaction_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_purchase_token ON subscriptions(purchase_token);
CREATE INDEX IF NOT EXISTS idx_subscriptions_stripe_id ON subscriptions(stripe_subscription_id);
CREATE INDEX IF NOT EXISTS idx_transactions_subscription ON transactions(subscription_id);
CREATE INDEX IF NOT EXISTS idx_transactions_tx_id ON transactions(transaction_id);
CREATE INDEX IF NOT EXISTS idx_analytics_date ON analytics_events(app_id, event_date);
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_webhook ON webhook_deliveries(webhook_id);
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_retry ON webhook_deliveries(next_retry_at);
