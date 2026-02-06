/**
 * Apple App Store Server Notifications V2 Handler
 */

import { verifyAppleSignedData, decodeAppleSignedData } from './jwt';
import type {
  NotificationV2Payload,
  JWSTransactionDecodedPayload,
  JWSRenewalInfoDecodedPayload,
  NotificationType,
  NotificationSubtype,
} from './types';

export interface ParsedNotification {
  notificationType: NotificationType;
  subtype?: NotificationSubtype;
  notificationUUID: string;
  signedDate: number;
  environment: 'Sandbox' | 'Production';
  bundleId: string;
  appAppleId?: number;
  transaction?: JWSTransactionDecodedPayload;
  renewalInfo?: JWSRenewalInfoDecodedPayload;
  status?: number;
  verified: boolean;
}

/**
 * Parse and VERIFY Apple App Store Server Notification V2
 * This performs cryptographic signature verification
 */
export async function parseAppleNotificationSecure(signedPayload: string): Promise<ParsedNotification> {
  // Verify and decode the outer JWS with signature verification
  const payload = await verifyAppleSignedData<NotificationV2Payload>(signedPayload);

  const result: ParsedNotification = {
    notificationType: payload.notificationType,
    subtype: payload.subtype,
    notificationUUID: payload.notificationUUID,
    signedDate: payload.signedDate,
    environment: payload.data?.environment || 'Production',
    bundleId: payload.data?.bundleId || '',
    appAppleId: payload.data?.appAppleId,
    status: payload.data?.status,
    verified: true,
  };

  // Verify and decode nested transaction info if present
  if (payload.data?.signedTransactionInfo) {
    result.transaction = await verifyAppleSignedData<JWSTransactionDecodedPayload>(
      payload.data.signedTransactionInfo
    );
  }

  // Verify and decode nested renewal info if present
  if (payload.data?.signedRenewalInfo) {
    result.renewalInfo = await verifyAppleSignedData<JWSRenewalInfoDecodedPayload>(
      payload.data.signedRenewalInfo
    );
  }

  return result;
}

/**
 * Parse Apple App Store Server Notification V2 (UNSAFE - no verification)
 * @deprecated Use parseAppleNotificationSecure() instead
 */
export function parseAppleNotification(signedPayload: string): ParsedNotification {
  console.warn('parseAppleNotification() is deprecated. Use parseAppleNotificationSecure() instead.');

  // Decode the outer JWS (no verification)
  const payload = decodeAppleSignedData<NotificationV2Payload>(signedPayload);

  const result: ParsedNotification = {
    notificationType: payload.notificationType,
    subtype: payload.subtype,
    notificationUUID: payload.notificationUUID,
    signedDate: payload.signedDate,
    environment: payload.data?.environment || 'Production',
    bundleId: payload.data?.bundleId || '',
    appAppleId: payload.data?.appAppleId,
    status: payload.data?.status,
    verified: false,
  };

  // Decode nested transaction info if present (no verification)
  if (payload.data?.signedTransactionInfo) {
    result.transaction = decodeAppleSignedData<JWSTransactionDecodedPayload>(
      payload.data.signedTransactionInfo
    );
  }

  // Decode nested renewal info if present (no verification)
  if (payload.data?.signedRenewalInfo) {
    result.renewalInfo = decodeAppleSignedData<JWSRenewalInfoDecodedPayload>(
      payload.data.signedRenewalInfo
    );
  }

  return result;
}

/**
 * Map Apple notification to internal event type
 */
export function mapNotificationToEventType(
  notification: ParsedNotification
): string {
  const { notificationType, subtype } = notification;

  switch (notificationType) {
    case 'SUBSCRIBED':
      return subtype === 'INITIAL_BUY' ? 'initial_purchase' : 'renewal';
    case 'DID_RENEW':
      return 'renewal';
    case 'EXPIRED':
      return 'expiration';
    case 'DID_FAIL_TO_RENEW':
      return 'billing_issue';
    case 'GRACE_PERIOD_EXPIRED':
      return 'grace_period_expired';
    case 'DID_CHANGE_RENEWAL_STATUS':
      return subtype === 'AUTO_RENEW_DISABLED' ? 'cancellation' : 'reactivation';
    case 'DID_CHANGE_RENEWAL_PREF':
      return 'product_change';
    case 'REFUND':
      return 'refund';
    case 'REVOKE':
      return 'revocation';
    case 'OFFER_REDEEMED':
      return 'offer_redeemed';
    case 'PRICE_INCREASE':
      return 'price_increase';
    case 'RENEWAL_EXTENDED':
    case 'RENEWAL_EXTENSION':
      return 'renewal_extended';
    default:
      return 'unknown';
  }
}

/**
 * Determine if notification indicates active subscription
 */
export function isActiveSubscription(notification: ParsedNotification): boolean {
  const { notificationType, status } = notification;

  // Check status directly if available
  if (status === 1) return true;
  if (status && status !== 1) return false;

  // Infer from notification type
  switch (notificationType) {
    case 'SUBSCRIBED':
    case 'DID_RENEW':
    case 'OFFER_REDEEMED':
    case 'RENEWAL_EXTENDED':
    case 'RENEWAL_EXTENSION':
      return true;

    case 'EXPIRED':
    case 'GRACE_PERIOD_EXPIRED':
    case 'REFUND':
    case 'REVOKE':
      return false;

    case 'DID_CHANGE_RENEWAL_STATUS':
      // Still active until expiry, auto-renew status just changed
      return true;

    case 'DID_FAIL_TO_RENEW':
      // In billing retry or grace period, consider still active
      return true;

    default:
      return true;
  }
}

/**
 * Extract subscription status from notification
 */
export function getSubscriptionStatusFromNotification(
  notification: ParsedNotification
): 'active' | 'expired' | 'cancelled' | 'grace_period' | 'billing_retry' {
  const { notificationType, subtype, status, renewalInfo } = notification;

  // Use status if available
  if (status) {
    switch (status) {
      case 1:
        return 'active';
      case 2:
        return 'expired';
      case 3:
        return 'billing_retry';
      case 4:
        return 'grace_period';
      case 5:
        return 'cancelled';
    }
  }

  // Check renewal info for billing retry
  if (renewalInfo?.isInBillingRetryPeriod) {
    return 'billing_retry';
  }

  // Check for grace period
  if (renewalInfo?.gracePeriodExpiresDate) {
    const now = Date.now();
    if (renewalInfo.gracePeriodExpiresDate > now) {
      return 'grace_period';
    }
  }

  // Infer from notification type
  switch (notificationType) {
    case 'EXPIRED':
    case 'GRACE_PERIOD_EXPIRED':
      return 'expired';

    case 'REFUND':
    case 'REVOKE':
      return 'cancelled';

    case 'DID_FAIL_TO_RENEW':
      if (subtype === 'GRACE_PERIOD') {
        return 'grace_period';
      }
      return 'billing_retry';

    default:
      return 'active';
  }
}

/**
 * Check if notification should trigger webhook
 */
export function shouldTriggerWebhook(notification: ParsedNotification): boolean {
  // Skip test notifications
  if (notification.notificationType === 'TEST') {
    return false;
  }

  // Skip consumption requests (internal)
  if (notification.notificationType === 'CONSUMPTION_REQUEST') {
    return false;
  }

  return true;
}
