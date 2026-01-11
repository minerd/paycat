/**
 * Amazon Appstore Types
 * In-App Purchasing API & Receipt Verification Service
 */

// Receipt Verification Service (RVS) Response
export interface AmazonRVSResponse {
  receiptId: string;
  productType: 'CONSUMABLE' | 'ENTITLED' | 'SUBSCRIPTION';
  productId: string;
  purchaseDate: number; // Unix timestamp in ms
  cancelDate?: number;
  testTransaction: boolean;
  betaProduct?: boolean;
  parentProductId?: string;
  quantity?: number;
  term?: string; // For subscriptions: duration
  termSku?: string;
  renewalDate?: number;
  autoRenewing?: boolean;
  gracePeriod?: boolean;
  freeTrialEndDate?: number;
  introductoryPriceEndDate?: number;
}

// RVS Error Response
export interface AmazonRVSError {
  message: string;
  status: boolean;
}

// Subscription Period
export interface AmazonSubscriptionPeriod {
  startDate: number;
  endDate: number;
}

// Real-time Notification (SNS)
export interface AmazonNotification {
  Type: 'Notification' | 'SubscriptionConfirmation' | 'UnsubscribeConfirmation';
  MessageId: string;
  TopicArn: string;
  Subject?: string;
  Message: string; // JSON string of AmazonNotificationMessage
  Timestamp: string;
  SignatureVersion: string;
  Signature: string;
  SigningCertURL: string;
  UnsubscribeURL?: string;
}

// Notification Message Content
export interface AmazonNotificationMessage {
  notificationType: AmazonNotificationType;
  environment: 'SANDBOX' | 'PRODUCTION';
  receiptId: string;
  userId: string;
  productId: string;
  betaProduct?: boolean;
}

export type AmazonNotificationType =
  | 'PURCHASE' // Initial purchase
  | 'CANCEL' // Subscription cancelled
  | 'REVOKE' // Purchase revoked (refund)
  | 'RENEWAL' // Subscription renewed
  | 'RENEWAL_FAILED' // Renewal failed
  | 'GRACE_PERIOD_ENTERED' // Entered grace period
  | 'GRACE_PERIOD_EXPIRED' // Grace period expired
  | 'ENTITLEMENT_UPDATE'; // Entitlement changed

// Amazon App Configuration
export interface AmazonConfig {
  appId: string;
  sharedSecret: string;
  sandboxMode?: boolean;
}

// Purchase verification request
export interface AmazonVerifyRequest {
  userId: string;
  receiptId: string;
}

// Subscription status mapping
export const AMAZON_STATUS_MAP: Record<string, string> = {
  active: 'active',
  cancelled: 'cancelled',
  expired: 'expired',
  grace_period: 'grace_period',
  billing_retry: 'billing_retry',
};

// Product type mapping
export const AMAZON_PRODUCT_TYPE_MAP = {
  CONSUMABLE: 'consumable',
  ENTITLED: 'non_consumable',
  SUBSCRIPTION: 'subscription',
} as const;
