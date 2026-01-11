/**
 * Google Real-time Developer Notifications (RTDN) Handler
 */

import type {
  GoogleRTDN,
  SubscriptionNotificationType,
} from './types';

export interface ParsedGoogleNotification {
  packageName: string;
  eventTimeMillis: number;
  type: 'subscription' | 'one_time' | 'voided' | 'test';
  subscriptionId?: string;
  purchaseToken?: string;
  notificationType?: SubscriptionNotificationType;
  sku?: string;
  orderId?: string;
}

/**
 * Parse Google RTDN (comes as base64 encoded in Pub/Sub message)
 */
export function parseGoogleNotification(
  base64Data: string
): ParsedGoogleNotification {
  // Decode base64
  const jsonString = atob(base64Data);
  const notification = JSON.parse(jsonString) as GoogleRTDN;

  const result: ParsedGoogleNotification = {
    packageName: notification.packageName,
    eventTimeMillis: parseInt(notification.eventTimeMillis, 10),
    type: 'test',
  };

  if (notification.subscriptionNotification) {
    result.type = 'subscription';
    result.subscriptionId = notification.subscriptionNotification.subscriptionId;
    result.purchaseToken = notification.subscriptionNotification.purchaseToken;
    result.notificationType = notification.subscriptionNotification.notificationType;
  } else if (notification.oneTimeProductNotification) {
    result.type = 'one_time';
    result.sku = notification.oneTimeProductNotification.sku;
    result.purchaseToken = notification.oneTimeProductNotification.purchaseToken;
  } else if (notification.voidedPurchaseNotification) {
    result.type = 'voided';
    result.purchaseToken = notification.voidedPurchaseNotification.purchaseToken;
    result.orderId = notification.voidedPurchaseNotification.orderId;
  } else if (notification.testNotification) {
    result.type = 'test';
  }

  return result;
}

/**
 * Map Google notification type to internal event type
 */
export function mapGoogleNotificationToEventType(
  notificationType: SubscriptionNotificationType
): string {
  switch (notificationType) {
    case 1: // SUBSCRIPTION_RECOVERED
      return 'billing_recovery';
    case 2: // SUBSCRIPTION_RENEWED
      return 'renewal';
    case 3: // SUBSCRIPTION_CANCELED
      return 'cancellation';
    case 4: // SUBSCRIPTION_PURCHASED
      return 'initial_purchase';
    case 5: // SUBSCRIPTION_ON_HOLD
      return 'billing_issue';
    case 6: // SUBSCRIPTION_IN_GRACE_PERIOD
      return 'grace_period_started';
    case 7: // SUBSCRIPTION_RESTARTED
      return 'reactivation';
    case 8: // SUBSCRIPTION_PRICE_CHANGE_CONFIRMED
      return 'price_increase';
    case 9: // SUBSCRIPTION_DEFERRED
      return 'renewal_extended';
    case 10: // SUBSCRIPTION_PAUSED
      return 'paused';
    case 11: // SUBSCRIPTION_PAUSE_SCHEDULE_CHANGED
      return 'pause_scheduled';
    case 12: // SUBSCRIPTION_REVOKED
      return 'refund';
    case 13: // SUBSCRIPTION_EXPIRED
      return 'expiration';
    case 20: // SUBSCRIPTION_PENDING_PURCHASE_CANCELED
      return 'pending_cancelled';
    default:
      return 'unknown';
  }
}

/**
 * Determine if notification indicates active subscription
 */
export function isActiveGoogleSubscription(
  notificationType: SubscriptionNotificationType
): boolean {
  switch (notificationType) {
    case 1: // SUBSCRIPTION_RECOVERED
    case 2: // SUBSCRIPTION_RENEWED
    case 4: // SUBSCRIPTION_PURCHASED
    case 7: // SUBSCRIPTION_RESTARTED
    case 8: // SUBSCRIPTION_PRICE_CHANGE_CONFIRMED
    case 9: // SUBSCRIPTION_DEFERRED
      return true;

    case 3: // SUBSCRIPTION_CANCELED
      // Still active until expiry, but won't renew
      return true;

    case 5: // SUBSCRIPTION_ON_HOLD
    case 6: // SUBSCRIPTION_IN_GRACE_PERIOD
      // Still considered active (grace/retry)
      return true;

    case 10: // SUBSCRIPTION_PAUSED
      return false;

    case 12: // SUBSCRIPTION_REVOKED
    case 13: // SUBSCRIPTION_EXPIRED
    case 20: // SUBSCRIPTION_PENDING_PURCHASE_CANCELED
      return false;

    default:
      return true;
  }
}

/**
 * Get subscription status from notification type
 */
export function getGoogleSubscriptionStatus(
  notificationType: SubscriptionNotificationType
): 'active' | 'expired' | 'cancelled' | 'grace_period' | 'paused' | 'billing_retry' {
  switch (notificationType) {
    case 1: // SUBSCRIPTION_RECOVERED
    case 2: // SUBSCRIPTION_RENEWED
    case 4: // SUBSCRIPTION_PURCHASED
    case 7: // SUBSCRIPTION_RESTARTED
    case 8: // SUBSCRIPTION_PRICE_CHANGE_CONFIRMED
    case 9: // SUBSCRIPTION_DEFERRED
      return 'active';

    case 3: // SUBSCRIPTION_CANCELED
      return 'cancelled';

    case 5: // SUBSCRIPTION_ON_HOLD
      return 'billing_retry';

    case 6: // SUBSCRIPTION_IN_GRACE_PERIOD
      return 'grace_period';

    case 10: // SUBSCRIPTION_PAUSED
      return 'paused';

    case 12: // SUBSCRIPTION_REVOKED
    case 13: // SUBSCRIPTION_EXPIRED
    case 20: // SUBSCRIPTION_PENDING_PURCHASE_CANCELED
      return 'expired';

    default:
      return 'active';
  }
}

/**
 * Check if notification should trigger webhook
 */
export function shouldTriggerGoogleWebhook(
  notification: ParsedGoogleNotification
): boolean {
  // Skip test notifications
  if (notification.type === 'test') {
    return false;
  }

  return true;
}

/**
 * Validate Google Pub/Sub push message
 * (Basic validation - full OAuth verification would require more setup)
 */
export function validateGooglePubSubMessage(
  message: {
    data: string;
    messageId: string;
    publishTime: string;
  }
): boolean {
  // Basic validation
  if (!message.data || !message.messageId) {
    return false;
  }

  // Check if data is valid base64
  try {
    atob(message.data);
    return true;
  } catch {
    return false;
  }
}
