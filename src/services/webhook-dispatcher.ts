/**
 * Customer Webhook Dispatcher
 * Sends subscription events to customer-configured endpoints
 */

import { hmacSha256 } from '../utils/crypto';
import { generateId } from '../utils/id';
import { now, toISOString } from '../utils/time';
import {
  getWebhooksByAppId,
  createWebhookDelivery,
  updateWebhookDelivery,
} from '../db/queries';
import type { EventType, Platform } from '../types';

export interface WebhookPayload {
  id?: string;
  type: string; // EventType or custom event type
  created_at?: string;
  app_id?: string;
  subscriber_id?: string;
  subscription_id?: string;
  product_id?: string;
  platform?: string;
  environment?: string;
  timestamp?: string;
  data: Record<string, unknown>;
}

// Retry schedule (in milliseconds)
const RETRY_DELAYS = [
  0, // Immediate
  60 * 1000, // 1 minute
  5 * 60 * 1000, // 5 minutes
  30 * 60 * 1000, // 30 minutes
  60 * 60 * 1000, // 1 hour
  6 * 60 * 60 * 1000, // 6 hours
  24 * 60 * 60 * 1000, // 24 hours
];

const MAX_ATTEMPTS = RETRY_DELAYS.length;

/**
 * Dispatch webhook to all registered endpoints for an app
 */
export async function dispatchWebhook(
  db: D1Database,
  appId: string,
  payload: WebhookPayload
): Promise<void> {
  // Get all active webhooks for the app
  const webhooks = await getWebhooksByAppId(db, appId);

  if (webhooks.length === 0) {
    return;
  }

  // Filter webhooks by event type
  const matchingWebhooks = webhooks.filter((wh) => {
    let events: string[] = [];
    try {
      events = JSON.parse(wh.events) as string[];
    } catch {
      events = ['*']; // Default to all events on parse error
    }
    return events.includes('*') || events.includes(payload.type);
  });

  // Send to each webhook
  const deliveryPromises = matchingWebhooks.map((webhook) =>
    sendWebhook(db, webhook.id, webhook.url, webhook.secret, payload)
  );

  await Promise.allSettled(deliveryPromises);
}

/**
 * Send webhook to a single endpoint
 */
async function sendWebhook(
  db: D1Database,
  webhookId: string,
  url: string,
  secret: string,
  payload: WebhookPayload
): Promise<void> {
  const payloadString = JSON.stringify(payload);

  // Create delivery record
  const delivery = await createWebhookDelivery(
    db,
    webhookId,
    payload.type,
    payloadString
  );

  // Attempt to send
  await attemptDelivery(db, delivery.id, url, secret, payloadString, 1);
}

/**
 * Attempt webhook delivery with retry logic
 */
async function attemptDelivery(
  db: D1Database,
  deliveryId: string,
  url: string,
  secret: string,
  payload: string,
  attempt: number
): Promise<void> {
  const timestamp = Math.floor(Date.now() / 1000);

  // Generate signature
  const signaturePayload = `${timestamp}.${payload}`;
  const signature = await hmacSha256(secret, signaturePayload);

  // Set timeout (30 seconds max for webhook delivery)
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-PayCat-Signature': `t=${timestamp},v1=${signature}`,
        'X-PayCat-Delivery-ID': deliveryId,
        'User-Agent': 'PayCat-Webhook/1.0',
      },
      body: payload,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    const responseBody = await response.text().catch(() => '');

    if (response.ok) {
      // Success
      await updateWebhookDelivery(db, deliveryId, {
        responseStatus: response.status,
        responseBody: responseBody.slice(0, 1000), // Limit stored response
        attempts: attempt,
        deliveredAt: now(),
        nextRetryAt: null,
      });
    } else {
      // Failed - schedule retry if attempts remaining
      await handleFailedDelivery(
        db,
        deliveryId,
        response.status,
        responseBody,
        attempt
      );
    }
  } catch (error) {
    clearTimeout(timeoutId);

    // Network error or timeout - schedule retry
    let errorMessage = 'Unknown error';
    if (error instanceof Error) {
      errorMessage = error.name === 'AbortError'
        ? 'Request timeout (30 seconds exceeded)'
        : error.message;
    }
    await handleFailedDelivery(db, deliveryId, 0, errorMessage, attempt);
  }
}

/**
 * Handle failed webhook delivery
 */
async function handleFailedDelivery(
  db: D1Database,
  deliveryId: string,
  status: number,
  responseBody: string,
  attempt: number
): Promise<void> {
  const hasMoreAttempts = attempt < MAX_ATTEMPTS;

  if (hasMoreAttempts) {
    const nextRetryAt = now() + RETRY_DELAYS[attempt];
    await updateWebhookDelivery(db, deliveryId, {
      responseStatus: status,
      responseBody: responseBody.slice(0, 1000),
      attempts: attempt,
      nextRetryAt,
    });
  } else {
    // Max attempts reached
    await updateWebhookDelivery(db, deliveryId, {
      responseStatus: status,
      responseBody: responseBody.slice(0, 1000),
      attempts: attempt,
      nextRetryAt: null,
    });
  }
}

/**
 * Process pending webhook retries
 * Should be called by a scheduled worker
 */
export async function processWebhookRetries(db: D1Database): Promise<number> {
  const currentTime = now();

  // Get pending deliveries due for retry
  const pending = await db
    .prepare(
      `SELECT wd.*, w.url, w.secret
       FROM webhook_deliveries wd
       JOIN webhooks w ON w.id = wd.webhook_id
       WHERE wd.next_retry_at IS NOT NULL
         AND wd.next_retry_at <= ?
         AND wd.delivered_at IS NULL
         AND wd.attempts < ?
       LIMIT 100`
    )
    .bind(currentTime, MAX_ATTEMPTS)
    .all();

  if (!pending.results || pending.results.length === 0) {
    return 0;
  }

  // Process each pending delivery
  const retryPromises = pending.results.map((delivery) =>
    attemptDelivery(
      db,
      delivery.id as string,
      delivery.url as string,
      delivery.secret as string,
      delivery.payload as string,
      (delivery.attempts as number) + 1
    )
  );

  await Promise.allSettled(retryPromises);

  return pending.results.length;
}

/**
 * Create webhook payload from subscription event
 */
export function createWebhookPayload(
  eventType: EventType,
  data: {
    appUserId: string;
    subscriberId: string;
    subscription?: {
      id: string;
      productId: string;
      platform: Platform;
      status: string;
      expiresAt: number | null;
    };
    transaction?: {
      id: string;
      amount: number;
      currency: string;
    };
    entitlements?: Record<string, boolean>;
  }
): WebhookPayload {
  return {
    id: generateId(),
    type: eventType,
    created_at: toISOString(now()),
    data: {
      app_user_id: data.appUserId,
      subscriber_id: data.subscriberId,
      subscription: data.subscription
        ? {
            id: data.subscription.id,
            product_id: data.subscription.productId,
            platform: data.subscription.platform,
            status: data.subscription.status,
            expires_at: data.subscription.expiresAt
              ? toISOString(data.subscription.expiresAt)
              : null,
          }
        : undefined,
      transaction: data.transaction,
      entitlements: data.entitlements,
    },
  };
}

/**
 * Verify incoming webhook signature (for customer verification)
 */
export async function verifyWebhookSignature(
  payload: string,
  signature: string,
  secret: string,
  tolerance: number = 300 // 5 minutes
): Promise<boolean> {
  // Parse signature header
  const elements = signature.split(',').reduce(
    (acc, element) => {
      const [key, value] = element.split('=');
      if (key === 't') acc.timestamp = parseInt(value, 10);
      if (key === 'v1') acc.signatures.push(value);
      return acc;
    },
    { timestamp: 0, signatures: [] as string[] }
  );

  if (!elements.timestamp || elements.signatures.length === 0) {
    return false;
  }

  // Check timestamp tolerance
  const nowSeconds = Math.floor(Date.now() / 1000);
  if (Math.abs(nowSeconds - elements.timestamp) > tolerance) {
    return false;
  }

  // Compute expected signature
  const signaturePayload = `${elements.timestamp}.${payload}`;
  const expectedSignature = await hmacSha256(secret, signaturePayload);

  // Verify signature
  return elements.signatures.some((sig) => sig === expectedSignature);
}
