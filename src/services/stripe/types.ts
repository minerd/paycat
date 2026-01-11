/**
 * Stripe API Types
 */

// Configuration
export interface StripeConfig {
  secretKey: string;
  webhookSecret: string;
}

// Stripe API Endpoint
export const STRIPE_API_ENDPOINT = 'https://api.stripe.com/v1';

// Subscription
export interface StripeSubscription {
  id: string;
  object: 'subscription';
  customer: string;
  status: StripeSubscriptionStatus;
  items: {
    data: StripeSubscriptionItem[];
  };
  current_period_start: number;
  current_period_end: number;
  cancel_at_period_end: boolean;
  canceled_at: number | null;
  ended_at: number | null;
  trial_start: number | null;
  trial_end: number | null;
  latest_invoice: string | null;
  default_payment_method: string | null;
  metadata: Record<string, string>;
  created: number;
  livemode: boolean;
}

export interface StripeSubscriptionItem {
  id: string;
  price: StripePrice;
  quantity: number;
}

export interface StripePrice {
  id: string;
  product: string;
  unit_amount: number | null;
  currency: string;
  recurring: {
    interval: 'day' | 'week' | 'month' | 'year';
    interval_count: number;
  } | null;
}

export type StripeSubscriptionStatus =
  | 'active'
  | 'past_due'
  | 'unpaid'
  | 'canceled'
  | 'incomplete'
  | 'incomplete_expired'
  | 'trialing'
  | 'paused';

// Customer
export interface StripeCustomer {
  id: string;
  object: 'customer';
  email: string | null;
  name: string | null;
  metadata: Record<string, string>;
  created: number;
  livemode: boolean;
}

// Invoice
export interface StripeInvoice {
  id: string;
  object: 'invoice';
  customer: string;
  subscription: string | null;
  status: 'draft' | 'open' | 'paid' | 'uncollectible' | 'void';
  amount_paid: number;
  amount_due: number;
  currency: string;
  created: number;
  livemode: boolean;
}

// Charge
export interface StripeCharge {
  id: string;
  object: 'charge';
  amount: number;
  currency: string;
  customer: string | null;
  status: 'succeeded' | 'pending' | 'failed';
  refunded: boolean;
  amount_refunded: number;
  created: number;
}

// Refund
export interface StripeRefund {
  id: string;
  object: 'refund';
  amount: number;
  charge: string;
  currency: string;
  status: 'succeeded' | 'pending' | 'failed' | 'canceled';
  created: number;
}

// Webhook Event
export interface StripeWebhookEvent {
  id: string;
  object: 'event';
  type: StripeEventType;
  data: {
    object: Record<string, unknown>;
    previous_attributes?: Record<string, unknown>;
  };
  created: number;
  livemode: boolean;
  api_version: string;
}

export type StripeEventType =
  // Customer events
  | 'customer.created'
  | 'customer.updated'
  | 'customer.deleted'
  // Subscription events
  | 'customer.subscription.created'
  | 'customer.subscription.updated'
  | 'customer.subscription.deleted'
  | 'customer.subscription.paused'
  | 'customer.subscription.resumed'
  | 'customer.subscription.pending_update_applied'
  | 'customer.subscription.pending_update_expired'
  | 'customer.subscription.trial_will_end'
  // Invoice events
  | 'invoice.created'
  | 'invoice.finalized'
  | 'invoice.paid'
  | 'invoice.payment_failed'
  | 'invoice.payment_succeeded'
  | 'invoice.upcoming'
  // Charge events
  | 'charge.succeeded'
  | 'charge.failed'
  | 'charge.refunded'
  | 'charge.dispute.created'
  | 'charge.dispute.closed';

// Map Stripe status to internal status
export function mapStripeSubscriptionStatus(
  status: StripeSubscriptionStatus
): 'active' | 'expired' | 'cancelled' | 'grace_period' | 'paused' | 'billing_retry' {
  switch (status) {
    case 'active':
    case 'trialing':
      return 'active';
    case 'past_due':
    case 'unpaid':
      return 'billing_retry';
    case 'canceled':
    case 'incomplete_expired':
      return 'cancelled';
    case 'incomplete':
      return 'billing_retry';
    case 'paused':
      return 'paused';
    default:
      return 'expired';
  }
}

// Map Stripe event to internal event type
export function mapStripeEventType(eventType: StripeEventType): string {
  switch (eventType) {
    case 'customer.subscription.created':
      return 'initial_purchase';
    case 'invoice.paid':
    case 'invoice.payment_succeeded':
      return 'renewal';
    case 'customer.subscription.deleted':
      return 'expiration';
    case 'customer.subscription.updated':
      return 'subscription_updated';
    case 'customer.subscription.paused':
      return 'paused';
    case 'customer.subscription.resumed':
      return 'reactivation';
    case 'invoice.payment_failed':
      return 'billing_issue';
    case 'charge.refunded':
      return 'refund';
    case 'charge.dispute.created':
      return 'dispute_created';
    case 'customer.subscription.trial_will_end':
      return 'trial_ending';
    default:
      return 'unknown';
  }
}
