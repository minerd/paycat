/**
 * Paddle Webhook Handler
 * Process Paddle billing events
 */

import { Hono } from 'hono';
import type { Env } from '../../types';
import {
  verifyPaddleWebhook,
  parsePaddleWebhook,
  parsePassthrough,
  mapPaddleEventType,
  mapPaddleStatusToMRRCat,
  extractSubscriptionData,
  extractPaymentData,
} from '../../services/paddle/webhook';
import type { PaddleConfig } from '../../services/paddle/types';
import { dispatchWebhook } from '../../services/webhook-dispatcher';
import { generateId } from '../../utils/id';

export const paddleNotificationsRouter = new Hono<{ Bindings: Env }>();

/**
 * POST /v1/notifications/paddle
 * Receive Paddle webhook events
 */
paddleNotificationsRouter.post('/', async (c) => {
  // Parse form data (Paddle sends as form-urlencoded)
  const formData = await c.req.parseBody();
  const body = formData as Record<string, string>;

  // Parse webhook event
  const event = parsePaddleWebhook(body);

  console.log('Paddle webhook:', event.alert_name, event.subscription_id || event.order_id);

  // Parse passthrough to get app_id and app_user_id
  const passthrough = parsePassthrough(event.passthrough);

  // Find app - either from passthrough or by Paddle config
  let app;
  if (passthrough?.app_id) {
    app = await c.env.DB.prepare(
      `SELECT * FROM apps WHERE id = ? AND paddle_config IS NOT NULL`
    ).bind(passthrough.app_id).first();
  } else {
    // Try to find by vendor ID (would need to search all apps)
    app = await c.env.DB.prepare(
      `SELECT * FROM apps WHERE paddle_config IS NOT NULL LIMIT 1`
    ).first();
  }

  if (!app) {
    console.log('No app found for Paddle webhook');
    return c.json({ received: true }); // Still acknowledge
  }

  // Verify signature
  const paddleConfig = JSON.parse(app.paddle_config as string) as PaddleConfig;
  if (paddleConfig.publicKey) {
    const isValid = await verifyPaddleWebhook(body, paddleConfig.publicKey);
    if (!isValid) {
      console.error('Invalid Paddle webhook signature');
      return c.json({ error: 'Invalid signature' }, 401);
    }
  }

  const isSandbox = paddleConfig.sandboxMode ?? false;
  const now = Date.now();

  // Extract data from event
  const subData = extractSubscriptionData(event);
  const paymentData = extractPaymentData(event);
  const eventType = mapPaddleEventType(event.event_type);
  const payCatStatus = mapPaddleStatusToMRRCat(subData.status);

  // Determine app_user_id
  const appUserId = passthrough?.app_user_id || subData.email || subData.userId;

  if (!appUserId) {
    console.error('No user identifier in Paddle webhook');
    return c.json({ error: 'No user identifier' }, 400);
  }

  // Find or create subscriber
  let subscriber = await c.env.DB.prepare(
    `SELECT * FROM subscribers WHERE app_id = ? AND app_user_id = ?`
  ).bind(app.id, appUserId).first();

  if (!subscriber) {
    const subscriberId = generateId();
    await c.env.DB.prepare(
      `INSERT INTO subscribers (id, app_id, app_user_id, first_seen_at, last_seen_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).bind(subscriberId, app.id, appUserId, now, now, now).run();

    subscriber = { id: subscriberId, app_id: app.id, app_user_id: appUserId };
  } else {
    // Update last_seen_at
    await c.env.DB.prepare(
      `UPDATE subscribers SET last_seen_at = ? WHERE id = ?`
    ).bind(now, subscriber.id).run();
  }

  // Get product_id from passthrough or plan mapping
  const productId = passthrough?.product_id || `paddle_plan_${subData.planId}`;

  // Find or create subscription
  let subscription;
  if (subData.subscriptionId) {
    subscription = await c.env.DB.prepare(
      `SELECT * FROM subscriptions
       WHERE subscriber_id = ? AND platform = 'paddle' AND paddle_subscription_id = ?`
    ).bind(subscriber.id, subData.subscriptionId).first();
  }

  // Calculate expires_at from next_bill_date
  let expiresAt: number | null = null;
  if (subData.nextBillDate) {
    expiresAt = new Date(subData.nextBillDate).getTime();
  }

  // Calculate cancelled_at
  let cancelledAt: number | null = null;
  if (subData.cancelledAt) {
    cancelledAt = new Date(subData.cancelledAt).getTime();
  }

  if (subscription) {
    // Update existing subscription
    const updates: string[] = ['updated_at = ?'];
    const values: any[] = [now];

    updates.push('status = ?');
    values.push(payCatStatus);

    if (expiresAt) {
      updates.push('expires_at = ?');
      values.push(expiresAt);
    }

    if (cancelledAt) {
      updates.push('cancelled_at = ?');
      values.push(cancelledAt);
    }

    if (event.alert_name === 'subscription_cancelled') {
      updates.push('will_renew = ?');
      values.push(0);
    }

    if (subData.priceAmount) {
      updates.push('price_amount = ?');
      values.push(subData.priceAmount);
    }

    if (subData.priceCurrency) {
      updates.push('price_currency = ?');
      values.push(subData.priceCurrency);
    }

    values.push(subscription.id);

    await c.env.DB.prepare(
      `UPDATE subscriptions SET ${updates.join(', ')} WHERE id = ?`
    ).bind(...values).run();
  } else if (subData.subscriptionId && event.alert_name === 'subscription_created') {
    // Create new subscription
    const subscriptionId = generateId();

    await c.env.DB.prepare(
      `INSERT INTO subscriptions (
        id, subscriber_id, app_id, platform, product_id,
        paddle_subscription_id, status, purchase_date, expires_at,
        is_sandbox, will_renew, price_amount, price_currency,
        created_at, updated_at
      ) VALUES (?, ?, ?, 'paddle', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      subscriptionId,
      subscriber.id,
      app.id,
      productId,
      subData.subscriptionId,
      'active',
      now,
      expiresAt,
      isSandbox ? 1 : 0,
      1, // will_renew
      subData.priceAmount,
      subData.priceCurrency,
      now,
      now
    ).run();

    subscription = { id: subscriptionId };
  }

  // Record transaction for payment events
  if (['subscription_payment_succeeded', 'subscription_payment_refunded', 'payment_succeeded', 'payment_refunded'].includes(event.alert_name)) {
    const transactionId = generateId();
    const isRefund = event.alert_name.includes('refund');

    await c.env.DB.prepare(
      `INSERT INTO transactions (
        id, subscription_id, app_id, transaction_id, original_transaction_id,
        product_id, platform, type, purchase_date, expires_date,
        revenue_amount, revenue_currency, is_refunded, refund_date,
        raw_data, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, 'paddle', ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      transactionId,
      subscription?.id || null,
      app.id,
      paymentData.paymentId || event.alert_id,
      subData.subscriptionId,
      productId,
      eventType,
      now,
      expiresAt,
      isRefund ? paymentData.refundAmount : paymentData.earnings,
      paymentData.currency,
      isRefund ? 1 : 0,
      isRefund ? now : null,
      JSON.stringify(event),
      now
    ).run();
  }

  // Record analytics event
  await c.env.DB.prepare(
    `INSERT INTO analytics_events (
      id, app_id, subscriber_id, event_type, event_date,
      product_id, platform, revenue_amount, revenue_currency, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, 'paddle', ?, ?, ?)`
  ).bind(
    generateId(),
    app.id,
    subscriber.id,
    eventType,
    now,
    productId,
    paymentData.earnings || null,
    paymentData.currency,
    now
  ).run();

  // Dispatch webhook to customer endpoints
  await dispatchWebhook(c.env.DB, app.id as string, {
    type: eventType,
    app_id: app.id as string,
    subscriber_id: subscriber.id as string,
    subscription_id: subscription?.id as string,
    product_id: productId,
    platform: 'paddle',
    environment: isSandbox ? 'sandbox' : 'production',
    timestamp: new Date().toISOString(),
    data: {
      paddle_subscription_id: subData.subscriptionId,
      paddle_user_id: subData.userId,
      email: subData.email,
      status: subData.status,
      alert_name: event.alert_name,
      payment: paymentData.paymentId ? {
        payment_id: paymentData.paymentId,
        amount: paymentData.amount / 100,
        currency: paymentData.currency,
        receipt_url: paymentData.receiptUrl,
      } : undefined,
    },
  });

  return c.json({ received: true });
});

/**
 * GET /v1/notifications/paddle
 * Health check endpoint
 */
paddleNotificationsRouter.get('/', async (c) => {
  return c.json({
    status: 'ok',
    message: 'Paddle webhook endpoint',
  });
});
