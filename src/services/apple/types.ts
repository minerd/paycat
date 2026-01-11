/**
 * Apple App Store Server API Types
 */

// Configuration
export interface AppleConfig {
  keyId: string;
  issuerId: string;
  bundleId: string;
  privateKey: string;
  environment: 'sandbox' | 'production';
}

// API Endpoints
export const APPLE_API_ENDPOINTS = {
  production: 'https://api.storekit.itunes.apple.com',
  sandbox: 'https://api.storekit-sandbox.itunes.apple.com',
} as const;

// Transaction Info
export interface JWSTransactionDecodedPayload {
  transactionId: string;
  originalTransactionId: string;
  bundleId: string;
  productId: string;
  purchaseDate: number;
  originalPurchaseDate: number;
  expiresDate?: number;
  quantity: number;
  type: TransactionType;
  appAccountToken?: string;
  inAppOwnershipType: 'FAMILY_SHARED' | 'PURCHASED';
  signedDate: number;
  environment: 'Sandbox' | 'Production';
  transactionReason?: 'PURCHASE' | 'RENEWAL';
  storefront: string;
  storefrontId: string;
  price?: number;
  currency?: string;
  offerType?: OfferType;
  offerIdentifier?: string;
  revocationDate?: number;
  revocationReason?: RevocationReason;
  isUpgraded?: boolean;
  webOrderLineItemId?: string;
  subscriptionGroupIdentifier?: string;
}

export type TransactionType =
  | 'Auto-Renewable Subscription'
  | 'Non-Consumable'
  | 'Consumable'
  | 'Non-Renewing Subscription';

export type OfferType = 1 | 2 | 3; // 1=intro, 2=promo, 3=offer code

export type RevocationReason = 0 | 1; // 0=other, 1=app issue

// Renewal Info
export interface JWSRenewalInfoDecodedPayload {
  expirationIntent?: ExpirationIntent;
  originalTransactionId: string;
  autoRenewProductId: string;
  productId: string;
  autoRenewStatus: AutoRenewStatus;
  isInBillingRetryPeriod?: boolean;
  priceIncreaseStatus?: PriceIncreaseStatus;
  gracePeriodExpiresDate?: number;
  offerType?: OfferType;
  offerIdentifier?: string;
  signedDate: number;
  environment: 'Sandbox' | 'Production';
  recentSubscriptionStartDate?: number;
  renewalDate?: number;
}

export type ExpirationIntent = 1 | 2 | 3 | 4 | 5;
// 1=cancelled, 2=billing error, 3=price increase, 4=unavailable, 5=other

export type AutoRenewStatus = 0 | 1; // 0=off, 1=on

export type PriceIncreaseStatus = 0 | 1; // 0=not responded, 1=consented

// Subscription Status
export interface SubscriptionGroupIdentifierItem {
  subscriptionGroupIdentifier: string;
  lastTransactions: LastTransactionsItem[];
}

export interface LastTransactionsItem {
  status: SubscriptionStatus;
  originalTransactionId: string;
  signedTransactionInfo: string;
  signedRenewalInfo: string;
}

export type SubscriptionStatus = 1 | 2 | 3 | 4 | 5;
// 1=active, 2=expired, 3=billing retry, 4=grace period, 5=revoked

// Transaction History Response
export interface TransactionHistoryResponse {
  signedTransactions: string[];
  revision: string;
  environment: 'Sandbox' | 'Production';
  bundleId: string;
  appAppleId?: number;
  hasMore: boolean;
}

// Get All Subscription Statuses Response
export interface StatusResponse {
  environment: 'Sandbox' | 'Production';
  bundleId: string;
  appAppleId?: number;
  data: SubscriptionGroupIdentifierItem[];
}

// Transaction Info Response
export interface TransactionInfoResponse {
  signedTransactionInfo: string;
}

// App Store Server Notification V2
export interface NotificationV2Payload {
  notificationType: NotificationType;
  subtype?: NotificationSubtype;
  notificationUUID: string;
  version: string;
  signedDate: number;
  data?: NotificationData;
  summary?: NotificationSummary;
}

export interface NotificationData {
  appAppleId?: number;
  bundleId: string;
  bundleVersion?: string;
  environment: 'Sandbox' | 'Production';
  signedTransactionInfo?: string;
  signedRenewalInfo?: string;
  status?: SubscriptionStatus;
}

export interface NotificationSummary {
  requestIdentifier: string;
  environment: 'Sandbox' | 'Production';
  appAppleId?: number;
  bundleId: string;
  productId: string;
  storefrontCountryCodes: string[];
  succeededCount: number;
  failedCount: number;
}

export type NotificationType =
  | 'CONSUMPTION_REQUEST'
  | 'DID_CHANGE_RENEWAL_PREF'
  | 'DID_CHANGE_RENEWAL_STATUS'
  | 'DID_FAIL_TO_RENEW'
  | 'DID_RENEW'
  | 'EXPIRED'
  | 'EXTERNAL_PURCHASE_TOKEN'
  | 'GRACE_PERIOD_EXPIRED'
  | 'OFFER_REDEEMED'
  | 'PRICE_INCREASE'
  | 'REFUND'
  | 'REFUND_DECLINED'
  | 'REFUND_REVERSED'
  | 'RENEWAL_EXTENDED'
  | 'RENEWAL_EXTENSION'
  | 'REVOKE'
  | 'SUBSCRIBED'
  | 'TEST';

export type NotificationSubtype =
  | 'INITIAL_BUY'
  | 'RESUBSCRIBE'
  | 'DOWNGRADE'
  | 'UPGRADE'
  | 'AUTO_RENEW_ENABLED'
  | 'AUTO_RENEW_DISABLED'
  | 'VOLUNTARY'
  | 'BILLING_RETRY'
  | 'PRICE_INCREASE'
  | 'GRACE_PERIOD'
  | 'PENDING'
  | 'ACCEPTED'
  | 'BILLING_RECOVERY'
  | 'PRODUCT_NOT_FOR_SALE'
  | 'SUMMARY'
  | 'FAILURE';

// Error responses
export interface AppleErrorResponse {
  errorCode: number;
  errorMessage: string;
}

// Mapped status for internal use
export function mapAppleSubscriptionStatus(
  status: SubscriptionStatus
): 'active' | 'expired' | 'billing_retry' | 'grace_period' | 'cancelled' {
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
    default:
      return 'expired';
  }
}
