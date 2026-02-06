/**
 * Stripe Webhook Handler
 * POST /v1/notifications/stripe
 */

import { Hono } from 'hono';
import type { Env, EventType, StripeConfig } from '../../types';
import {
  verifyStripeWebhook,
  extractSubscriptionFromEvent,
  shouldUpdateSubscription,
  mapStripeWebhookToEventType,
  shouldTriggerStripeWebhook,
} from '../../services/stripe/webhook';
import { mapStripeSubscriptionStatus } from '../../services/stripe/types';
import {
  getSubscriptionByStripeId,
  updateSubscription,
  createTransaction,
  createAnalyticsEvent,
  getSubscriberById,
} from '../../db/queries';
import { dispatchWebhook, createWebhookPayload } from '../../services/webhook-dispatcher';
import { calculateEntitlements } from '../../services/entitlement';

export const stripeNotificationsRouter = new Hono<{ Bindings: Env }>();

/**
 * Find app by Stripe webhook secret (safe JSON parsing)
 */
async function findAppByWebhookSecret(
  db: D1Database,
  payload: string,
  signature: string
): Promise<{ id: string; stripe_config: string } | null> {
  const result = await db
    .prepare('SELECT id, stripe_config FROM apps WHERE stripe_config IS NOT NULL')
    .all<{ id: string; stripe_config: string }>();

  for (const app of result.results || []) {
    try {
      const config = JSON.parse(app.stripe_config) as StripeConfig;
      // Try to verify with this app's secret
      await verifyStripeWebhook(payload, signature, config.webhookSecret);
      return app;
    } catch {
      // Verification failed, try next app
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
 * POST /v1/notifications/stripe
 * Handle Stripe webhooks
 */
stripeNotificationsRouter.post('/', async (c) => {
  try {
    const signature = c.req.header('Stripe-Signature');

    if (!signature) {
      return c.json({ error: 'Missing Stripe-Signature header' }, 400);
    }

    const payload = await c.req.text();

    // Find app by matching webhook signature
    const matchedApp = await findAppByWebhookSecret(c.env.DB, payload, signature);

    if (!matchedApp) {
      console.error('No matching app found for Stripe webhook');
      return c.json({ error: 'Invalid signature' }, 400);
    }

    // Parse and verify event
    const config = JSON.parse(matchedApp.stripe_config) as StripeConfig;
    const event = await verifyStripeWebhook(payload, signature, config.webhookSecret);

    const eventTypeStr = mapStripeWebhookToEventType(event.type);
    const eventType = toEventType(eventTypeStr);

    // Handle subscription events
    if (shouldUpdateSubscription(event.type)) {
      const stripeSubscription = extractSubscriptionFromEvent(event);

      if (stripeSubscription) {
        // Find our subscription
        const subscription = await getSubscriptionByStripeId(
          c.env.DB,
          matchedApp.id,
          stripeSubscription.id
        );

        if (subscription) {
          // Update subscription status
          const status = mapStripeSubscriptionStatus(stripeSubscription.status);

          await updateSubscription(c.env.DB, subscription.id, {
            status,
            expiresAt: stripeSubscription.current_period_end * 1000,
            willRenew: !stripeSubscription.cancel_at_period_end,
            cancelledAt: stripeSubscription.canceled_at
              ? stripeSubscription.canceled_at * 1000
              : null,
          });

          // Log transaction
          const item = stripeSubscription.items.data[0];
          await createTransaction(c.env.DB, {
            subscriptionId: subscription.id,
            appId: matchedApp.id,
            transactionId: event.id,
            productId: item
              ? typeof item.price.product === 'string'
                ? item.price.product
                : item.price.id
              : subscription.product_id,
            platform: 'stripe',
            type: mapEventToTransactionType(eventTypeStr),
            purchaseDate: event.created * 1000,
            expiresDate: stripeSubscription.current_period_end * 1000,
            revenueAmount: item?.price.unit_amount || undefined,
            revenueCurrency: item?.price.currency,
            rawData: payload,
          });

          // Log analytics event
          await createAnalyticsEvent(c.env.DB, {
            appId: matchedApp.id,
            subscriberId: subscription.subscriber_id,
            eventType,
            eventDate: event.created * 1000,
            productId: item
              ? typeof item.price.product === 'string'
                ? item.price.product
                : item.price.id
              : subscription.product_id,
            platform: 'stripe',
            revenueAmount:
              eventType === 'refund'
                ? -(item?.price.unit_amount || 0)
                : item?.price.unit_amount ?? undefined,
            revenueCurrency: item?.price.currency,
          });

          // Get subscriber info for webhook
          const subscriber = await getSubscriberById(c.env.DB, subscription.subscriber_id);

          if (subscriber) {
            // Clear subscriber cache
            try {
              await c.env.CACHE.delete(
                `subscriber:${matchedApp.id}:${subscriber.app_user_id}`
              );
            } catch (e) {
              console.error('Cache clear failed:', e);
            }

            // Dispatch customer webhooks
            if (shouldTriggerStripeWebhook(event.type)) {
              try {
                const { entitlements } = await calculateEntitlements(
                  c.env.DB,
                  subscriber.id,
                  matchedApp.id
                );

                const webhookPayload = createWebhookPayload(eventType, {
                  appUserId: subscriber.app_user_id,
                  subscriberId: subscriber.id,
                  subscription: {
                    id: subscription.id,
                    productId: subscription.product_id,
                    platform: 'stripe',
                    status,
                    expiresAt: stripeSubscription.current_period_end * 1000,
                  },
                  transaction: item?.price.unit_amount
                    ? {
                        id: event.id,
                        amount: item.price.unit_amount,
                        currency: item.price.currency,
                      }
                    : undefined,
                  entitlements: Object.fromEntries(
                    Object.entries(entitlements).map(([k, v]) => [k, v.is_active])
                  ),
                });

                await dispatchWebhook(c.env.DB, matchedApp.id, webhookPayload);
              } catch (e) {
                console.error('Webhook dispatch failed:', e);
              }
            }
          }

          console.log(`Processed Stripe event: ${event.type}`, {
            subscriptionId: subscription.id,
            status,
            eventType,
          });
        } else {
          console.log(
            'Subscription not found for Stripe ID:',
            stripeSubscription.id
          );
        }
      }
    }

    // Handle invoice events
    if (event.type.startsWith('invoice.')) {
      const invoice = event.data.object as {
        subscription?: string;
        customer?: string;
        amount_paid?: number;
        currency?: string;
        status?: string;
      };

      if (invoice.subscription) {
        const subscription = await getSubscriptionByStripeId(
          c.env.DB,
          matchedApp.id,
          invoice.subscription
        );

        if (subscription) {
          // Log invoice event
          await createAnalyticsEvent(c.env.DB, {
            appId: matchedApp.id,
            subscriberId: subscription.subscriber_id,
            eventType,
            eventDate: event.created * 1000,
            productId: subscription.product_id,
            platform: 'stripe',
            revenueAmount: invoice.amount_paid,
            revenueCurrency: invoice.currency,
          });
        }
      }
    }

    // Handle charge refund events
    if (event.type === 'charge.refunded') {
      const charge = event.data.object as {
        id?: string;
        customer?: string;
        invoice?: string;
        amount_refunded?: number;
        currency?: string;
      };

      if (charge.invoice) {
        try {
          // Fetch invoice from Stripe to get the subscription ID
          const invoiceRes = await fetch(
            `https://api.stripe.com/v1/invoices/${charge.invoice}`,
            {
              headers: {
                'Authorization': `Bearer ${config.secretKey}`,
              },
            }
          );
          const invoice = await invoiceRes.json() as { subscription?: string };

          if (invoice.subscription) {
            const subscription = await getSubscriptionByStripeId(
              c.env.DB,
              matchedApp.id,
              invoice.subscription
            );

            if (subscription) {
              // Mark purchase transactions as refunded
              await c.env.DB
                .prepare(
                  "UPDATE transactions SET is_refunded = 1, refund_date = ? WHERE subscription_id = ? AND type != 'refund' AND is_refunded = 0"
                )
                .bind(event.created * 1000, subscription.id)
                .run();

              // Create refund transaction
              await createTransaction(c.env.DB, {
                subscriptionId: subscription.id,
                appId: matchedApp.id,
                transactionId: `refund_${event.id}`,
                productId: subscription.product_id,
                platform: 'stripe',
                type: 'refund',
                purchaseDate: event.created * 1000,
                revenueAmount: -(charge.amount_refunded || 0),
                revenueCurrency: charge.currency,
                rawData: payload,
              });

              // Log refund analytics event
              await createAnalyticsEvent(c.env.DB, {
                appId: matchedApp.id,
                subscriberId: subscription.subscriber_id,
                eventType: 'refund',
                eventDate: event.created * 1000,
                productId: subscription.product_id,
                platform: 'stripe',
                revenueAmount: -(charge.amount_refunded || 0),
                revenueCurrency: charge.currency,
              });

              // Clear subscriber cache
              const subscriber = await getSubscriberById(c.env.DB, subscription.subscriber_id);
              if (subscriber) {
                try {
                  await c.env.CACHE.delete(
                    `subscriber:${matchedApp.id}:${subscriber.app_user_id}`
                  );
                } catch (e) {
                  console.error('Cache clear failed:', e);
                }
              }

              console.log('Stripe refund processed:', {
                subscriptionId: subscription.id,
                amount: charge.amount_refunded,
                currency: charge.currency,
              });
            }
          }
        } catch (e) {
          console.error('Failed to process Stripe refund:', e);
        }
      }
    }

    return c.json({ received: true });
  } catch (error) {
    console.error('Error processing Stripe webhook:', error);
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
      return 'renewal';
    case 'refund':
      return 'refund';
    default:
      return 'renewal';
  }
}
