// Cloudflare Workers Environment
export interface Env {
  DB: D1Database;
  CACHE: KVNamespace;
  ENVIRONMENT: string;
}

// Platform types
export type Platform = 'ios' | 'android' | 'stripe';

// Subscription status
export type SubscriptionStatus =
  | 'active'
  | 'expired'
  | 'cancelled'
  | 'grace_period'
  | 'paused'
  | 'billing_retry';

// Transaction types
export type TransactionType =
  | 'initial_purchase'
  | 'renewal'
  | 'refund'
  | 'upgrade'
  | 'downgrade';

// Event types for webhooks and analytics
export type EventType =
  | 'initial_purchase'
  | 'renewal'
  | 'cancellation'
  | 'expiration'
  | 'refund'
  | 'billing_issue'
  | 'billing_recovery'
  | 'grace_period_started'
  | 'grace_period_expired'
  | 'trial_started'
  | 'trial_converted'
  | 'trial_ending'
  | 'product_change'
  | 'reactivation'
  | 'revocation'
  | 'offer_redeemed'
  | 'price_increase'
  | 'renewal_extended'
  | 'paused'
  | 'pause_scheduled'
  | 'pending_cancelled'
  | 'subscription_updated'
  | 'dispute_created'
  | 'dispute_closed'
  | 'unknown';

// Database Models
export interface App {
  id: string;
  name: string;
  api_key: string;
  apple_config: string | null;
  google_config: string | null;
  stripe_config: string | null;
  created_at: number;
}

export interface AppleConfig {
  keyId: string;
  issuerId: string;
  bundleId: string;
  privateKey: string;
  environment: 'sandbox' | 'production';
}

export interface GoogleConfig {
  packageName: string;
  serviceAccountEmail: string;
  serviceAccountPrivateKey: string;
}

export interface StripeConfig {
  secretKey: string;
  webhookSecret: string;
}

export interface Subscriber {
  id: string;
  app_id: string;
  app_user_id: string;
  first_seen_at: number;
  last_seen_at: number;
  attributes: string | null;
  created_at: number;
}

export interface Subscription {
  id: string;
  subscriber_id: string;
  app_id: string;
  platform: Platform;
  product_id: string;
  original_transaction_id: string | null;
  purchase_token: string | null;
  stripe_subscription_id: string | null;
  status: SubscriptionStatus;
  purchase_date: number;
  expires_at: number | null;
  cancelled_at: number | null;
  grace_period_expires_at: number | null;
  is_trial: boolean;
  is_intro_offer: boolean;
  is_sandbox: boolean;
  will_renew: boolean;
  price_amount: number | null;
  price_currency: string | null;
  created_at: number;
  updated_at: number;
}

export interface Transaction {
  id: string;
  subscription_id: string | null;
  app_id: string;
  transaction_id: string;
  original_transaction_id: string | null;
  product_id: string;
  platform: Platform;
  type: TransactionType;
  purchase_date: number;
  expires_date: number | null;
  revenue_amount: number | null;
  revenue_currency: string | null;
  is_refunded: boolean;
  refund_date: number | null;
  raw_data: string | null;
  created_at: number;
}

export interface EntitlementDefinition {
  id: string;
  app_id: string;
  identifier: string;
  display_name: string | null;
  created_at: number;
}

export interface ProductEntitlement {
  id: string;
  app_id: string;
  product_id: string;
  platform: Platform;
  entitlement_id: string;
  created_at: number;
}

export interface Webhook {
  id: string;
  app_id: string;
  url: string;
  secret: string;
  events: string;
  active: boolean;
  created_at: number;
}

export interface WebhookDelivery {
  id: string;
  webhook_id: string;
  event_type: string;
  payload: string;
  response_status: number | null;
  response_body: string | null;
  attempts: number;
  next_retry_at: number | null;
  delivered_at: number | null;
  created_at: number;
}

export interface AnalyticsEvent {
  id: string;
  app_id: string;
  subscriber_id: string | null;
  event_type: EventType;
  event_date: number;
  product_id: string | null;
  platform: Platform | null;
  revenue_amount: number | null;
  revenue_currency: string | null;
  created_at: number;
}

// API Response Types
export interface SubscriberResponse {
  original_app_user_id: string;
  first_seen: string;
  subscriptions: Record<string, SubscriptionInfo>;
  entitlements: Record<string, EntitlementInfo>;
}

export interface SubscriptionInfo {
  platform: Platform;
  product_id: string;
  status: SubscriptionStatus;
  purchase_date: string;
  expires_date: string | null;
  is_sandbox: boolean;
  is_trial_period: boolean;
  will_renew: boolean;
  grace_period_expires_date: string | null;
}

export interface EntitlementInfo {
  is_active: boolean;
  product_identifier: string;
  expires_date: string | null;
}

// Request types
export interface VerifyReceiptRequest {
  app_user_id: string;
  platform: Platform;
  fetch_policy?: 'cache_only' | 'fetch_only' | 'cache_or_fetch';
  receipt_data: {
    transaction_id?: string;
    package_name?: string;
    product_id?: string;
    purchase_token?: string;
    subscription_id?: string;
  };
}

// Analytics types
export interface AnalyticsOverview {
  mrr: number;
  active_subscribers: number;
  active_trials: number;
  churn_rate: number;
  new_subscribers: number;
  conversions: number;
  refunds: number;
  revenue_by_platform: Record<Platform, number>;
}
