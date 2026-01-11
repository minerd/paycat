/**
 * Google Play Developer API Types
 */

// Configuration
export interface GoogleConfig {
  packageName: string;
  serviceAccountEmail: string;
  serviceAccountPrivateKey: string;
}

// API Endpoint
export const GOOGLE_API_ENDPOINT = 'https://androidpublisher.googleapis.com';

// OAuth Token Response
export interface GoogleOAuthTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
}

// Subscription Purchase V2
export interface SubscriptionPurchaseV2 {
  kind: string;
  regionCode: string;
  latestOrderId: string;
  lineItems: SubscriptionPurchaseLineItem[];
  startTime: string;
  subscriptionState: SubscriptionState;
  linkedPurchaseToken?: string;
  pausedStateContext?: PausedStateContext;
  canceledStateContext?: CanceledStateContext;
  testPurchase?: TestPurchase;
  acknowledgementState?: AcknowledgementState;
  externalAccountIdentifiers?: ExternalAccountIdentifiers;
  subscribeWithGoogleInfo?: SubscribeWithGoogleInfo;
}

export interface SubscriptionPurchaseLineItem {
  productId: string;
  expiryTime: string;
  autoRenewingPlan?: AutoRenewingPlan;
  prepaidPlan?: PrepaidPlan;
  offerDetails?: OfferDetails;
}

export interface AutoRenewingPlan {
  autoRenewEnabled: boolean;
  priceChangeDetails?: PriceChangeDetails;
}

export interface PrepaidPlan {
  allowExtendAfterTime: string;
}

export interface OfferDetails {
  offerTags: string[];
  basePlanId: string;
  offerId?: string;
}

export interface PriceChangeDetails {
  newPrice: Money;
  priceChangeMode: string;
  priceChangeState: string;
  expectedNewPriceChargeTime?: string;
}

export interface Money {
  currencyCode: string;
  units: string;
  nanos: number;
}

export interface PausedStateContext {
  autoResumeTime: string;
}

export interface CanceledStateContext {
  userInitiatedCancellation?: UserInitiatedCancellation;
  systemInitiatedCancellation?: SystemInitiatedCancellation;
  developerInitiatedCancellation?: DeveloperInitiatedCancellation;
  replacementCancellation?: ReplacementCancellation;
}

export interface UserInitiatedCancellation {
  cancelSurveyResult?: CancelSurveyResult;
  cancelTime: string;
}

export interface CancelSurveyResult {
  reason: CancelSurveyReason;
  reasonUserInput?: string;
}

export type CancelSurveyReason =
  | 'CANCEL_SURVEY_REASON_UNSPECIFIED'
  | 'CANCEL_SURVEY_REASON_NOT_ENOUGH_USAGE'
  | 'CANCEL_SURVEY_REASON_TECHNICAL_ISSUES'
  | 'CANCEL_SURVEY_REASON_COST_RELATED'
  | 'CANCEL_SURVEY_REASON_FOUND_BETTER_APP'
  | 'CANCEL_SURVEY_REASON_OTHERS';

export interface SystemInitiatedCancellation {
  // Empty for now
}

export interface DeveloperInitiatedCancellation {
  // Empty for now
}

export interface ReplacementCancellation {
  // Empty for now
}

export interface TestPurchase {
  // Empty for now
}

export type AcknowledgementState =
  | 'ACKNOWLEDGEMENT_STATE_UNSPECIFIED'
  | 'ACKNOWLEDGEMENT_STATE_PENDING'
  | 'ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED';

export interface ExternalAccountIdentifiers {
  externalAccountId?: string;
  obfuscatedExternalAccountId?: string;
  obfuscatedExternalProfileId?: string;
}

export interface SubscribeWithGoogleInfo {
  emailAddress: string;
  givenName?: string;
  familyName?: string;
  profileId: string;
  profileName?: string;
}

export type SubscriptionState =
  | 'SUBSCRIPTION_STATE_UNSPECIFIED'
  | 'SUBSCRIPTION_STATE_PENDING'
  | 'SUBSCRIPTION_STATE_ACTIVE'
  | 'SUBSCRIPTION_STATE_PAUSED'
  | 'SUBSCRIPTION_STATE_IN_GRACE_PERIOD'
  | 'SUBSCRIPTION_STATE_ON_HOLD'
  | 'SUBSCRIPTION_STATE_CANCELED'
  | 'SUBSCRIPTION_STATE_EXPIRED';

// Product Purchase (one-time)
export interface ProductPurchase {
  kind: string;
  purchaseTimeMillis: string;
  purchaseState: number;
  consumptionState: number;
  developerPayload?: string;
  orderId: string;
  purchaseType?: number;
  acknowledgementState: number;
  purchaseToken?: string;
  productId: string;
  quantity: number;
  obfuscatedExternalAccountId?: string;
  obfuscatedExternalProfileId?: string;
  regionCode: string;
}

// Real-time Developer Notifications (RTDN)
export interface GoogleRTDN {
  version: string;
  packageName: string;
  eventTimeMillis: string;
  subscriptionNotification?: SubscriptionNotification;
  oneTimeProductNotification?: OneTimeProductNotification;
  voidedPurchaseNotification?: VoidedPurchaseNotification;
  testNotification?: TestNotification;
}

export interface SubscriptionNotification {
  version: string;
  notificationType: SubscriptionNotificationType;
  purchaseToken: string;
  subscriptionId: string;
}

export type SubscriptionNotificationType =
  | 1  // SUBSCRIPTION_RECOVERED
  | 2  // SUBSCRIPTION_RENEWED
  | 3  // SUBSCRIPTION_CANCELED
  | 4  // SUBSCRIPTION_PURCHASED
  | 5  // SUBSCRIPTION_ON_HOLD
  | 6  // SUBSCRIPTION_IN_GRACE_PERIOD
  | 7  // SUBSCRIPTION_RESTARTED
  | 8  // SUBSCRIPTION_PRICE_CHANGE_CONFIRMED
  | 9  // SUBSCRIPTION_DEFERRED
  | 10 // SUBSCRIPTION_PAUSED
  | 11 // SUBSCRIPTION_PAUSE_SCHEDULE_CHANGED
  | 12 // SUBSCRIPTION_REVOKED
  | 13 // SUBSCRIPTION_EXPIRED
  | 20; // SUBSCRIPTION_PENDING_PURCHASE_CANCELED

export interface OneTimeProductNotification {
  version: string;
  notificationType: number;
  purchaseToken: string;
  sku: string;
}

export interface VoidedPurchaseNotification {
  purchaseToken: string;
  orderId: string;
  productType: number;
  refundType: number;
}

export interface TestNotification {
  version: string;
}

// Map subscription state to internal status
export function mapGoogleSubscriptionState(
  state: SubscriptionState
): 'active' | 'expired' | 'cancelled' | 'grace_period' | 'paused' | 'billing_retry' {
  switch (state) {
    case 'SUBSCRIPTION_STATE_ACTIVE':
      return 'active';
    case 'SUBSCRIPTION_STATE_PAUSED':
      return 'paused';
    case 'SUBSCRIPTION_STATE_IN_GRACE_PERIOD':
      return 'grace_period';
    case 'SUBSCRIPTION_STATE_ON_HOLD':
      return 'billing_retry';
    case 'SUBSCRIPTION_STATE_CANCELED':
      return 'cancelled';
    case 'SUBSCRIPTION_STATE_EXPIRED':
      return 'expired';
    case 'SUBSCRIPTION_STATE_PENDING':
      return 'active'; // Treat pending as active for now
    default:
      return 'expired';
  }
}

// Map notification type to event type
export function mapGoogleNotificationType(
  type: SubscriptionNotificationType
): string {
  switch (type) {
    case 4:
      return 'initial_purchase';
    case 2:
      return 'renewal';
    case 1:
      return 'billing_recovery';
    case 3:
      return 'cancellation';
    case 5:
      return 'billing_issue';
    case 6:
      return 'grace_period_started';
    case 7:
      return 'reactivation';
    case 8:
      return 'price_increase';
    case 10:
      return 'paused';
    case 12:
      return 'refund';
    case 13:
      return 'expiration';
    default:
      return 'unknown';
  }
}
