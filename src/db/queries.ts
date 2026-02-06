/**
 * Database query functions for MRRCat
 */

import type {
  App,
  Subscriber,
  Subscription,
  Transaction,
  EntitlementDefinition,
  ProductEntitlement,
  Webhook,
  WebhookDelivery,
  Platform,
  SubscriptionStatus,
  TransactionType,
  EventType,
} from '../types';
import { generatePrefixedId } from '../utils/id';
import { now } from '../utils/time';

// ============ Apps ============

export async function getAppByApiKey(
  db: D1Database,
  apiKey: string
): Promise<App | null> {
  const result = await db
    .prepare('SELECT * FROM apps WHERE api_key = ?')
    .bind(apiKey)
    .first<App>();
  return result;
}

export async function getAppById(
  db: D1Database,
  id: string
): Promise<App | null> {
  const result = await db
    .prepare('SELECT * FROM apps WHERE id = ?')
    .bind(id)
    .first<App>();
  return result;
}

export async function createApp(
  db: D1Database,
  data: { name: string; apiKey: string }
): Promise<App> {
  const id = generatePrefixedId('app');
  const timestamp = now();

  await db
    .prepare(
      'INSERT INTO apps (id, name, api_key, created_at) VALUES (?, ?, ?, ?)'
    )
    .bind(id, data.name, data.apiKey, timestamp)
    .run();

  return {
    id,
    name: data.name,
    api_key: data.apiKey,
    apple_config: null,
    google_config: null,
    stripe_config: null,
    created_at: timestamp,
  };
}

export async function updateAppConfig(
  db: D1Database,
  appId: string,
  config: {
    apple_config?: string;
    google_config?: string;
    stripe_config?: string;
  }
): Promise<void> {
  const updates: string[] = [];
  const values: (string | null)[] = [];

  if (config.apple_config !== undefined) {
    updates.push('apple_config = ?');
    values.push(config.apple_config);
  }
  if (config.google_config !== undefined) {
    updates.push('google_config = ?');
    values.push(config.google_config);
  }
  if (config.stripe_config !== undefined) {
    updates.push('stripe_config = ?');
    values.push(config.stripe_config);
  }

  if (updates.length === 0) return;

  values.push(appId);
  await db
    .prepare(`UPDATE apps SET ${updates.join(', ')} WHERE id = ?`)
    .bind(...values)
    .run();
}

// ============ Subscribers ============

export async function getSubscriberByAppUserId(
  db: D1Database,
  appId: string,
  appUserId: string
): Promise<Subscriber | null> {
  const result = await db
    .prepare(
      'SELECT * FROM subscribers WHERE app_id = ? AND app_user_id = ?'
    )
    .bind(appId, appUserId)
    .first<Subscriber>();
  return result;
}

export async function getSubscriberById(
  db: D1Database,
  id: string
): Promise<Subscriber | null> {
  const result = await db
    .prepare('SELECT * FROM subscribers WHERE id = ?')
    .bind(id)
    .first<Subscriber>();
  return result;
}

export async function createSubscriber(
  db: D1Database,
  appId: string,
  appUserId: string
): Promise<Subscriber> {
  const id = generatePrefixedId('sub');
  const timestamp = now();

  await db
    .prepare(
      `INSERT INTO subscribers
       (id, app_id, app_user_id, first_seen_at, last_seen_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .bind(id, appId, appUserId, timestamp, timestamp, timestamp)
    .run();

  return {
    id,
    app_id: appId,
    app_user_id: appUserId,
    first_seen_at: timestamp,
    last_seen_at: timestamp,
    attributes: null,
    created_at: timestamp,
  };
}

export async function getOrCreateSubscriber(
  db: D1Database,
  appId: string,
  appUserId: string
): Promise<Subscriber> {
  let subscriber = await getSubscriberByAppUserId(db, appId, appUserId);

  if (!subscriber) {
    // Use INSERT OR IGNORE to handle race conditions with concurrent requests
    const id = generatePrefixedId('sub');
    const timestamp = now();
    await db
      .prepare(
        `INSERT OR IGNORE INTO subscribers
         (id, app_id, app_user_id, first_seen_at, last_seen_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .bind(id, appId, appUserId, timestamp, timestamp, timestamp)
      .run();

    // Re-fetch to get the actual record (may have been created by concurrent request)
    subscriber = await getSubscriberByAppUserId(db, appId, appUserId);
    if (!subscriber) {
      throw new Error('Failed to create or find subscriber');
    }
  } else {
    // Update last_seen_at
    await db
      .prepare('UPDATE subscribers SET last_seen_at = ? WHERE id = ?')
      .bind(now(), subscriber.id)
      .run();
  }

  return subscriber;
}

// ============ Subscriptions ============

export async function getSubscriptionsBySubscriberId(
  db: D1Database,
  subscriberId: string
): Promise<Subscription[]> {
  const result = await db
    .prepare('SELECT * FROM subscriptions WHERE subscriber_id = ?')
    .bind(subscriberId)
    .all<Subscription>();
  return result.results || [];
}

export async function getSubscriptionByOriginalTransactionId(
  db: D1Database,
  appId: string,
  originalTransactionId: string
): Promise<Subscription | null> {
  const result = await db
    .prepare(
      'SELECT * FROM subscriptions WHERE app_id = ? AND original_transaction_id = ?'
    )
    .bind(appId, originalTransactionId)
    .first<Subscription>();
  return result;
}

export async function getSubscriptionByPurchaseToken(
  db: D1Database,
  appId: string,
  purchaseToken: string
): Promise<Subscription | null> {
  const result = await db
    .prepare(
      'SELECT * FROM subscriptions WHERE app_id = ? AND purchase_token = ?'
    )
    .bind(appId, purchaseToken)
    .first<Subscription>();
  return result;
}

export async function getSubscriptionByStripeId(
  db: D1Database,
  appId: string,
  stripeSubscriptionId: string
): Promise<Subscription | null> {
  const result = await db
    .prepare(
      'SELECT * FROM subscriptions WHERE app_id = ? AND stripe_subscription_id = ?'
    )
    .bind(appId, stripeSubscriptionId)
    .first<Subscription>();
  return result;
}

export async function createSubscription(
  db: D1Database,
  data: {
    subscriberId: string;
    appId: string;
    platform: Platform;
    productId: string;
    originalTransactionId?: string;
    purchaseToken?: string;
    stripeSubscriptionId?: string;
    status: SubscriptionStatus;
    purchaseDate: number;
    expiresAt?: number;
    isTrial?: boolean;
    isIntroOffer?: boolean;
    isSandbox?: boolean;
    willRenew?: boolean;
    priceAmount?: number;
    priceCurrency?: string;
  }
): Promise<Subscription> {
  const id = generatePrefixedId('subs');
  const timestamp = now();

  await db
    .prepare(
      `INSERT INTO subscriptions
       (id, subscriber_id, app_id, platform, product_id, original_transaction_id,
        purchase_token, stripe_subscription_id, status, purchase_date, expires_at,
        is_trial, is_intro_offer, is_sandbox, will_renew, price_amount, price_currency,
        created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      id,
      data.subscriberId,
      data.appId,
      data.platform,
      data.productId,
      data.originalTransactionId || null,
      data.purchaseToken || null,
      data.stripeSubscriptionId || null,
      data.status,
      data.purchaseDate,
      data.expiresAt || null,
      data.isTrial ? 1 : 0,
      data.isIntroOffer ? 1 : 0,
      data.isSandbox ? 1 : 0,
      data.willRenew ? 1 : 0,
      data.priceAmount || null,
      data.priceCurrency || null,
      timestamp,
      timestamp
    )
    .run();

  return {
    id,
    subscriber_id: data.subscriberId,
    app_id: data.appId,
    platform: data.platform,
    product_id: data.productId,
    original_transaction_id: data.originalTransactionId || null,
    purchase_token: data.purchaseToken || null,
    stripe_subscription_id: data.stripeSubscriptionId || null,
    status: data.status,
    purchase_date: data.purchaseDate,
    expires_at: data.expiresAt || null,
    cancelled_at: null,
    grace_period_expires_at: null,
    is_trial: data.isTrial || false,
    is_intro_offer: data.isIntroOffer || false,
    is_sandbox: data.isSandbox || false,
    will_renew: !!data.willRenew,
    price_amount: data.priceAmount || null,
    price_currency: data.priceCurrency || null,
    created_at: timestamp,
    updated_at: timestamp,
  };
}

export async function updateSubscription(
  db: D1Database,
  id: string,
  data: Partial<{
    status: SubscriptionStatus;
    expiresAt: number | null;
    cancelledAt: number | null;
    gracePeriodExpiresAt: number | null;
    willRenew: boolean;
    priceAmount: number;
    priceCurrency: string;
    isSandbox: boolean;
  }>
): Promise<void> {
  const updates: string[] = ['updated_at = ?'];
  const values: (string | number | null)[] = [now()];

  if (data.status !== undefined) {
    updates.push('status = ?');
    values.push(data.status);
  }
  if (data.expiresAt !== undefined) {
    updates.push('expires_at = ?');
    values.push(data.expiresAt);
  }
  if (data.cancelledAt !== undefined) {
    updates.push('cancelled_at = ?');
    values.push(data.cancelledAt);
  }
  if (data.gracePeriodExpiresAt !== undefined) {
    updates.push('grace_period_expires_at = ?');
    values.push(data.gracePeriodExpiresAt);
  }
  if (data.willRenew !== undefined) {
    updates.push('will_renew = ?');
    values.push(data.willRenew ? 1 : 0);
  }
  if (data.priceAmount !== undefined) {
    updates.push('price_amount = ?');
    values.push(data.priceAmount);
  }
  if (data.priceCurrency !== undefined) {
    updates.push('price_currency = ?');
    values.push(data.priceCurrency);
  }
  if (data.isSandbox !== undefined) {
    updates.push('is_sandbox = ?');
    values.push(data.isSandbox ? 1 : 0);
  }

  values.push(id);
  await db
    .prepare(`UPDATE subscriptions SET ${updates.join(', ')} WHERE id = ?`)
    .bind(...values)
    .run();
}

// ============ Transactions ============

export async function createTransaction(
  db: D1Database,
  data: {
    subscriptionId?: string;
    appId: string;
    transactionId: string;
    originalTransactionId?: string;
    productId: string;
    platform: Platform;
    type: TransactionType;
    purchaseDate: number;
    expiresDate?: number;
    revenueAmount?: number;
    revenueCurrency?: string;
    rawData?: string;
  }
): Promise<Transaction> {
  const id = generatePrefixedId('txn');
  const timestamp = now();

  await db
    .prepare(
      `INSERT INTO transactions
       (id, subscription_id, app_id, transaction_id, original_transaction_id,
        product_id, platform, type, purchase_date, expires_date,
        revenue_amount, revenue_currency, raw_data, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      id,
      data.subscriptionId || null,
      data.appId,
      data.transactionId,
      data.originalTransactionId || null,
      data.productId,
      data.platform,
      data.type,
      data.purchaseDate,
      data.expiresDate || null,
      data.revenueAmount || null,
      data.revenueCurrency || null,
      data.rawData || null,
      timestamp
    )
    .run();

  return {
    id,
    subscription_id: data.subscriptionId || null,
    app_id: data.appId,
    transaction_id: data.transactionId,
    original_transaction_id: data.originalTransactionId || null,
    product_id: data.productId,
    platform: data.platform,
    type: data.type,
    purchase_date: data.purchaseDate,
    expires_date: data.expiresDate || null,
    revenue_amount: data.revenueAmount || null,
    revenue_currency: data.revenueCurrency || null,
    is_refunded: false,
    refund_date: null,
    raw_data: data.rawData || null,
    created_at: timestamp,
  };
}

export async function markTransactionRefunded(
  db: D1Database,
  transactionId: string,
  refundDate: number
): Promise<void> {
  await db
    .prepare(
      'UPDATE transactions SET is_refunded = 1, refund_date = ? WHERE transaction_id = ?'
    )
    .bind(refundDate, transactionId)
    .run();
}

// ============ Entitlements ============

export async function getEntitlementDefinitions(
  db: D1Database,
  appId: string
): Promise<EntitlementDefinition[]> {
  const result = await db
    .prepare('SELECT * FROM entitlement_definitions WHERE app_id = ?')
    .bind(appId)
    .all<EntitlementDefinition>();
  return result.results || [];
}

export async function getProductEntitlements(
  db: D1Database,
  appId: string
): Promise<ProductEntitlement[]> {
  const result = await db
    .prepare('SELECT * FROM product_entitlements WHERE app_id = ?')
    .bind(appId)
    .all<ProductEntitlement>();
  return result.results || [];
}

export async function createEntitlementDefinition(
  db: D1Database,
  appId: string,
  identifier: string,
  displayName?: string
): Promise<EntitlementDefinition> {
  const id = generatePrefixedId('ent');
  const timestamp = now();

  await db
    .prepare(
      `INSERT INTO entitlement_definitions
       (id, app_id, identifier, display_name, created_at)
       VALUES (?, ?, ?, ?, ?)`
    )
    .bind(id, appId, identifier, displayName || null, timestamp)
    .run();

  return {
    id,
    app_id: appId,
    identifier,
    display_name: displayName || null,
    created_at: timestamp,
  };
}

export async function createProductEntitlement(
  db: D1Database,
  appId: string,
  productId: string,
  platform: Platform,
  entitlementId: string
): Promise<ProductEntitlement> {
  const id = generatePrefixedId('pe');
  const timestamp = now();

  await db
    .prepare(
      `INSERT INTO product_entitlements
       (id, app_id, product_id, platform, entitlement_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .bind(id, appId, productId, platform, entitlementId, timestamp)
    .run();

  return {
    id,
    app_id: appId,
    product_id: productId,
    platform,
    entitlement_id: entitlementId,
    created_at: timestamp,
  };
}

// ============ Webhooks ============

export async function getWebhooksByAppId(
  db: D1Database,
  appId: string
): Promise<Webhook[]> {
  const result = await db
    .prepare('SELECT * FROM webhooks WHERE app_id = ? AND active = 1')
    .bind(appId)
    .all<Webhook>();
  return result.results || [];
}

export async function createWebhook(
  db: D1Database,
  appId: string,
  url: string,
  secret: string,
  events: string[]
): Promise<Webhook> {
  const id = generatePrefixedId('wh');
  const timestamp = now();

  await db
    .prepare(
      `INSERT INTO webhooks (id, app_id, url, secret, events, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .bind(id, appId, url, secret, JSON.stringify(events), timestamp)
    .run();

  return {
    id,
    app_id: appId,
    url,
    secret,
    events: JSON.stringify(events),
    active: true,
    created_at: timestamp,
  };
}

export async function createWebhookDelivery(
  db: D1Database,
  webhookId: string,
  eventType: string,
  payload: string
): Promise<WebhookDelivery> {
  const id = generatePrefixedId('whd');
  const timestamp = now();

  await db
    .prepare(
      `INSERT INTO webhook_deliveries
       (id, webhook_id, event_type, payload, created_at)
       VALUES (?, ?, ?, ?, ?)`
    )
    .bind(id, webhookId, eventType, payload, timestamp)
    .run();

  return {
    id,
    webhook_id: webhookId,
    event_type: eventType,
    payload,
    response_status: null,
    response_body: null,
    attempts: 0,
    next_retry_at: null,
    delivered_at: null,
    created_at: timestamp,
  };
}

export async function updateWebhookDelivery(
  db: D1Database,
  id: string,
  data: {
    responseStatus?: number;
    responseBody?: string;
    attempts?: number;
    nextRetryAt?: number | null;
    deliveredAt?: number;
  }
): Promise<void> {
  const updates: string[] = [];
  const values: (string | number | null)[] = [];

  if (data.responseStatus !== undefined) {
    updates.push('response_status = ?');
    values.push(data.responseStatus);
  }
  if (data.responseBody !== undefined) {
    updates.push('response_body = ?');
    values.push(data.responseBody);
  }
  if (data.attempts !== undefined) {
    updates.push('attempts = ?');
    values.push(data.attempts);
  }
  if (data.nextRetryAt !== undefined) {
    updates.push('next_retry_at = ?');
    values.push(data.nextRetryAt);
  }
  if (data.deliveredAt !== undefined) {
    updates.push('delivered_at = ?');
    values.push(data.deliveredAt);
  }

  if (updates.length === 0) return;

  values.push(id);
  await db
    .prepare(`UPDATE webhook_deliveries SET ${updates.join(', ')} WHERE id = ?`)
    .bind(...values)
    .run();
}

// ============ Analytics ============

export async function createAnalyticsEvent(
  db: D1Database,
  data: {
    appId: string;
    subscriberId?: string;
    eventType: EventType;
    eventDate: number;
    productId?: string;
    platform?: Platform;
    revenueAmount?: number;
    revenueCurrency?: string;
  }
): Promise<void> {
  const id = generatePrefixedId('evt');
  const timestamp = now();

  await db
    .prepare(
      `INSERT INTO analytics_events
       (id, app_id, subscriber_id, event_type, event_date, product_id,
        platform, revenue_amount, revenue_currency, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      id,
      data.appId,
      data.subscriberId || null,
      data.eventType,
      data.eventDate,
      data.productId || null,
      data.platform || null,
      data.revenueAmount || null,
      data.revenueCurrency || null,
      timestamp
    )
    .run();
}

export async function getActiveSubscribersCount(
  db: D1Database,
  appId: string,
  excludeSandbox: boolean = false
): Promise<number> {
  const sandboxFilter = excludeSandbox ? ' AND is_sandbox = 0' : '';
  const result = await db
    .prepare(
      `SELECT COUNT(DISTINCT subscriber_id) as count
       FROM subscriptions
       WHERE app_id = ? AND status = 'active'${sandboxFilter}`
    )
    .bind(appId)
    .first<{ count: number }>();
  return result?.count || 0;
}

export async function getActiveTrialsCount(
  db: D1Database,
  appId: string,
  excludeSandbox: boolean = false
): Promise<number> {
  const sandboxFilter = excludeSandbox ? ' AND is_sandbox = 0' : '';
  const result = await db
    .prepare(
      `SELECT COUNT(*) as count
       FROM subscriptions
       WHERE app_id = ? AND status = 'active' AND is_trial = 1${sandboxFilter}`
    )
    .bind(appId)
    .first<{ count: number }>();
  return result?.count || 0;
}

export async function getMRR(
  db: D1Database,
  appId: string,
  excludeSandbox: boolean = false
): Promise<number> {
  const sandboxFilter = excludeSandbox ? ' AND is_sandbox = 0' : '';
  const result = await db
    .prepare(
      `SELECT SUM(price_amount) as total
       FROM subscriptions
       WHERE app_id = ? AND status = 'active' AND price_amount IS NOT NULL${sandboxFilter}`
    )
    .bind(appId)
    .first<{ total: number | null }>();
  return (result?.total || 0) / 100; // Convert cents to dollars
}

export async function getRevenueByPlatform(
  db: D1Database,
  appId: string,
  startDate: number,
  endDate: number,
  excludeSandbox: boolean = false
): Promise<Record<Platform, number>> {
  // Join with subscriptions to filter sandbox
  const sandboxJoin = excludeSandbox
    ? ' JOIN subscriptions s ON s.id = t.subscription_id AND s.is_sandbox = 0'
    : '';
  const result = await db
    .prepare(
      `SELECT t.platform, SUM(t.revenue_amount) as total
       FROM transactions t${sandboxJoin}
       WHERE t.app_id = ? AND t.purchase_date >= ? AND t.purchase_date <= ? AND t.is_refunded = 0
       GROUP BY t.platform`
    )
    .bind(appId, startDate, endDate)
    .all<{ platform: Platform; total: number }>();

  const revenue: Record<Platform, number> = { ios: 0, android: 0, stripe: 0 };
  for (const row of result.results || []) {
    revenue[row.platform] = (row.total || 0) / 100;
  }
  return revenue;
}

export async function getChurnRate(
  db: D1Database,
  appId: string,
  periodDays: number = 30,
  excludeSandbox: boolean = false
): Promise<number> {
  const endDate = now();
  const startDate = endDate - periodDays * 24 * 60 * 60 * 1000;
  const sandboxFilter = excludeSandbox ? ' AND is_sandbox = 0' : '';

  // Churned subscribers (cancelled or expired in period)
  const churned = await db
    .prepare(
      `SELECT COUNT(DISTINCT subscriber_id) as count
       FROM subscriptions
       WHERE app_id = ?
         AND ((cancelled_at >= ? AND cancelled_at <= ?) OR (expires_at >= ? AND expires_at <= ? AND status = 'expired'))${sandboxFilter}`
    )
    .bind(appId, startDate, endDate, startDate, endDate)
    .first<{ count: number }>();

  // Active at start of period
  const activeAtStart = await db
    .prepare(
      `SELECT COUNT(DISTINCT subscriber_id) as count
       FROM subscriptions
       WHERE app_id = ?
         AND purchase_date < ?
         AND (expires_at > ? OR status = 'active')${sandboxFilter}`
    )
    .bind(appId, startDate, startDate)
    .first<{ count: number }>();

  const churnedCount = churned?.count || 0;
  const activeCount = activeAtStart?.count || 1;

  return (churnedCount / activeCount) * 100;
}

// ===========================================
// Notification Idempotency
// ===========================================

/**
 * Check if notification was already processed
 */
export async function isNotificationProcessed(
  db: D1Database,
  appId: string,
  platform: string,
  notificationId: string
): Promise<boolean> {
  const result = await db
    .prepare(
      `SELECT 1 FROM processed_notifications
       WHERE app_id = ? AND platform = ? AND notification_id = ?`
    )
    .bind(appId, platform, notificationId)
    .first();

  return result !== null;
}

/**
 * Mark notification as processed
 */
export async function markNotificationProcessed(
  db: D1Database,
  appId: string,
  platform: string,
  notificationId: string,
  notificationType?: string
): Promise<void> {
  const id = `pn_${crypto.randomUUID().replace(/-/g, '')}`;

  await db
    .prepare(
      `INSERT OR IGNORE INTO processed_notifications
       (id, app_id, notification_id, platform, notification_type, processed_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .bind(id, appId, notificationId, platform, notificationType || null, now())
    .run();
}

/**
 * Cleanup old processed notifications (older than 7 days)
 */
export async function cleanupProcessedNotifications(
  db: D1Database,
  maxAgeDays: number = 7
): Promise<number> {
  const cutoff = now() - maxAgeDays * 24 * 60 * 60 * 1000;

  const result = await db
    .prepare(
      `DELETE FROM processed_notifications WHERE processed_at < ?`
    )
    .bind(cutoff)
    .run();

  return result.meta.changes || 0;
}
