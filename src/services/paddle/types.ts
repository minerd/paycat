/**
 * Paddle Billing Types
 * https://developer.paddle.com/api-reference/overview
 */

// Paddle Configuration
export interface PaddleConfig {
  vendorId: string;
  apiKey: string;
  publicKey: string; // For webhook signature verification
  sandboxMode?: boolean;
}

// Paddle Webhook Event
export interface PaddleWebhookEvent {
  event_type: PaddleEventType;
  event_time: string; // ISO timestamp
  passthrough?: string; // Custom data
  alert_id: string;
  alert_name: string;
  p_signature: string;
  // Dynamic fields based on event type
  [key: string]: any;
}

// Paddle Event Types
export type PaddleEventType =
  // Subscription Events
  | 'subscription_created'
  | 'subscription_updated'
  | 'subscription_cancelled'
  | 'subscription_payment_succeeded'
  | 'subscription_payment_failed'
  | 'subscription_payment_refunded'
  // One-time Events
  | 'payment_succeeded'
  | 'payment_refunded'
  | 'payment_dispute_created'
  | 'payment_dispute_closed'
  // High-risk Events
  | 'high_risk_transaction_created'
  | 'high_risk_transaction_updated'
  // Transfer Events
  | 'transfer_created'
  | 'transfer_paid'
  // New Checkout Events
  | 'locker_processed'
  | 'new_audience_member'
  // Paddle Billing (v2) Events
  | 'transaction.completed'
  | 'transaction.updated'
  | 'subscription.activated'
  | 'subscription.canceled'
  | 'subscription.updated'
  | 'subscription.paused'
  | 'subscription.resumed'
  | 'subscription.past_due'
  | 'adjustment.created';

// Subscription Created Webhook
export interface PaddleSubscriptionCreated {
  subscription_id: string;
  user_id: string;
  email: string;
  status: 'active' | 'trialing' | 'past_due' | 'paused' | 'deleted';
  subscription_plan_id: string;
  quantity: number;
  unit_price: string; // Decimal string
  currency: string;
  next_bill_date: string; // YYYY-MM-DD
  update_url: string;
  cancel_url: string;
  checkout_id: string;
  passthrough?: string;
}

// Subscription Updated Webhook
export interface PaddleSubscriptionUpdated {
  subscription_id: string;
  user_id: string;
  email: string;
  status: 'active' | 'trialing' | 'past_due' | 'paused' | 'deleted';
  subscription_plan_id: string;
  old_subscription_plan_id?: string;
  quantity: number;
  old_quantity?: number;
  unit_price: string;
  old_unit_price?: string;
  currency: string;
  next_bill_date: string;
  paused_from?: string;
  paused_reason?: string;
}

// Subscription Cancelled Webhook
export interface PaddleSubscriptionCancelled {
  subscription_id: string;
  user_id: string;
  email: string;
  status: 'deleted';
  subscription_plan_id: string;
  quantity: number;
  unit_price: string;
  currency: string;
  cancellation_effective_date: string;
}

// Subscription Payment Succeeded Webhook
export interface PaddleSubscriptionPaymentSucceeded {
  subscription_id: string;
  user_id: string;
  email: string;
  subscription_plan_id: string;
  subscription_payment_id: string;
  next_bill_date: string;
  receipt_url: string;
  sale_gross: string;
  fee: string;
  earnings: string;
  currency: string;
  quantity: number;
  initial_payment: string; // "1" or "0"
  instalments: number;
  status: 'active';
  payment_method: string;
  country: string;
}

// Subscription Payment Failed Webhook
export interface PaddleSubscriptionPaymentFailed {
  subscription_id: string;
  user_id: string;
  email: string;
  subscription_plan_id: string;
  subscription_payment_id: string;
  next_retry_date?: string;
  status: 'past_due';
  amount: string;
  currency: string;
  attempt_number: string;
  hard_failure: string; // "true" or "false"
}

// Subscription Payment Refunded Webhook
export interface PaddleSubscriptionPaymentRefunded {
  subscription_id: string;
  user_id: string;
  email: string;
  subscription_plan_id: string;
  subscription_payment_id: string;
  refund_type: 'full' | 'partial';
  gross_refund: string;
  fee_refund: string;
  amount: string;
  currency: string;
  balance_gross: string;
  balance_fee: string;
  balance_earnings: string;
}

// Paddle API - List Subscriptions Response
export interface PaddleSubscription {
  subscription_id: number;
  plan_id: number;
  user_id: number;
  user_email: string;
  state: 'active' | 'past_due' | 'trialing' | 'paused' | 'deleted';
  signup_date: string;
  last_payment: {
    amount: number;
    currency: string;
    date: string;
  };
  next_payment?: {
    amount: number;
    currency: string;
    date: string;
  };
  update_url: string;
  cancel_url: string;
  paused_at?: string;
  paused_from?: string;
}

// Paddle API Response wrapper
export interface PaddleAPIResponse<T> {
  success: boolean;
  response: T;
  error?: {
    code: number;
    message: string;
  };
}

// Paddle Product/Plan
export interface PaddlePlan {
  id: number;
  name: string;
  billing_type: 'month' | 'year' | 'week' | 'day';
  billing_period: number;
  initial_price: Record<string, string>; // Currency -> price
  recurring_price: Record<string, string>;
  trial_days: number;
}

// Passthrough data structure (custom data we send)
export interface PaddlePassthrough {
  app_id: string;
  app_user_id: string;
  product_id?: string;
}

// Paddle Status to MRRCat Status mapping
export const PADDLE_STATUS_MAP: Record<string, string> = {
  active: 'active',
  trialing: 'active', // Trial is still active
  past_due: 'billing_retry',
  paused: 'paused',
  deleted: 'cancelled',
};
