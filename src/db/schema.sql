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
  amazon_config TEXT,           -- JSON: {appId, sharedSecret, sandboxMode}
  paddle_config TEXT,           -- JSON: {vendorId, apiKey, publicKey, sandboxMode}
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
  amazon_receipt_id TEXT,
  paddle_subscription_id TEXT,
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
CREATE INDEX IF NOT EXISTS idx_subscriptions_amazon_id ON subscriptions(amazon_receipt_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_paddle_id ON subscriptions(paddle_subscription_id);
CREATE INDEX IF NOT EXISTS idx_transactions_subscription ON transactions(subscription_id);
CREATE INDEX IF NOT EXISTS idx_transactions_tx_id ON transactions(transaction_id);
CREATE INDEX IF NOT EXISTS idx_analytics_date ON analytics_events(app_id, event_date);
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_webhook ON webhook_deliveries(webhook_id);
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_retry ON webhook_deliveries(next_retry_at);

-- Admin Users
CREATE TABLE IF NOT EXISTS admin_users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  name TEXT,
  api_key TEXT UNIQUE,
  active INTEGER DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- Admin Sessions
CREATE TABLE IF NOT EXISTS admin_sessions (
  id TEXT PRIMARY KEY,
  admin_user_id TEXT NOT NULL REFERENCES admin_users(id),
  token TEXT UNIQUE NOT NULL,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_admin_users_email ON admin_users(email);
CREATE INDEX IF NOT EXISTS idx_admin_users_api_key ON admin_users(api_key);
CREATE INDEX IF NOT EXISTS idx_admin_sessions_token ON admin_sessions(token);
CREATE INDEX IF NOT EXISTS idx_admin_sessions_expires ON admin_sessions(expires_at);

-- =====================================================
-- OFFERINGS SYSTEM (Remote Configuration)
-- =====================================================

-- Offerings - Main container for packages
CREATE TABLE IF NOT EXISTS offerings (
  id TEXT PRIMARY KEY,
  app_id TEXT NOT NULL REFERENCES apps(id),
  identifier TEXT NOT NULL,           -- 'default', 'sale', 'premium_offering'
  display_name TEXT,
  description TEXT,
  is_current INTEGER DEFAULT 0,       -- Current offering for the app
  metadata TEXT,                      -- JSON for custom data
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(app_id, identifier)
);

-- Packages - Groups of products within an offering
CREATE TABLE IF NOT EXISTS packages (
  id TEXT PRIMARY KEY,
  offering_id TEXT NOT NULL REFERENCES offerings(id) ON DELETE CASCADE,
  app_id TEXT NOT NULL REFERENCES apps(id),
  identifier TEXT NOT NULL,           -- '$rc_monthly', '$rc_annual', 'custom_weekly'
  display_name TEXT,
  description TEXT,
  package_type TEXT NOT NULL,         -- 'monthly', 'annual', 'weekly', 'lifetime', 'custom'
  position INTEGER DEFAULT 0,         -- Display order
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(offering_id, identifier)
);

-- Products - Store products with metadata
CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  app_id TEXT NOT NULL REFERENCES apps(id),
  store_product_id TEXT NOT NULL,     -- 'com.app.premium_monthly'
  platform TEXT NOT NULL,             -- 'ios', 'android', 'stripe'
  display_name TEXT,
  description TEXT,
  product_type TEXT NOT NULL,         -- 'subscription', 'consumable', 'non_consumable'
  default_price_amount INTEGER,       -- Price in cents (for display)
  default_price_currency TEXT,        -- 'USD', 'EUR'
  subscription_period TEXT,           -- 'P1M', 'P1Y', 'P1W' (ISO 8601 duration)
  trial_period TEXT,                  -- 'P7D', 'P14D'
  metadata TEXT,                      -- JSON for custom data
  active INTEGER DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(app_id, store_product_id, platform)
);

-- Package Products - Many-to-many relationship
CREATE TABLE IF NOT EXISTS package_products (
  id TEXT PRIMARY KEY,
  package_id TEXT NOT NULL REFERENCES packages(id) ON DELETE CASCADE,
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  position INTEGER DEFAULT 0,         -- Display order within package
  created_at INTEGER NOT NULL,
  UNIQUE(package_id, product_id)
);

-- Targeting Rules - Which offering to show to which users
CREATE TABLE IF NOT EXISTS targeting_rules (
  id TEXT PRIMARY KEY,
  app_id TEXT NOT NULL REFERENCES apps(id),
  offering_id TEXT NOT NULL REFERENCES offerings(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  priority INTEGER DEFAULT 0,         -- Higher = checked first
  conditions TEXT NOT NULL,           -- JSON: {country: 'US', app_version: '>=2.0'}
  active INTEGER DEFAULT 1,
  start_at INTEGER,                   -- Optional: rule active from
  end_at INTEGER,                     -- Optional: rule active until
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- Experiments (A/B Testing)
CREATE TABLE IF NOT EXISTS experiments (
  id TEXT PRIMARY KEY,
  app_id TEXT NOT NULL REFERENCES apps(id),
  name TEXT NOT NULL,
  description TEXT,
  status TEXT DEFAULT 'draft',        -- 'draft', 'running', 'paused', 'completed'
  start_at INTEGER,
  end_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- Experiment Variants
CREATE TABLE IF NOT EXISTS experiment_variants (
  id TEXT PRIMARY KEY,
  experiment_id TEXT NOT NULL REFERENCES experiments(id) ON DELETE CASCADE,
  offering_id TEXT NOT NULL REFERENCES offerings(id),
  name TEXT NOT NULL,                 -- 'control', 'variant_a', 'variant_b'
  weight INTEGER DEFAULT 50,          -- Percentage weight (0-100)
  created_at INTEGER NOT NULL
);

-- Experiment Enrollments - Track which users are in which variant
CREATE TABLE IF NOT EXISTS experiment_enrollments (
  id TEXT PRIMARY KEY,
  experiment_id TEXT NOT NULL REFERENCES experiments(id),
  variant_id TEXT NOT NULL REFERENCES experiment_variants(id),
  subscriber_id TEXT NOT NULL REFERENCES subscribers(id),
  enrolled_at INTEGER NOT NULL,
  converted INTEGER DEFAULT 0,        -- Did they purchase?
  conversion_date INTEGER,
  UNIQUE(experiment_id, subscriber_id)
);

-- Indexes for offerings system
CREATE INDEX IF NOT EXISTS idx_offerings_app ON offerings(app_id);
CREATE INDEX IF NOT EXISTS idx_offerings_current ON offerings(app_id, is_current);
CREATE INDEX IF NOT EXISTS idx_packages_offering ON packages(offering_id);
CREATE INDEX IF NOT EXISTS idx_products_app ON products(app_id);
CREATE INDEX IF NOT EXISTS idx_products_store ON products(app_id, store_product_id, platform);
CREATE INDEX IF NOT EXISTS idx_package_products_package ON package_products(package_id);
CREATE INDEX IF NOT EXISTS idx_targeting_rules_app ON targeting_rules(app_id, active, priority);
CREATE INDEX IF NOT EXISTS idx_experiments_app ON experiments(app_id, status);
CREATE INDEX IF NOT EXISTS idx_experiment_variants_exp ON experiment_variants(experiment_id);
CREATE INDEX IF NOT EXISTS idx_experiment_enrollments_exp ON experiment_enrollments(experiment_id);
CREATE INDEX IF NOT EXISTS idx_experiment_enrollments_sub ON experiment_enrollments(subscriber_id);

-- =====================================================
-- THIRD-PARTY INTEGRATIONS
-- =====================================================

-- Integrations (Amplitude, Mixpanel, Segment, etc.)
CREATE TABLE IF NOT EXISTS integrations (
  id TEXT PRIMARY KEY,
  app_id TEXT NOT NULL REFERENCES apps(id),
  type TEXT NOT NULL,              -- 'amplitude', 'mixpanel', 'segment', 'firebase', 'braze', 'slack', 'appsflyer', 'adjust', 'webhook'
  name TEXT NOT NULL,
  config TEXT NOT NULL,            -- JSON: credentials and settings
  enabled INTEGER DEFAULT 1,
  events TEXT NOT NULL,            -- JSON array: ['initial_purchase', 'renewal', '*']
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- Integration Delivery Log
CREATE TABLE IF NOT EXISTS integration_deliveries (
  id TEXT PRIMARY KEY,
  integration_id TEXT NOT NULL REFERENCES integrations(id),
  event_type TEXT NOT NULL,
  payload TEXT NOT NULL,
  response_status INTEGER,
  response_body TEXT,
  success INTEGER DEFAULT 0,
  created_at INTEGER NOT NULL
);

-- Custom Events
CREATE TABLE IF NOT EXISTS custom_events (
  id TEXT PRIMARY KEY,
  app_id TEXT NOT NULL REFERENCES apps(id),
  subscriber_id TEXT REFERENCES subscribers(id),
  event_name TEXT NOT NULL,
  event_properties TEXT,           -- JSON
  timestamp INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_integrations_app ON integrations(app_id, enabled);
CREATE INDEX IF NOT EXISTS idx_integration_deliveries_integration ON integration_deliveries(integration_id);
CREATE INDEX IF NOT EXISTS idx_custom_events_app ON custom_events(app_id, event_name);
CREATE INDEX IF NOT EXISTS idx_custom_events_subscriber ON custom_events(subscriber_id);

-- =====================================================
-- PAYWALL TEMPLATES (No-code Paywalls)
-- =====================================================

-- Paywall Templates - Reusable paywall designs
CREATE TABLE IF NOT EXISTS paywall_templates (
  id TEXT PRIMARY KEY,
  app_id TEXT NOT NULL REFERENCES apps(id),
  identifier TEXT NOT NULL,           -- 'default', 'holiday_sale', 'onboarding'
  name TEXT NOT NULL,
  description TEXT,
  template_type TEXT NOT NULL,        -- 'single', 'multi', 'feature_list', 'comparison', 'minimal'

  -- Design Configuration (JSON)
  config TEXT NOT NULL,               -- Full template config (colors, layout, content)

  -- Linked Offering
  offering_id TEXT REFERENCES offerings(id),

  -- Localization
  default_locale TEXT DEFAULT 'en',
  localizations TEXT,                 -- JSON: {locale: {title, subtitle, ...}}

  -- Status
  active INTEGER DEFAULT 1,
  is_default INTEGER DEFAULT 0,

  -- Timestamps
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,

  UNIQUE(app_id, identifier)
);

-- Paywall Assets - Images and media for paywalls
CREATE TABLE IF NOT EXISTS paywall_assets (
  id TEXT PRIMARY KEY,
  app_id TEXT NOT NULL REFERENCES apps(id),
  template_id TEXT REFERENCES paywall_templates(id) ON DELETE CASCADE,
  asset_type TEXT NOT NULL,           -- 'header_image', 'background', 'icon', 'product_image'
  name TEXT NOT NULL,
  url TEXT NOT NULL,                  -- CDN URL or data URI
  mime_type TEXT,
  size_bytes INTEGER,
  metadata TEXT,                      -- JSON: {width, height, alt_text}
  created_at INTEGER NOT NULL
);

-- Paywall Analytics - Track paywall performance
CREATE TABLE IF NOT EXISTS paywall_events (
  id TEXT PRIMARY KEY,
  app_id TEXT NOT NULL REFERENCES apps(id),
  template_id TEXT NOT NULL REFERENCES paywall_templates(id),
  subscriber_id TEXT REFERENCES subscribers(id),
  event_type TEXT NOT NULL,           -- 'impression', 'close', 'purchase_started', 'purchase_completed', 'purchase_failed', 'restore_started'
  offering_id TEXT,
  package_id TEXT,
  product_id TEXT,
  locale TEXT,
  platform TEXT,                      -- 'ios', 'android', 'web'
  metadata TEXT,                      -- JSON: additional event data
  timestamp INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);

-- Paywall A/B Tests - Test different paywall designs
CREATE TABLE IF NOT EXISTS paywall_tests (
  id TEXT PRIMARY KEY,
  app_id TEXT NOT NULL REFERENCES apps(id),
  name TEXT NOT NULL,
  description TEXT,
  status TEXT DEFAULT 'draft',        -- 'draft', 'running', 'paused', 'completed'
  traffic_percentage INTEGER DEFAULT 100,  -- Percentage of users to include
  start_at INTEGER,
  end_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- Paywall Test Variants
CREATE TABLE IF NOT EXISTS paywall_test_variants (
  id TEXT PRIMARY KEY,
  test_id TEXT NOT NULL REFERENCES paywall_tests(id) ON DELETE CASCADE,
  template_id TEXT NOT NULL REFERENCES paywall_templates(id),
  name TEXT NOT NULL,                 -- 'control', 'variant_a', 'variant_b'
  weight INTEGER DEFAULT 50,          -- Distribution weight (0-100)
  created_at INTEGER NOT NULL
);

-- Paywall Test Enrollments
CREATE TABLE IF NOT EXISTS paywall_test_enrollments (
  id TEXT PRIMARY KEY,
  test_id TEXT NOT NULL REFERENCES paywall_tests(id),
  variant_id TEXT NOT NULL REFERENCES paywall_test_variants(id),
  subscriber_id TEXT NOT NULL REFERENCES subscribers(id),
  enrolled_at INTEGER NOT NULL,
  converted INTEGER DEFAULT 0,
  conversion_date INTEGER,
  revenue_amount INTEGER,
  UNIQUE(test_id, subscriber_id)
);

-- =====================================================
-- CUSTOM REPORTS
-- =====================================================

-- Saved Report Definitions
CREATE TABLE IF NOT EXISTS custom_reports (
  id TEXT PRIMARY KEY,
  app_id TEXT NOT NULL REFERENCES apps(id),
  name TEXT NOT NULL,
  description TEXT,
  report_type TEXT NOT NULL,        -- 'revenue', 'subscribers', 'churn', 'cohort', 'custom'

  -- Report Configuration (JSON)
  config TEXT NOT NULL,             -- {metrics, dimensions, filters, groupBy, sortBy}

  -- Visualization
  chart_type TEXT DEFAULT 'table',  -- 'table', 'line', 'bar', 'pie', 'area', 'funnel'
  chart_config TEXT,                -- JSON for chart customization

  -- Scheduling
  schedule TEXT,                    -- 'daily', 'weekly', 'monthly', null for manual
  schedule_time TEXT,               -- '09:00' UTC time to run
  last_run_at INTEGER,
  next_run_at INTEGER,

  -- Email delivery
  email_recipients TEXT,            -- JSON array of emails
  email_enabled INTEGER DEFAULT 0,

  -- Status
  active INTEGER DEFAULT 1,
  is_public INTEGER DEFAULT 0,      -- Shareable link

  -- Timestamps
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- Report Executions (History)
CREATE TABLE IF NOT EXISTS report_executions (
  id TEXT PRIMARY KEY,
  report_id TEXT NOT NULL REFERENCES custom_reports(id) ON DELETE CASCADE,
  app_id TEXT NOT NULL REFERENCES apps(id),

  -- Execution details
  status TEXT NOT NULL,             -- 'pending', 'running', 'completed', 'failed'
  started_at INTEGER,
  completed_at INTEGER,
  error_message TEXT,

  -- Results
  result_data TEXT,                 -- JSON result data
  result_count INTEGER,
  result_format TEXT,               -- 'json', 'csv'
  result_file_url TEXT,             -- For large exports

  -- Metadata
  parameters TEXT,                  -- JSON of parameters used
  execution_time_ms INTEGER,

  created_at INTEGER NOT NULL
);

-- Report Shares (Public links)
CREATE TABLE IF NOT EXISTS report_shares (
  id TEXT PRIMARY KEY,
  report_id TEXT NOT NULL REFERENCES custom_reports(id) ON DELETE CASCADE,
  share_token TEXT UNIQUE NOT NULL,
  expires_at INTEGER,
  password_hash TEXT,               -- Optional password protection
  view_count INTEGER DEFAULT 0,
  last_viewed_at INTEGER,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_custom_reports_app ON custom_reports(app_id, active);
CREATE INDEX IF NOT EXISTS idx_custom_reports_schedule ON custom_reports(schedule, next_run_at);
CREATE INDEX IF NOT EXISTS idx_report_executions_report ON report_executions(report_id);
CREATE INDEX IF NOT EXISTS idx_report_executions_status ON report_executions(status);
CREATE INDEX IF NOT EXISTS idx_report_shares_token ON report_shares(share_token);

-- Indexes for paywall tables
CREATE INDEX IF NOT EXISTS idx_paywall_templates_app ON paywall_templates(app_id, active);
CREATE INDEX IF NOT EXISTS idx_paywall_templates_default ON paywall_templates(app_id, is_default);
CREATE INDEX IF NOT EXISTS idx_paywall_assets_template ON paywall_assets(template_id);
CREATE INDEX IF NOT EXISTS idx_paywall_events_template ON paywall_events(template_id, event_type);
CREATE INDEX IF NOT EXISTS idx_paywall_events_timestamp ON paywall_events(app_id, timestamp);
CREATE INDEX IF NOT EXISTS idx_paywall_tests_app ON paywall_tests(app_id, status);
CREATE INDEX IF NOT EXISTS idx_paywall_test_variants_test ON paywall_test_variants(test_id);
CREATE INDEX IF NOT EXISTS idx_paywall_test_enrollments_test ON paywall_test_enrollments(test_id);
