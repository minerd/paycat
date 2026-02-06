/**
 * Google Play Real-time Developer Notifications (RTDN) Handler
 * POST /v1/notifications/google
 */

import { Hono } from 'hono';
import type { Env, EventType, GoogleConfig } from '../../types';
import {
  verifyGooglePubSubMessage,
  mapGoogleNotificationToEventType,
  getGoogleSubscriptionStatus,
  shouldTriggerGoogleWebhook,
} from '../../services/google/notification';
import { createGoogleClient } from '../../services/google/client';
import { mapGoogleSubscriptionState } from '../../services/google/types';
import {
  getSubscriptionByPurchaseToken,
  updateSubscription,
  createTransaction,
  createAnalyticsEvent,
  getSubscriberById,
  getOrCreateSubscriber,
  createSubscription,
  isNotificationProcessed,
  markNotificationProcessed,
} from '../../db/queries';
import { dispatchWebhook, createWebhookPayload } from '../../services/webhook-dispatcher';
import { calculateEntitlements } from '../../services/entitlement';

export const googleNotificationsRouter = new Hono<{ Bindings: Env }>();

/**
 * Find app by Google package name (safe JSON parsing)
 */
async function findAppByPackageName(
  db: D1Database,
  packageName: string
): Promise<{ id: string; google_config: string } | null> {
  const result = await db
    .prepare('SELECT id, google_config FROM apps WHERE google_config IS NOT NULL')
    .all<{ id: string; google_config: string }>();

  for (const app of result.results || []) {
    try {
      const config = JSON.parse(app.google_config) as GoogleConfig;
      if (config.packageName === packageName) {
        return app;
      }
    } catch {
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
 * POST /v1/notifications/google
 * Handle Google Play RTDN via Pub/Sub push
 */
googleNotificationsRouter.post('/', async (c) => {
  try {
    const body = await c.req.json<{
      message: {
        data: string;
        messageId: string;
        publishTime: string;
      };
      subscription: string;
    }>();

    if (!body.message?.data) {
      return c.json({ error: 'Invalid Pub/Sub message' }, 400);
    }

    // Get authorization header for JWT verification
    const authHeader = c.req.header('Authorization') || null;

    // Get the expected audience (our webhook URL)
    const expectedAudience = new URL(c.req.url).origin + '/v1/notifications/google';

    // Verify and parse notification with JWT verification
    const notification = await verifyGooglePubSubMessage(
      authHeader,
      expectedAudience,
      body.message
    );

    // Log verification status
    if (!notification.verified) {
      console.warn('Google notification received without JWT verification');
    }

    // Skip test notifications
    if (notification.type === 'test') {
      console.log('Received Google test notification');
      return c.json({ received: true });
    }

    // Skip non-subscription notifications for now
    if (notification.type !== 'subscription') {
      console.log('Received non-subscription notification:', notification.type);
      return c.json({ received: true });
    }

    if (!notification.purchaseToken) {
      console.log('Notification has no purchase token');
      return c.json({ received: true });
    }

    // Find app by package name (safe parsing)
    const app = await findAppByPackageName(c.env.DB, notification.packageName);

    if (!app) {
      console.error('App not found for package:', notification.packageName);
      return c.json({ received: true });
    }

    // Idempotency check - use Pub/Sub messageId
    const messageId = body.message.messageId;
    const alreadyProcessed = await isNotificationProcessed(
      c.env.DB,
      app.id,
      'android',
      messageId
    );

    if (alreadyProcessed) {
      console.log('Google notification already processed:', messageId);
      return c.json({ received: true, duplicate: true });
    }

    // Find subscription
    let subscription = await getSubscriptionByPurchaseToken(
      c.env.DB,
      app.id,
      notification.purchaseToken
    );

    // Get subscription details from Google
    let googleSubscription;
    if (app.google_config) {
      try {
        const client = createGoogleClient(app.google_config);
        googleSubscription = await client.getSubscriptionV2(notification.purchaseToken);
      } catch (e) {
        console.error('Failed to fetch subscription from Google:', e);
      }
    }

    // If subscription not found, create it (new purchase)
    if (!subscription && googleSubscription) {
      const lineItem = googleSubscription.lineItems[0];
      if (lineItem) {
        // Get or create subscriber (using purchase token as temporary ID)
        const externalId = googleSubscription.externalAccountIdentifiers?.externalAccountId;
        const appUserId = externalId || `google_${notification.purchaseToken.slice(0, 32)}`;

        const subscriber = await getOrCreateSubscriber(c.env.DB, app.id, appUserId);

        const status = mapGoogleSubscriptionState(googleSubscription.subscriptionState);
        const purchaseDate = new Date(googleSubscription.startTime).getTime();
        const expiresAt = new Date(lineItem.expiryTime).getTime();

        subscription = await createSubscription(c.env.DB, {
          subscriberId: subscriber.id,
          appId: app.id,
          platform: 'android',
          productId: lineItem.productId,
          purchaseToken: notification.purchaseToken,
          status,
          purchaseDate,
          expiresAt,
          isTrial: false,
          isSandbox: !!googleSubscription.testPurchase,
          willRenew: lineItem.autoRenewingPlan?.autoRenewEnabled ?? false,
        });

        console.log('Created new subscription from Google notification:', subscription.id);
      }
    }

    if (!subscription) {
      console.log('Could not find or create subscription');
      return c.json({ received: true });
    }

    // Update subscription status
    let status = notification.notificationType
      ? getGoogleSubscriptionStatus(notification.notificationType)
      : subscription.status;
    let expiresAt = subscription.expires_at;
    let willRenew = subscription.will_renew;

    if (googleSubscription && googleSubscription.lineItems[0]) {
      status = mapGoogleSubscriptionState(googleSubscription.subscriptionState);
      expiresAt = new Date(googleSubscription.lineItems[0].expiryTime).getTime();
      willRenew = googleSubscription.lineItems[0].autoRenewingPlan?.autoRenewEnabled ?? false;
    }

    const eventTypeStr = notification.notificationType
      ? mapGoogleNotificationToEventType(notification.notificationType)
      : 'unknown';
    const eventType = toEventType(eventTypeStr);

    const isSandbox = googleSubscription?.testPurchase ? true : subscription.is_sandbox;

    await updateSubscription(c.env.DB, subscription.id, {
      status,
      expiresAt,
      willRenew,
      isSandbox: !!isSandbox,
    });

    // Log transaction
    await createTransaction(c.env.DB, {
      subscriptionId: subscription.id,
      appId: app.id,
      transactionId: `google_${messageId}_${notification.eventTimeMillis}`,
      productId: notification.subscriptionId || subscription.product_id,
      platform: 'android',
      type: mapEventToTransactionType(eventTypeStr),
      purchaseDate: notification.eventTimeMillis,
      expiresDate: expiresAt || undefined,
      rawData: body.message.data,
    });

    // Log analytics event
    await createAnalyticsEvent(c.env.DB, {
      appId: app.id,
      subscriberId: subscription.subscriber_id,
      eventType,
      eventDate: notification.eventTimeMillis,
      productId: notification.subscriptionId || subscription.product_id,
      platform: 'android',
    });

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
      if (shouldTriggerGoogleWebhook(notification)) {
        try {
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
              platform: 'android',
              status,
              expiresAt,
            },
            entitlements: Object.fromEntries(
              Object.entries(entitlements).map(([k, v]) => [k, v.is_active])
            ),
          });

          await dispatchWebhook(c.env.DB, app.id, webhookPayload);
        } catch (e) {
          console.error('Webhook dispatch failed:', e);
        }
      }
    }

    // Mark notification as processed (idempotency)
    await markNotificationProcessed(
      c.env.DB,
      app.id,
      'android',
      messageId,
      notification.notificationType?.toString()
    );

    console.log(
      `Processed Google notification: type=${notification.notificationType}`,
      { subscriptionId: subscription.id, status, eventType }
    );

    return c.json({ received: true });
  } catch (error) {
    console.error('Error processing Google notification:', error);
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
      return 'refund';
    default:
      return 'renewal';
  }
}
