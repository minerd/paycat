/**
 * Receipt Verification Routes
 * POST /v1/receipts - Verify and sync subscription
 */

import { Hono } from 'hono';
import type { Env, App, VerifyReceiptRequest, SubscriberResponse } from '../types';
import { verifyAndSyncSubscription } from '../services/subscription';
import { calculateEntitlements } from '../services/entitlement';
import { getSubscriberByAppUserId } from '../db/queries';
import { Errors } from '../middleware/error';
import { toISOString } from '../utils/time';

// Extend context with app
type Variables = { app: App };

export const receiptsRouter = new Hono<{
  Bindings: Env;
  Variables: Variables;
}>();

/**
 * POST /v1/receipts
 * Verify receipt and return subscriber info
 */
receiptsRouter.post('/', async (c) => {
  const app = c.get('app');
  const body = await c.req.json<VerifyReceiptRequest>();

  // Validate request
  if (!body.app_user_id) {
    throw Errors.validationError('app_user_id is required');
  }

  if (!body.platform) {
    throw Errors.validationError('platform is required');
  }

  if (!['ios', 'android', 'stripe'].includes(body.platform)) {
    throw Errors.validationError('platform must be ios, android, or stripe');
  }

  if (!body.receipt_data) {
    throw Errors.validationError('receipt_data is required');
  }

  // Validate platform-specific fields
  if (body.platform === 'ios' && !body.receipt_data.transaction_id) {
    throw Errors.validationError('transaction_id is required for iOS');
  }

  if (body.platform === 'android' && !body.receipt_data.purchase_token) {
    throw Errors.validationError('purchase_token is required for Android');
  }

  if (body.platform === 'stripe' && !body.receipt_data.subscription_id) {
    throw Errors.validationError('subscription_id is required for Stripe');
  }

  // Verify receipt
  await verifyAndSyncSubscription(c.env.DB, {
    appId: app.id,
    appUserId: body.app_user_id,
    platform: body.platform,
    transactionId: body.receipt_data.transaction_id,
    purchaseToken: body.receipt_data.purchase_token,
    stripeSubscriptionId: body.receipt_data.subscription_id,
    appleConfig: app.apple_config || undefined,
    googleConfig: app.google_config || undefined,
    stripeConfig: app.stripe_config || undefined,
  });

  // Get subscriber and calculate entitlements
  const subscriber = await getSubscriberByAppUserId(
    c.env.DB,
    app.id,
    body.app_user_id
  );

  if (!subscriber) {
    throw Errors.subscriberNotFound();
  }

  const { subscriptions, entitlements } = await calculateEntitlements(
    c.env.DB,
    subscriber.id,
    app.id
  );

  // Build response
  const response: { subscriber: SubscriberResponse } = {
    subscriber: {
      original_app_user_id: subscriber.app_user_id,
      first_seen: toISOString(subscriber.first_seen_at),
      subscriptions,
      entitlements,
    },
  };

  // Cache subscriber data in KV (optional, for fast lookups)
  try {
    await c.env.CACHE.put(
      `subscriber:${app.id}:${body.app_user_id}`,
      JSON.stringify(response),
      { expirationTtl: 300 } // 5 minutes
    );
  } catch (e) {
    // KV write failure shouldn't fail the request
    console.error('KV cache write failed:', e);
  }

  return c.json(response);
});

/**
 * POST /v1/receipts/verify
 * Alias for POST /v1/receipts (redirects to main handler)
 */
receiptsRouter.post('/verify', (c) => {
  // Redirect to main receipts endpoint
  return c.redirect('/v1/receipts', 307);
});
