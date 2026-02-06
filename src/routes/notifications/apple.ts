/**
 * Apple App Store Server Notifications V2 Handler
 * POST /v1/notifications/apple
 */

import { Hono } from 'hono';
import type { Env, EventType, AppleConfig } from '../../types';
import {
  parseAppleNotificationSecure,
  mapNotificationToEventType,
  getSubscriptionStatusFromNotification,
  shouldTriggerWebhook,
} from '../../services/apple/notification';
import {
  getSubscriptionByOriginalTransactionId,
  updateSubscription,
  createTransaction,
  createAnalyticsEvent,
  getSubscriberById,
  isNotificationProcessed,
  markNotificationProcessed,
  markTransactionRefunded,
} from '../../db/queries';
import { dispatchWebhook, createWebhookPayload } from '../../services/webhook-dispatcher';
import { calculateEntitlements } from '../../services/entitlement';

export const appleNotificationsRouter = new Hono<{ Bindings: Env }>();

/**
 * Find app by Apple bundle ID (safe JSON parsing)
 */
async function findAppByBundleId(
  db: D1Database,
  bundleId: string
): Promise<{ id: string; apple_config: string } | null> {
  // Get all apps with apple_config
  const result = await db
    .prepare('SELECT id, apple_config FROM apps WHERE apple_config IS NOT NULL')
    .all<{ id: string; apple_config: string }>();

  for (const app of result.results || []) {
    try {
      const config = JSON.parse(app.apple_config) as AppleConfig;
      if (config.bundleId === bundleId) {
        return app;
      }
    } catch {
      // Invalid JSON, skip
      continue;
    }
  }

  return null;
}

/**
 * Map event type string to EventType
 */
function toEventType(eventType: string): EventType {
  const validEvents: EventType[] = [
    'initial_purchase', 'renewal', 'cancellation', 'expiration', 'refund',
    'billing_issue', 'billing_recovery', 'grace_period_started', 'grace_period_expired',
    'trial_started', 'trial_converted', 'trial_ending', 'product_change',
    'reactivation', 'revocation', 'offer_redeemed', 'price_increase',
    'renewal_extended', 'paused', 'pause_scheduled', 'pending_cancelled',
    'subscription_updated', 'dispute_created', 'dispute_closed', 'unknown'
  ];

  return validEvents.includes(eventType as EventType)
    ? (eventType as EventType)
    : 'unknown';
}

/**
 * POST /v1/notifications/apple
 * Handle Apple S2S Notifications V2
 */
appleNotificationsRouter.post('/', async (c) => {
  try {
    const body = await c.req.json<{ signedPayload: string }>();

    if (!body.signedPayload) {
      return c.json({ error: 'signedPayload is required' }, 400);
    }

    // Parse and VERIFY notification (cryptographic signature verification)
    const notification = await parseAppleNotificationSecure(body.signedPayload);

    // Double-check verification flag
    if (!notification.verified) {
      console.error('Apple notification signature verification failed');
      return c.json({ error: 'Signature verification failed' }, 401);
    }

    // Skip test notifications
    if (notification.notificationType === 'TEST') {
      console.log('Received Apple test notification');
      return c.json({ received: true });
    }

    if (!notification.transaction) {
      console.log('Notification has no transaction info:', notification.notificationType);
      return c.json({ received: true });
    }

    // Find app by bundle ID (safe parsing)
    const app = await findAppByBundleId(c.env.DB, notification.bundleId);

    if (!app) {
      console.error('App not found for bundle ID:', notification.bundleId);
      return c.json({ received: true });
    }

    // Idempotency check - skip if already processed
    const alreadyProcessed = await isNotificationProcessed(
      c.env.DB,
      app.id,
      'ios',
      notification.notificationUUID
    );

    if (alreadyProcessed) {
      console.log('Apple notification already processed:', notification.notificationUUID);
      return c.json({ received: true, duplicate: true });
    }

    // Find subscription
    const subscription = await getSubscriptionByOriginalTransactionId(
      c.env.DB,
      app.id,
      notification.transaction.originalTransactionId
    );

    if (!subscription) {
      console.log(
        'Subscription not found for originalTransactionId:',
        notification.transaction.originalTransactionId
      );
      return c.json({ received: true });
    }

    // Update subscription status
    const status = getSubscriptionStatusFromNotification(notification);
    const eventTypeStr = mapNotificationToEventType(notification);
    const eventType = toEventType(eventTypeStr);

    await updateSubscription(c.env.DB, subscription.id, {
      status,
      expiresAt: notification.transaction.expiresDate || null,
      willRenew: notification.renewalInfo?.autoRenewStatus === 1,
      gracePeriodExpiresAt: notification.renewalInfo?.gracePeriodExpiresDate || null,
      isSandbox: notification.environment === 'Sandbox',
    });

    // Log transaction
    await createTransaction(c.env.DB, {
      subscriptionId: subscription.id,
      appId: app.id,
      transactionId: notification.transaction.transactionId,
      originalTransactionId: notification.transaction.originalTransactionId,
      productId: notification.transaction.productId,
      platform: 'ios',
      type: mapEventToTransactionType(eventTypeStr),
      purchaseDate: notification.transaction.purchaseDate,
      expiresDate: notification.transaction.expiresDate,
      revenueAmount: notification.transaction.price,
      revenueCurrency: notification.transaction.currency,
      rawData: body.signedPayload,
    });

    // Log analytics event
    await createAnalyticsEvent(c.env.DB, {
      appId: app.id,
      subscriberId: subscription.subscriber_id,
      eventType,
      eventDate: notification.signedDate,
      productId: notification.transaction.productId,
      platform: 'ios',
      revenueAmount: eventType === 'refund'
        ? -(notification.transaction.price || 0)
        : notification.transaction.price,
      revenueCurrency: notification.transaction.currency,
    });

    // Mark original transaction as refunded
    if (eventType === 'refund') {
      await markTransactionRefunded(
        c.env.DB,
        notification.transaction.originalTransactionId,
        notification.signedDate
      );
    }

    // Get subscriber info for webhook
    const subscriber = await getSubscriberById(c.env.DB, subscription.subscriber_id);

    if (subscriber) {
      // Clear subscriber cache
      try {
        await c.env.CACHE.delete(`subscriber:${app.id}:${subscriber.app_user_id}`);
      } catch (e) {
        console.error('Cache clear failed:', e);
      }

      // Dispatch customer webhooks
      if (shouldTriggerWebhook(notification)) {
        try {
          // Calculate current entitlements
          const { entitlements } = await calculateEntitlements(
            c.env.DB,
            subscriber.id,
            app.id
          );

          const webhookPayload = createWebhookPayload(eventType, {
            appUserId: subscriber.app_user_id,
            subscriberId: subscriber.id,
            subscription: {
              id: subscription.id,
              productId: subscription.product_id,
              platform: 'ios',
              status,
              expiresAt: notification.transaction.expiresDate || null,
            },
            transaction: notification.transaction.price
              ? {
                  id: notification.transaction.transactionId,
                  amount: notification.transaction.price,
                  currency: notification.transaction.currency || 'USD',
                }
              : undefined,
            entitlements: Object.fromEntries(
              Object.entries(entitlements).map(([k, v]) => [k, v.is_active])
            ),
          });

          await dispatchWebhook(c.env.DB, app.id, webhookPayload);
        } catch (e) {
          console.error('Webhook dispatch failed:', e);
          // Don't fail the notification processing
        }
      }
    }

    // Mark notification as processed (idempotency)
    await markNotificationProcessed(
      c.env.DB,
      app.id,
      'ios',
      notification.notificationUUID,
      notification.notificationType
    );

    console.log(
      `Processed Apple notification: ${notification.notificationType}`,
      { subscriptionId: subscription.id, status, eventType }
    );

    return c.json({ received: true });
  } catch (error) {
    console.error('Error processing Apple notification:', error);
    // Always return 200 to prevent Apple from retrying
    return c.json({ received: true, error: 'Processing failed' });
  }
});

/**
 * Map event type to transaction type
 */
function mapEventToTransactionType(
  eventType: string
): 'initial_purchase' | 'renewal' | 'refund' | 'upgrade' | 'downgrade' {
  switch (eventType) {
    case 'initial_purchase':
      return 'initial_purchase';
    case 'renewal':
    case 'billing_recovery':
      return 'renewal';
    case 'refund':
    case 'revocation':
      return 'refund';
    case 'product_change':
      return 'upgrade';
    default:
      return 'renewal';
  }
}
