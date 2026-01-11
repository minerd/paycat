/**
 * Amazon Appstore S2S Notifications
 * SNS Real-time Developer Notifications Handler
 */

import { Hono } from 'hono';
import type { Env } from '../../types';
import {
  parseAmazonNotification,
  mapAmazonEventType,
  mapAmazonNotificationToStatus,
  confirmSNSSubscription,
} from '../../services/amazon/notification';
import { createAmazonClient } from '../../services/amazon/client';
import { dispatchWebhook } from '../../services/webhook-dispatcher';
import { generateId } from '../../utils/id';

export const amazonNotificationsRouter = new Hono<{ Bindings: Env }>();

/**
 * POST /v1/notifications/amazon
 * Receive Amazon SNS notifications
 */
amazonNotificationsRouter.post('/', async (c) => {
  const body = await c.req.text();
  const headers = Object.fromEntries(c.req.raw.headers.entries());

  try {
    const parsed = await parseAmazonNotification(body, headers);

    // Handle subscription confirmation
    if (parsed.type === 'subscription_confirmation' && parsed.subscribeUrl) {
      console.log('Confirming SNS subscription...');
      const confirmed = await confirmSNSSubscription(parsed.subscribeUrl);
      if (confirmed) {
        return c.json({ confirmed: true });
      }
      return c.json({ error: 'Failed to confirm subscription' }, 500);
    }

    // Handle unsubscribe
    if (parsed.type === 'unsubscribe') {
      console.log('Received SNS unsubscribe confirmation');
      return c.json({ acknowledged: true });
    }

    // Process notification
    const notification = parsed.notification;
    if (!notification) {
      return c.json({ error: 'No notification message' }, 400);
    }

    console.log('Amazon notification:', notification.notificationType, notification.productId);

    // Find app by product ID pattern or topic ARN
    // In production, you'd have a mapping from Amazon product IDs to apps
    const app = await c.env.DB.prepare(
      `SELECT * FROM apps WHERE amazon_config IS NOT NULL LIMIT 1`
    ).first();

    if (!app) {
      console.log('No app found for Amazon notification');
      return c.json({ received: true }); // Still acknowledge
    }

    const isSandbox = notification.environment === 'SANDBOX';

    // Find or create subscriber
    let subscriber = await c.env.DB.prepare(
      `SELECT * FROM subscribers WHERE app_id = ? AND app_user_id = ?`
    ).bind(app.id, notification.userId).first();

    if (!subscriber) {
      const subscriberId = generateId();
      const now = Date.now();
      await c.env.DB.prepare(
        `INSERT INTO subscribers (id, app_id, app_user_id, first_seen_at, last_seen_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`
      ).bind(subscriberId, app.id, notification.userId, now, now, now).run();

      subscriber = { id: subscriberId, app_id: app.id, app_user_id: notification.userId };
    }

    // Get Amazon client to verify receipt
    const amazonClient = createAmazonClient(app.amazon_config as string);

    // Find existing subscription
    let subscription = await c.env.DB.prepare(
      `SELECT * FROM subscriptions
       WHERE subscriber_id = ? AND platform = 'amazon' AND product_id = ?`
    ).bind(subscriber.id, notification.productId).first();

    // Map notification to status
    const newStatus = mapAmazonNotificationToStatus(notification.notificationType);
    const eventType = mapAmazonEventType(notification.notificationType);
    const now = Date.now();

    // Verify receipt if we have client and it's a purchase/renewal
    let receiptData = null;
    if (amazonClient && ['PURCHASE', 'RENEWAL'].includes(notification.notificationType)) {
      try {
        receiptData = await amazonClient.verifyReceipt({
          userId: notification.userId,
          receiptId: notification.receiptId,
        });
      } catch (e) {
        console.error('Failed to verify Amazon receipt:', e);
      }
    }

    if (subscription) {
      // Update existing subscription
      if (newStatus) {
        const updates: string[] = ['updated_at = ?'];
        const values: any[] = [now];

        updates.push('status = ?');
        values.push(newStatus);

        if (notification.notificationType === 'CANCEL') {
          updates.push('cancelled_at = ?');
          values.push(now);
          updates.push('will_renew = ?');
          values.push(0);
        }

        if (notification.notificationType === 'REVOKE') {
          updates.push('cancelled_at = ?');
          values.push(now);
        }

        if (receiptData?.renewalDate) {
          updates.push('expires_at = ?');
          values.push(receiptData.renewalDate);
        }

        if (receiptData?.gracePeriod) {
          updates.push('grace_period_expires_at = ?');
          // Grace period typically 7 days for Amazon
          values.push(now + 7 * 24 * 60 * 60 * 1000);
        }

        values.push(subscription.id);

        await c.env.DB.prepare(
          `UPDATE subscriptions SET ${updates.join(', ')} WHERE id = ?`
        ).bind(...values).run();
      }
    } else if (notification.notificationType === 'PURCHASE' && receiptData) {
      // Create new subscription
      const subscriptionId = generateId();

      await c.env.DB.prepare(
        `INSERT INTO subscriptions (
          id, subscriber_id, app_id, platform, product_id,
          amazon_receipt_id, status, purchase_date, expires_at,
          is_trial, is_intro_offer, is_sandbox, will_renew,
          created_at, updated_at
        ) VALUES (?, ?, ?, 'amazon', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(
        subscriptionId,
        subscriber.id,
        app.id,
        notification.productId,
        notification.receiptId,
        'active',
        receiptData.purchaseDate,
        receiptData.renewalDate || null,
        receiptData.freeTrialEndDate ? receiptData.freeTrialEndDate > now : false,
        receiptData.introductoryPriceEndDate ? receiptData.introductoryPriceEndDate > now : false,
        isSandbox,
        receiptData.autoRenewing ?? true,
        now,
        now
      ).run();

      subscription = { id: subscriptionId };
    }

    // Record transaction
    const transactionId = generateId();
    await c.env.DB.prepare(
      `INSERT INTO transactions (
        id, subscription_id, app_id, transaction_id, original_transaction_id,
        product_id, platform, type, purchase_date, expires_date,
        raw_data, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, 'amazon', ?, ?, ?, ?, ?)`
    ).bind(
      transactionId,
      subscription?.id || null,
      app.id,
      notification.receiptId,
      notification.receiptId,
      notification.productId,
      eventType,
      now,
      receiptData?.renewalDate || null,
      JSON.stringify(notification),
      now
    ).run();

    // Record analytics event
    await c.env.DB.prepare(
      `INSERT INTO analytics_events (
        id, app_id, subscriber_id, event_type, event_date,
        product_id, platform, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, 'amazon', ?)`
    ).bind(
      generateId(),
      app.id,
      subscriber.id,
      eventType,
      now,
      notification.productId,
      now
    ).run();

    // Dispatch webhook
    await dispatchWebhook(c.env.DB, app.id as string, {
      type: eventType,
      app_id: app.id as string,
      subscriber_id: subscriber.id as string,
      subscription_id: subscription?.id as string,
      product_id: notification.productId,
      platform: 'amazon',
      environment: isSandbox ? 'sandbox' : 'production',
      timestamp: new Date().toISOString(),
      data: {
        receipt_id: notification.receiptId,
        user_id: notification.userId,
        notification_type: notification.notificationType,
      },
    });

    return c.json({ received: true });
  } catch (error) {
    console.error('Amazon notification error:', error);
    return c.json({ error: 'Failed to process notification' }, 500);
  }
});

/**
 * GET /v1/notifications/amazon
 * Health check / SNS subscription confirmation via GET
 */
amazonNotificationsRouter.get('/', async (c) => {
  return c.json({
    status: 'ok',
    message: 'Amazon SNS notification endpoint',
  });
});
