/**
 * Subscriber Management Routes
 * GET /v1/subscribers/:id - Get subscriber info
 */

import { Hono } from 'hono';
import type { Env, App, SubscriberResponse } from '../types';
import { calculateEntitlements } from '../services/entitlement';
import { getSubscriberByAppUserId } from '../db/queries';
import { Errors } from '../middleware/error';
import { toISOString } from '../utils/time';

type Variables = { app: App };

export const subscribersRouter = new Hono<{
  Bindings: Env;
  Variables: Variables;
}>();

/**
 * GET /v1/subscribers/:app_user_id
 * Get subscriber by app user ID
 */
subscribersRouter.get('/:app_user_id', async (c) => {
  const app = c.get('app');
  const appUserId = c.req.param('app_user_id');

  // Try cache first
  const cacheKey = `subscriber:${app.id}:${appUserId}`;
  try {
    const cached = await c.env.CACHE.get(cacheKey);
    if (cached) {
      return c.json(JSON.parse(cached));
    }
  } catch (e) {
    // Cache miss or error, continue to DB
  }

  // Get subscriber from DB
  const subscriber = await getSubscriberByAppUserId(c.env.DB, app.id, appUserId);

  if (!subscriber) {
    throw Errors.subscriberNotFound();
  }

  // Calculate entitlements
  const { subscriptions, entitlements } = await calculateEntitlements(
    c.env.DB,
    subscriber.id,
    app.id
  );

  const response: { subscriber: SubscriberResponse } = {
    subscriber: {
      original_app_user_id: subscriber.app_user_id,
      first_seen: toISOString(subscriber.first_seen_at),
      subscriptions,
      entitlements,
    },
  };

  // Cache response
  try {
    await c.env.CACHE.put(cacheKey, JSON.stringify(response), {
      expirationTtl: 300,
    });
  } catch (e) {
    console.error('KV cache write failed:', e);
  }

  return c.json(response);
});

/**
 * GET /v1/subscribers/:app_user_id/entitlements
 * Get only entitlements for a subscriber
 */
subscribersRouter.get('/:app_user_id/entitlements', async (c) => {
  const app = c.get('app');
  const appUserId = c.req.param('app_user_id');

  const subscriber = await getSubscriberByAppUserId(c.env.DB, app.id, appUserId);

  if (!subscriber) {
    throw Errors.subscriberNotFound();
  }

  const { entitlements } = await calculateEntitlements(
    c.env.DB,
    subscriber.id,
    app.id
  );

  return c.json({ entitlements });
});

/**
 * GET /v1/subscribers/:app_user_id/entitlements/:identifier
 * Check if subscriber has specific entitlement
 */
subscribersRouter.get('/:app_user_id/entitlements/:identifier', async (c) => {
  const app = c.get('app');
  const appUserId = c.req.param('app_user_id');
  const identifier = c.req.param('identifier');

  const subscriber = await getSubscriberByAppUserId(c.env.DB, app.id, appUserId);

  if (!subscriber) {
    throw Errors.subscriberNotFound();
  }

  const { entitlements } = await calculateEntitlements(
    c.env.DB,
    subscriber.id,
    app.id
  );

  const entitlement = entitlements[identifier];

  if (!entitlement) {
    return c.json({
      entitlement: {
        identifier,
        is_active: false,
        product_identifier: null,
        expires_date: null,
      },
    });
  }

  return c.json({
    entitlement: {
      identifier,
      ...entitlement,
    },
  });
});

/**
 * GET /v1/subscribers/:app_user_id/export
 * Export all subscriber data (GDPR data portability)
 */
subscribersRouter.get('/:app_user_id/export', async (c) => {
  const app = c.get('app');
  const appUserId = c.req.param('app_user_id');
  const format = c.req.query('format') || 'json';

  const subscriber = await getSubscriberByAppUserId(c.env.DB, app.id, appUserId);

  if (!subscriber) {
    throw Errors.subscriberNotFound();
  }

  // Get all subscriber data
  const [subscriptions, transactions, analyticsEvents, customEvents] = await Promise.all([
    c.env.DB.prepare('SELECT * FROM subscriptions WHERE subscriber_id = ?')
      .bind(subscriber.id)
      .all(),
    c.env.DB.prepare(
      'SELECT * FROM transactions WHERE subscription_id IN (SELECT id FROM subscriptions WHERE subscriber_id = ?)'
    )
      .bind(subscriber.id)
      .all(),
    c.env.DB.prepare('SELECT * FROM analytics_events WHERE subscriber_id = ?')
      .bind(subscriber.id)
      .all(),
    c.env.DB.prepare('SELECT * FROM custom_events WHERE subscriber_id = ?')
      .bind(subscriber.id)
      .all(),
  ]);

  // Get experiment enrollments if any
  const experimentEnrollments = await c.env.DB.prepare(
    'SELECT * FROM experiment_enrollments WHERE subscriber_id = ?'
  )
    .bind(subscriber.id)
    .all();

  const exportData = {
    export_date: new Date().toISOString(),
    export_type: 'gdpr_data_export',
    subscriber: {
      id: subscriber.id,
      app_user_id: subscriber.app_user_id,
      first_seen_at: toISOString(subscriber.first_seen_at),
      last_seen_at: toISOString(subscriber.last_seen_at),
      attributes: subscriber.attributes ? JSON.parse(subscriber.attributes) : null,
      created_at: toISOString(subscriber.created_at),
    },
    subscriptions: (subscriptions.results || []).map((s: any) => ({
      id: s.id,
      platform: s.platform,
      product_id: s.product_id,
      status: s.status,
      purchase_date: s.purchase_date ? toISOString(s.purchase_date) : null,
      expires_at: s.expires_at ? toISOString(s.expires_at) : null,
      cancelled_at: s.cancelled_at ? toISOString(s.cancelled_at) : null,
      is_trial: !!s.is_trial,
      is_sandbox: !!s.is_sandbox,
      will_renew: !!s.will_renew,
      price_amount: s.price_amount ? s.price_amount / 100 : null,
      price_currency: s.price_currency,
    })),
    transactions: (transactions.results || []).map((t: any) => ({
      id: t.id,
      transaction_id: t.transaction_id,
      product_id: t.product_id,
      platform: t.platform,
      type: t.type,
      purchase_date: t.purchase_date ? toISOString(t.purchase_date) : null,
      revenue_amount: t.revenue_amount ? t.revenue_amount / 100 : null,
      revenue_currency: t.revenue_currency,
      is_refunded: !!t.is_refunded,
      refund_date: t.refund_date ? toISOString(t.refund_date) : null,
    })),
    analytics_events: (analyticsEvents.results || []).map((e: any) => ({
      id: e.id,
      event_type: e.event_type,
      event_date: e.event_date ? toISOString(e.event_date) : null,
      product_id: e.product_id,
      platform: e.platform,
    })),
    custom_events: (customEvents.results || []).map((e: any) => ({
      id: e.id,
      event_name: e.event_name,
      properties: e.event_properties ? JSON.parse(e.event_properties) : null,
      timestamp: e.timestamp ? toISOString(e.timestamp) : null,
    })),
    experiment_enrollments: (experimentEnrollments.results || []).map((e: any) => ({
      experiment_id: e.experiment_id,
      variant_id: e.variant_id,
      enrolled_at: e.enrolled_at ? toISOString(e.enrolled_at) : null,
      converted: !!e.converted,
    })),
  };

  if (format === 'csv') {
    // Convert to CSV for download
    const csvLines: string[] = [];

    // Subscriber info
    csvLines.push('=== SUBSCRIBER INFO ===');
    csvLines.push('Field,Value');
    csvLines.push(`app_user_id,${subscriber.app_user_id}`);
    csvLines.push(`first_seen_at,${toISOString(subscriber.first_seen_at)}`);
    csvLines.push(`last_seen_at,${toISOString(subscriber.last_seen_at)}`);
    csvLines.push('');

    // Subscriptions
    csvLines.push('=== SUBSCRIPTIONS ===');
    csvLines.push('platform,product_id,status,purchase_date,expires_at,is_trial,price');
    for (const s of exportData.subscriptions) {
      csvLines.push(`${s.platform},${s.product_id},${s.status},${s.purchase_date || ''},${s.expires_at || ''},${s.is_trial},${s.price_amount || ''} ${s.price_currency || ''}`);
    }
    csvLines.push('');

    // Transactions
    csvLines.push('=== TRANSACTIONS ===');
    csvLines.push('transaction_id,product_id,type,date,amount,is_refunded');
    for (const t of exportData.transactions) {
      csvLines.push(`${t.transaction_id},${t.product_id},${t.type},${t.purchase_date || ''},${t.revenue_amount || ''} ${t.revenue_currency || ''},${t.is_refunded}`);
    }

    return new Response(csvLines.join('\n'), {
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="subscriber_data_${appUserId}_${Date.now()}.csv"`,
      },
    });
  }

  return c.json(exportData, 200, {
    'Content-Disposition': `attachment; filename="subscriber_data_${appUserId}_${Date.now()}.json"`,
  });
});

/**
 * DELETE /v1/subscribers/:app_user_id
 * Delete subscriber and all associated data (GDPR right to erasure)
 */
subscribersRouter.delete('/:app_user_id', async (c) => {
  const app = c.get('app');
  const appUserId = c.req.param('app_user_id');
  const confirm = c.req.query('confirm');

  const subscriber = await getSubscriberByAppUserId(c.env.DB, app.id, appUserId);

  if (!subscriber) {
    throw Errors.subscriberNotFound();
  }

  // Require confirmation for deletion
  if (confirm !== 'true') {
    return c.json({
      warning: 'This action will permanently delete all subscriber data.',
      data_to_be_deleted: {
        subscriber: true,
        subscriptions: true,
        transactions: true,
        analytics_events: true,
        custom_events: true,
        experiment_enrollments: true,
      },
      confirm_url: `/v1/subscribers/${appUserId}?confirm=true`,
      method: 'DELETE',
    }, 200);
  }

  // Delete all related data in correct order (respecting foreign keys)
  await c.env.DB.batch([
    // Delete experiment enrollments
    c.env.DB.prepare('DELETE FROM experiment_enrollments WHERE subscriber_id = ?').bind(subscriber.id),
    // Delete custom events
    c.env.DB.prepare('DELETE FROM custom_events WHERE subscriber_id = ?').bind(subscriber.id),
    // Delete analytics events
    c.env.DB.prepare('DELETE FROM analytics_events WHERE subscriber_id = ?').bind(subscriber.id),
    // Delete transactions
    c.env.DB.prepare(
      'DELETE FROM transactions WHERE subscription_id IN (SELECT id FROM subscriptions WHERE subscriber_id = ?)'
    ).bind(subscriber.id),
    // Delete subscriptions
    c.env.DB.prepare('DELETE FROM subscriptions WHERE subscriber_id = ?').bind(subscriber.id),
    // Delete subscriber
    c.env.DB.prepare('DELETE FROM subscribers WHERE id = ?').bind(subscriber.id),
  ]);

  // Clear cache
  try {
    await c.env.CACHE.delete(`subscriber:${app.id}:${appUserId}`);
  } catch (e) {
    console.error('KV cache delete failed:', e);
  }

  return c.json({
    deleted: true,
    message: 'All subscriber data has been permanently deleted.',
    deleted_at: new Date().toISOString(),
  });
});

/**
 * POST /v1/subscribers/:app_user_id/attributes
 * Update subscriber attributes (custom metadata)
 */
subscribersRouter.post('/:app_user_id/attributes', async (c) => {
  const app = c.get('app');
  const appUserId = c.req.param('app_user_id');
  const body = await c.req.json<{ attributes: Record<string, unknown> }>();

  const subscriber = await getSubscriberByAppUserId(c.env.DB, app.id, appUserId);

  if (!subscriber) {
    throw Errors.subscriberNotFound();
  }

  // Merge with existing attributes (safely parse JSON)
  let existingAttributes: Record<string, unknown> = {};
  if (subscriber.attributes) {
    try {
      existingAttributes = JSON.parse(subscriber.attributes);
    } catch {
      console.error('Failed to parse subscriber attributes:', subscriber.id);
      existingAttributes = {};
    }
  }
  const newAttributes = { ...existingAttributes, ...body.attributes };

  await c.env.DB.prepare(
    'UPDATE subscribers SET attributes = ?, last_seen_at = ? WHERE id = ?'
  )
    .bind(JSON.stringify(newAttributes), Date.now(), subscriber.id)
    .run();

  // Clear cache
  try {
    await c.env.CACHE.delete(`subscriber:${app.id}:${appUserId}`);
  } catch (e) {
    console.error('KV cache delete failed:', e);
  }

  return c.json({ attributes: newAttributes });
});
