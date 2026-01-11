/**
 * Paddle Webhook Handler
 * Signature verification and event parsing
 */

import type {
  PaddleWebhookEvent,
  PaddleEventType,
  PaddleConfig,
  PaddlePassthrough,
} from './types';

/**
 * Verify Paddle webhook signature
 * Uses PHP serialize format with RSA signature
 */
export async function verifyPaddleWebhook(
  body: Record<string, string>,
  publicKey: string
): Promise<boolean> {
  try {
    // Extract signature
    const signature = body.p_signature;
    if (!signature) {
      console.error('No signature in Paddle webhook');
      return false;
    }

    // Remove signature from body for verification
    const payload = { ...body };
    delete payload.p_signature;

    // Sort keys and serialize (PHP serialize format)
    const serialized = phpSerialize(payload);

    // Decode base64 signature
    const signatureBytes = Uint8Array.from(atob(signature), c => c.charCodeAt(0));

    // Import public key
    const pemHeader = '-----BEGIN PUBLIC KEY-----';
    const pemFooter = '-----END PUBLIC KEY-----';
    const pemContents = publicKey
      .replace(pemHeader, '')
      .replace(pemFooter, '')
      .replace(/\s/g, '');
    const binaryDer = Uint8Array.from(atob(pemContents), c => c.charCodeAt(0));

    const cryptoKey = await crypto.subtle.importKey(
      'spki',
      binaryDer,
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-1' },
      false,
      ['verify']
    );

    // Verify signature
    const encoder = new TextEncoder();
    const data = encoder.encode(serialized);

    const isValid = await crypto.subtle.verify(
      'RSASSA-PKCS1-v1_5',
      cryptoKey,
      signatureBytes,
      data
    );

    return isValid;
  } catch (error) {
    console.error('Paddle webhook verification error:', error);
    return false;
  }
}

/**
 * PHP serialize format (simplified for Paddle webhooks)
 */
function phpSerialize(obj: Record<string, string>): string {
  const sortedKeys = Object.keys(obj).sort();
  const parts: string[] = [];

  for (const key of sortedKeys) {
    const value = obj[key];
    const keyPart = `s:${key.length}:"${key}"`;
    const valuePart = value === null || value === undefined
      ? 'N;'
      : `s:${value.length}:"${value}"`;
    parts.push(`${keyPart};${valuePart}`);
  }

  return `a:${sortedKeys.length}:{${parts.join('')}}`;
}

/**
 * Parse Paddle webhook body
 */
export function parsePaddleWebhook(
  formData: Record<string, string>
): PaddleWebhookEvent {
  return {
    event_type: formData.alert_name as PaddleEventType,
    event_time: formData.event_time,
    passthrough: formData.passthrough,
    alert_id: formData.alert_id,
    alert_name: formData.alert_name,
    p_signature: formData.p_signature,
    ...formData,
  };
}

/**
 * Parse passthrough data
 */
export function parsePassthrough(passthrough?: string): PaddlePassthrough | null {
  if (!passthrough) return null;

  try {
    return JSON.parse(passthrough) as PaddlePassthrough;
  } catch {
    return null;
  }
}

/**
 * Map Paddle event type to PayCat event type
 */
export function mapPaddleEventType(paddleEvent: PaddleEventType): string {
  const mapping: Record<string, string> = {
    // Classic API events
    subscription_created: 'initial_purchase',
    subscription_updated: 'subscription_updated',
    subscription_cancelled: 'cancellation',
    subscription_payment_succeeded: 'renewal',
    subscription_payment_failed: 'billing_issue',
    subscription_payment_refunded: 'refund',
    payment_succeeded: 'purchase',
    payment_refunded: 'refund',
    payment_dispute_created: 'dispute_opened',
    payment_dispute_closed: 'dispute_closed',
    high_risk_transaction_created: 'high_risk_flagged',
    high_risk_transaction_updated: 'high_risk_updated',
    // Paddle Billing (v2) events
    'transaction.completed': 'purchase',
    'transaction.updated': 'purchase_updated',
    'subscription.activated': 'initial_purchase',
    'subscription.canceled': 'cancellation',
    'subscription.updated': 'subscription_updated',
    'subscription.paused': 'paused',
    'subscription.resumed': 'resumed',
    'subscription.past_due': 'billing_issue',
    'adjustment.created': 'refund',
  };

  return mapping[paddleEvent] || 'unknown';
}

/**
 * Map Paddle subscription status to PayCat status
 */
export function mapPaddleStatusToPayCat(paddleStatus: string): string {
  const mapping: Record<string, string> = {
    active: 'active',
    trialing: 'active',
    past_due: 'billing_retry',
    paused: 'paused',
    deleted: 'cancelled',
    cancelled: 'cancelled',
  };

  return mapping[paddleStatus] || 'active';
}

/**
 * Extract subscription data from webhook event
 */
export function extractSubscriptionData(event: PaddleWebhookEvent): {
  subscriptionId: string | null;
  userId: string | null;
  email: string | null;
  status: string;
  planId: string | null;
  nextBillDate: string | null;
  cancelledAt: string | null;
  priceAmount: number | null;
  priceCurrency: string | null;
} {
  return {
    subscriptionId: event.subscription_id || null,
    userId: event.user_id || null,
    email: event.email || null,
    status: event.status || 'active',
    planId: event.subscription_plan_id || event.plan_id || null,
    nextBillDate: event.next_bill_date || null,
    cancelledAt: event.cancellation_effective_date || null,
    priceAmount: event.unit_price ? parseFloat(event.unit_price) * 100 : null, // Convert to cents
    priceCurrency: event.currency || null,
  };
}

/**
 * Extract payment data from webhook event
 */
export function extractPaymentData(event: PaddleWebhookEvent): {
  paymentId: string | null;
  amount: number;
  fee: number;
  earnings: number;
  currency: string;
  receiptUrl: string | null;
  isRefund: boolean;
  refundAmount: number | null;
} {
  const isRefund = event.alert_name?.includes('refund') ?? false;

  return {
    paymentId: event.subscription_payment_id || event.order_id || null,
    amount: parseFloat(event.sale_gross || event.amount || '0') * 100, // Convert to cents
    fee: parseFloat(event.fee || '0') * 100,
    earnings: parseFloat(event.earnings || '0') * 100,
    currency: event.currency || 'USD',
    receiptUrl: event.receipt_url || null,
    isRefund,
    refundAmount: isRefund ? parseFloat(event.gross_refund || event.amount || '0') * 100 : null,
  };
}

/**
 * Get Paddle public key from config
 */
export function getPaddlePublicKey(config: PaddleConfig): string {
  return config.publicKey;
}
