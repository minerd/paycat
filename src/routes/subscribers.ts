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
 * DELETE /v1/subscribers/:app_user_id
 * Delete subscriber (for GDPR compliance)
 */
subscribersRouter.delete('/:app_user_id', async (c) => {
  const app = c.get('app');
  const appUserId = c.req.param('app_user_id');

  const subscriber = await getSubscriberByAppUserId(c.env.DB, app.id, appUserId);

  if (!subscriber) {
    throw Errors.subscriberNotFound();
  }

  // Delete all related data
  await c.env.DB.batch([
    c.env.DB.prepare(
      'DELETE FROM transactions WHERE subscription_id IN (SELECT id FROM subscriptions WHERE subscriber_id = ?)'
    ).bind(subscriber.id),
    c.env.DB.prepare(
      'DELETE FROM subscriptions WHERE subscriber_id = ?'
    ).bind(subscriber.id),
    c.env.DB.prepare('DELETE FROM subscribers WHERE id = ?').bind(subscriber.id),
  ]);

  // Clear cache
  try {
    await c.env.CACHE.delete(`subscriber:${app.id}:${appUserId}`);
  } catch (e) {
    console.error('KV cache delete failed:', e);
  }

  return c.json({ deleted: true });
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
