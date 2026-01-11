/**
 * Subscription Management Routes
 * Direct subscription operations
 */

import { Hono } from 'hono';
import type { Env, App, Subscription } from '../types';
import {
  getSubscriberByAppUserId,
  updateSubscription,
} from '../db/queries';
import { Errors } from '../middleware/error';
import { toISOString, now } from '../utils/time';

type Variables = { app: App };

export const subscriptionsRouter = new Hono<{
  Bindings: Env;
  Variables: Variables;
}>();

/**
 * GET /v1/subscriptions
 * List subscriptions (with optional filters)
 */
subscriptionsRouter.get('/', async (c) => {
  const app = c.get('app');
  const appUserId = c.req.query('app_user_id');
  const status = c.req.query('status');
  const platform = c.req.query('platform');
  const limit = parseInt(c.req.query('limit') || '100', 10);
  const offset = parseInt(c.req.query('offset') || '0', 10);

  let query = 'SELECT * FROM subscriptions WHERE app_id = ?';
  const params: (string | number)[] = [app.id];

  if (appUserId) {
    const subscriber = await getSubscriberByAppUserId(c.env.DB, app.id, appUserId);
    if (!subscriber) {
      return c.json({ subscriptions: [], total: 0 });
    }
    query += ' AND subscriber_id = ?';
    params.push(subscriber.id);
  }

  if (status) {
    query += ' AND status = ?';
    params.push(status);
  }

  if (platform) {
    query += ' AND platform = ?';
    params.push(platform);
  }

  query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
  params.push(limit, offset);

  const result = await c.env.DB.prepare(query).bind(...params).all<Subscription>();

  // Get total count
  let countQuery = 'SELECT COUNT(*) as count FROM subscriptions WHERE app_id = ?';
  const countParams: (string | number)[] = [app.id];

  if (appUserId) {
    const subscriber = await getSubscriberByAppUserId(c.env.DB, app.id, appUserId);
    if (subscriber) {
      countQuery += ' AND subscriber_id = ?';
      countParams.push(subscriber.id);
    }
  }
  if (status) {
    countQuery += ' AND status = ?';
    countParams.push(status);
  }
  if (platform) {
    countQuery += ' AND platform = ?';
    countParams.push(platform);
  }

  const countResult = await c.env.DB.prepare(countQuery)
    .bind(...countParams)
    .first<{ count: number }>();

  // Format subscriptions
  const subscriptions = (result.results || []).map(formatSubscription);

  return c.json({
    subscriptions,
    total: countResult?.count || 0,
    limit,
    offset,
  });
});

/**
 * GET /v1/subscriptions/:id
 * Get subscription by ID
 */
subscriptionsRouter.get('/:id', async (c) => {
  const app = c.get('app');
  const id = c.req.param('id');

  const subscription = await c.env.DB.prepare(
    'SELECT * FROM subscriptions WHERE id = ? AND app_id = ?'
  )
    .bind(id, app.id)
    .first<Subscription>();

  if (!subscription) {
    throw Errors.subscriptionNotFound();
  }

  return c.json({ subscription: formatSubscription(subscription) });
});

/**
 * POST /v1/subscriptions/:id/cancel
 * Cancel a subscription (if platform supports it)
 */
subscriptionsRouter.post('/:id/cancel', async (c) => {
  const app = c.get('app');
  const id = c.req.param('id');

  const subscription = await c.env.DB.prepare(
    'SELECT * FROM subscriptions WHERE id = ? AND app_id = ?'
  )
    .bind(id, app.id)
    .first<Subscription>();

  if (!subscription) {
    throw Errors.subscriptionNotFound();
  }

  // Note: Actual platform cancellation would be done here
  // For now, just update local status
  await updateSubscription(c.env.DB, id, {
    status: 'cancelled',
    cancelledAt: now(),
    willRenew: false,
  });

  // Clear related cache
  const subscriber = await c.env.DB.prepare(
    'SELECT app_user_id FROM subscribers WHERE id = ?'
  )
    .bind(subscription.subscriber_id)
    .first<{ app_user_id: string }>();

  if (subscriber) {
    try {
      await c.env.CACHE.delete(`subscriber:${app.id}:${subscriber.app_user_id}`);
    } catch (e) {
      console.error('KV cache delete failed:', e);
    }
  }

  return c.json({
    subscription: formatSubscription({
      ...subscription,
      status: 'cancelled',
      cancelled_at: now(),
      will_renew: false,
    }),
  });
});

/**
 * GET /v1/subscriptions/:id/transactions
 * Get transactions for a subscription
 */
subscriptionsRouter.get('/:id/transactions', async (c) => {
  const app = c.get('app');
  const id = c.req.param('id');
  const limit = parseInt(c.req.query('limit') || '50', 10);
  const offset = parseInt(c.req.query('offset') || '0', 10);

  // Verify subscription exists and belongs to app
  const subscription = await c.env.DB.prepare(
    'SELECT id FROM subscriptions WHERE id = ? AND app_id = ?'
  )
    .bind(id, app.id)
    .first();

  if (!subscription) {
    throw Errors.subscriptionNotFound();
  }

  const result = await c.env.DB.prepare(
    `SELECT * FROM transactions
     WHERE subscription_id = ?
     ORDER BY purchase_date DESC
     LIMIT ? OFFSET ?`
  )
    .bind(id, limit, offset)
    .all();

  const transactions = (result.results || []).map((tx) => ({
    id: tx.id,
    transaction_id: tx.transaction_id,
    original_transaction_id: tx.original_transaction_id,
    product_id: tx.product_id,
    platform: tx.platform,
    type: tx.type,
    purchase_date: toISOString(tx.purchase_date as number),
    expires_date: tx.expires_date
      ? toISOString(tx.expires_date as number)
      : null,
    revenue: tx.revenue_amount
      ? {
          amount: (tx.revenue_amount as number) / 100,
          currency: tx.revenue_currency,
        }
      : null,
    is_refunded: !!tx.is_refunded,
    refund_date: tx.refund_date
      ? toISOString(tx.refund_date as number)
      : null,
    created_at: toISOString(tx.created_at as number),
  }));

  return c.json({ transactions, limit, offset });
});

/**
 * Format subscription for API response
 */
function formatSubscription(sub: Subscription) {
  return {
    id: sub.id,
    subscriber_id: sub.subscriber_id,
    platform: sub.platform,
    product_id: sub.product_id,
    status: sub.status,
    purchase_date: toISOString(sub.purchase_date),
    expires_date: sub.expires_at ? toISOString(sub.expires_at) : null,
    cancelled_at: sub.cancelled_at ? toISOString(sub.cancelled_at) : null,
    grace_period_expires_at: sub.grace_period_expires_at
      ? toISOString(sub.grace_period_expires_at)
      : null,
    is_trial: sub.is_trial,
    is_intro_offer: sub.is_intro_offer,
    is_sandbox: sub.is_sandbox,
    will_renew: sub.will_renew,
    price: sub.price_amount
      ? {
          amount: sub.price_amount / 100,
          currency: sub.price_currency,
        }
      : null,
    created_at: toISOString(sub.created_at),
    updated_at: toISOString(sub.updated_at),
  };
}
