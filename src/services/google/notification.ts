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
  verified: boolean;
}

// Cache for Google's public keys (JWKs)
let googleKeysCache: {
  keys: Map<string, CryptoKey>;
  expiresAt: number;
} | null = null;

/**
 * Parse Google RTDN (comes as base64 encoded in Pub/Sub message)
 * @deprecated Use verifyGooglePubSubMessage() for secure verification
 */
export function parseGoogleNotification(
  base64Data: string
): ParsedGoogleNotification {
  console.warn('parseGoogleNotification() is deprecated. Use verifyGooglePubSubMessage() instead.');

  // Decode base64
  const jsonString = atob(base64Data);
  const notification = JSON.parse(jsonString) as GoogleRTDN;

  const result: ParsedGoogleNotification = {
    packageName: notification.packageName,
    eventTimeMillis: parseInt(notification.eventTimeMillis, 10),
    type: 'test',
    verified: false, // Not verified
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
 * Validate Google Pub/Sub push message (basic)
 * @deprecated Use verifyGooglePubSubMessage() for secure verification
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

/**
 * Fetch Google's public keys for JWT verification
 */
async function fetchGooglePublicKeys(): Promise<Map<string, CryptoKey>> {
  const now = Date.now();

  // Return cached keys if valid
  if (googleKeysCache && googleKeysCache.expiresAt > now) {
    return googleKeysCache.keys;
  }

  // Fetch Google's JWK set
  const response = await fetch('https://www.googleapis.com/oauth2/v3/certs');
  const jwkSet = await response.json() as {
    keys: Array<{
      kid: string;
      kty: string;
      alg: string;
      use: string;
      n: string;
      e: string;
    }>;
  };

  const keys = new Map<string, CryptoKey>();

  for (const jwk of jwkSet.keys) {
    try {
      const key = await crypto.subtle.importKey(
        'jwk',
        jwk,
        { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
        true,
        ['verify']
      );
      keys.set(jwk.kid, key);
    } catch (e) {
      console.warn(`Failed to import key ${jwk.kid}:`, e);
    }
  }

  // Cache for 1 hour (Google rotates keys, but caching is safe)
  googleKeysCache = {
    keys,
    expiresAt: now + 3600 * 1000,
  };

  return keys;
}

/**
 * Decode base64url string
 */
function decodeBase64Url(input: string): string {
  let base64 = input.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4) {
    base64 += '=';
  }
  return atob(base64);
}

/**
 * Verify Google Pub/Sub JWT token
 * Returns decoded claims if valid, throws if invalid
 */
export async function verifyGooglePubSubToken(
  authorizationHeader: string,
  expectedAudience: string
): Promise<{
  email: string;
  email_verified: boolean;
  aud: string;
  iss: string;
  exp: number;
  iat: number;
}> {
  // Extract token from "Bearer <token>"
  if (!authorizationHeader.startsWith('Bearer ')) {
    throw new Error('Invalid authorization header format');
  }

  const token = authorizationHeader.slice(7);
  const parts = token.split('.');

  if (parts.length !== 3) {
    throw new Error('Invalid JWT format');
  }

  const [headerB64, payloadB64, signatureB64] = parts;

  // Decode header to get key ID
  const header = JSON.parse(decodeBase64Url(headerB64)) as {
    alg: string;
    kid: string;
    typ: string;
  };

  if (header.alg !== 'RS256') {
    throw new Error(`Unsupported algorithm: ${header.alg}`);
  }

  // Fetch Google's public keys
  const keys = await fetchGooglePublicKeys();
  const key = keys.get(header.kid);

  if (!key) {
    // Key not found, try refreshing cache
    googleKeysCache = null;
    const freshKeys = await fetchGooglePublicKeys();
    const freshKey = freshKeys.get(header.kid);

    if (!freshKey) {
      throw new Error(`Unknown key ID: ${header.kid}`);
    }
  }

  const publicKey = keys.get(header.kid)!;

  // Verify signature
  const signedContent = new TextEncoder().encode(`${headerB64}.${payloadB64}`);
  const signature = Uint8Array.from(decodeBase64Url(signatureB64), c => c.charCodeAt(0));

  const isValid = await crypto.subtle.verify(
    { name: 'RSASSA-PKCS1-v1_5' },
    publicKey,
    signature,
    signedContent
  );

  if (!isValid) {
    throw new Error('Invalid signature');
  }

  // Decode and validate claims
  const payload = JSON.parse(decodeBase64Url(payloadB64)) as {
    email: string;
    email_verified: boolean;
    aud: string;
    iss: string;
    exp: number;
    iat: number;
  };

  // Verify issuer
  if (payload.iss !== 'https://accounts.google.com' &&
      payload.iss !== 'accounts.google.com') {
    throw new Error(`Invalid issuer: ${payload.iss}`);
  }

  // Verify audience
  if (payload.aud !== expectedAudience) {
    throw new Error(`Invalid audience: ${payload.aud}, expected: ${expectedAudience}`);
  }

  // Verify expiration
  const now = Math.floor(Date.now() / 1000);
  if (payload.exp < now) {
    throw new Error('Token expired');
  }

  // Verify email is from Google Pub/Sub service account
  if (!payload.email.match(/^[\w-]+@[\w-]+\.iam\.gserviceaccount\.com$/)) {
    throw new Error(`Invalid service account email: ${payload.email}`);
  }

  return payload;
}

/**
 * Verify and parse Google Pub/Sub message with full JWT verification
 */
export async function verifyGooglePubSubMessage(
  authorizationHeader: string | null,
  expectedAudience: string,
  message: {
    data: string;
    messageId: string;
    publishTime: string;
  }
): Promise<ParsedGoogleNotification> {
  // If authorization header is present, verify JWT
  if (authorizationHeader) {
    await verifyGooglePubSubToken(authorizationHeader, expectedAudience);
  } else {
    // No authorization header - this might be from a push subscription without auth
    // Log warning but allow (some setups don't use auth)
    console.warn('Google Pub/Sub message received without authorization header');
  }

  // Validate message structure
  if (!message.data || !message.messageId) {
    throw new Error('Invalid Pub/Sub message structure');
  }

  // Decode and parse the notification
  const jsonString = atob(message.data);
  const notification = JSON.parse(jsonString) as GoogleRTDN;

  const result: ParsedGoogleNotification = {
    packageName: notification.packageName,
    eventTimeMillis: parseInt(notification.eventTimeMillis, 10),
    type: 'test',
    verified: !!authorizationHeader,
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
