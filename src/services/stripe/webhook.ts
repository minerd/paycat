/**
 * Stripe Webhook Signature Verification and Event Handling
 */

import { hmacSha256 } from '../../utils/crypto';
import type { StripeWebhookEvent, StripeEventType, StripeSubscription } from './types';

const WEBHOOK_TOLERANCE = 300; // 5 minutes

/**
 * Verify Stripe webhook signature
 */
export async function verifyStripeWebhook(
  payload: string,
  signature: string,
  secret: string
): Promise<StripeWebhookEvent> {
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
    throw new Error('Invalid webhook signature format');
  }

  // Check timestamp tolerance
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - elements.timestamp) > WEBHOOK_TOLERANCE) {
    throw new Error('Webhook timestamp too old');
  }

  // Compute expected signature
  const signedPayload = `${elements.timestamp}.${payload}`;
  const expectedSignature = await computeStripeSignature(signedPayload, secret);

  // Verify signature (constant-time comparison)
  const isValid = elements.signatures.some(
    (sig) => timingSafeEqual(sig, expectedSignature)
  );

  if (!isValid) {
    throw new Error('Invalid webhook signature');
  }

  return JSON.parse(payload) as StripeWebhookEvent;
}

/**
 * Compute Stripe webhook signature
 */
async function computeStripeSignature(
  payload: string,
  secret: string
): Promise<string> {
  return hmacSha256(secret, payload);
}

/**
 * Timing-safe string comparison
 */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;

  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }

  return result === 0;
}

/**
 * Extract subscription data from webhook event
 */
export function extractSubscriptionFromEvent(
  event: StripeWebhookEvent
): StripeSubscription | null {
  const eventTypes: StripeEventType[] = [
    'customer.subscription.created',
    'customer.subscription.updated',
    'customer.subscription.deleted',
    'customer.subscription.paused',
    'customer.subscription.resumed',
  ];

  if (eventTypes.includes(event.type)) {
    return event.data.object as unknown as StripeSubscription;
  }

  // For invoice events, subscription would need to be fetched separately
  if (event.type.startsWith('invoice.')) {
    return null;
  }

  return null;
}

/**
 * Check if event should trigger subscription update
 */
export function shouldUpdateSubscription(eventType: StripeEventType): boolean {
  const updateEvents: StripeEventType[] = [
    'customer.subscription.created',
    'customer.subscription.updated',
    'customer.subscription.deleted',
    'customer.subscription.paused',
    'customer.subscription.resumed',
    'invoice.paid',
    'invoice.payment_failed',
    'charge.refunded',
  ];

  return updateEvents.includes(eventType);
}

/**
 * Map Stripe webhook event to internal event type
 */
export function mapStripeWebhookToEventType(eventType: StripeEventType): string {
  switch (eventType) {
    case 'customer.subscription.created':
      return 'initial_purchase';

    case 'customer.subscription.updated':
      return 'subscription_updated';

    case 'customer.subscription.deleted':
      return 'expiration';

    case 'customer.subscription.paused':
      return 'paused';

    case 'customer.subscription.resumed':
      return 'reactivation';

    case 'customer.subscription.trial_will_end':
      return 'trial_ending';

    case 'invoice.paid':
    case 'invoice.payment_succeeded':
      return 'renewal';

    case 'invoice.payment_failed':
      return 'billing_issue';

    case 'charge.refunded':
      return 'refund';

    case 'charge.dispute.created':
      return 'dispute_created';

    case 'charge.dispute.closed':
      return 'dispute_closed';

    default:
      return 'unknown';
  }
}

/**
 * Check if event should trigger customer webhook
 */
export function shouldTriggerStripeWebhook(eventType: StripeEventType): boolean {
  // Skip internal/non-critical events
  const skipEvents: StripeEventType[] = [
    'customer.created',
    'customer.updated',
    'invoice.created',
    'invoice.finalized',
    'invoice.upcoming',
  ];

  return !skipEvents.includes(eventType);
}

/**
 * Get metadata from Stripe event
 */
export function getEventMetadata(
  event: StripeWebhookEvent
): Record<string, string> | null {
  const obj = event.data.object as { metadata?: Record<string, string> };
  return obj.metadata || null;
}

/**
 * Get customer ID from Stripe event
 */
export function getCustomerIdFromEvent(event: StripeWebhookEvent): string | null {
  const obj = event.data.object as { customer?: string };

  if (typeof obj.customer === 'string') {
    return obj.customer;
  }

  // For customer events, the object itself is the customer
  if (event.type.startsWith('customer.') && !event.type.includes('subscription')) {
    const customer = event.data.object as { id?: string };
    return customer.id || null;
  }

  return null;
}
