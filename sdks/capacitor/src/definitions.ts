/**
 * MRRCat Capacitor Plugin Definitions
 */

export interface MRRCatPlugin {
  /**
   * Configure the SDK with API key
   */
  configure(options: ConfigureOptions): Promise<void>;

  /**
   * Log in a user
   */
  login(options: LoginOptions): Promise<SubscriberInfo>;

  /**
   * Log out current user
   */
  logout(): Promise<void>;

  /**
   * Get current subscriber info
   */
  getSubscriberInfo(): Promise<SubscriberInfo>;

  /**
   * Get available offerings
   */
  getOfferings(): Promise<Offerings>;

  /**
   * Purchase a package
   */
  purchasePackage(options: PurchaseOptions): Promise<PurchaseResult>;

  /**
   * Restore purchases
   */
  restorePurchases(): Promise<SubscriberInfo>;

  /**
   * Check entitlement access
   */
  checkEntitlement(options: EntitlementOptions): Promise<EntitlementResult>;

  /**
   * Set subscriber attributes
   */
  setAttributes(options: AttributesOptions): Promise<void>;

  /**
   * Get paywall for current user
   */
  getPaywall(options?: PaywallOptions): Promise<PaywallResult>;

  /**
   * Present paywall UI
   */
  presentPaywall(options?: PaywallOptions): Promise<PaywallPresentResult>;

  /**
   * Track custom event
   */
  trackEvent(options: TrackEventOptions): Promise<void>;

  /**
   * Open platform's native subscription management page
   * iOS: Opens App Store subscription management
   * Android: Opens Google Play subscription management
   */
  manageSubscriptions(): Promise<void>;

  /**
   * Add listener for subscription updates
   */
  addListener(
    eventName: 'subscriptionUpdated',
    listenerFunc: (info: SubscriberInfo) => void
  ): Promise<PluginListenerHandle>;

  /**
   * Add listener for purchase events
   */
  addListener(
    eventName: 'purchaseCompleted' | 'purchaseFailed',
    listenerFunc: (result: PurchaseEvent) => void
  ): Promise<PluginListenerHandle>;

  /**
   * Remove all listeners
   */
  removeAllListeners(): Promise<void>;
}

// Configuration Options
export interface ConfigureOptions {
  apiKey: string;
  appUserId?: string;
  observerMode?: boolean;
  debugLogsEnabled?: boolean;
  useSandbox?: boolean;
}

// Login Options
export interface LoginOptions {
  appUserId: string;
}

// Subscriber Info
export interface SubscriberInfo {
  originalAppUserId: string;
  firstSeen: string;
  lastSeen: string;
  entitlements: Record<string, Entitlement>;
  subscriptions: Record<string, Subscription>;
  nonSubscriptionPurchases: Record<string, NonSubscription>;
  attributes: Record<string, string>;
}

// Entitlement
export interface Entitlement {
  identifier: string;
  isActive: boolean;
  willRenew: boolean;
  productIdentifier: string;
  expiresDate: string | null;
  purchaseDate: string;
  isSandbox: boolean;
  store: Store;
}

// Subscription
export interface Subscription {
  productIdentifier: string;
  purchaseDate: string;
  expiresDate: string | null;
  store: Store;
  isSandbox: boolean;
  willRenew: boolean;
  isActive: boolean;
  isTrial: boolean;
  isIntroOffer: boolean;
  periodType: PeriodType;
}

// Non-subscription purchase
export interface NonSubscription {
  productIdentifier: string;
  purchaseDate: string;
  store: Store;
  isSandbox: boolean;
}

// Offerings
export interface Offerings {
  current: Offering | null;
  all: Record<string, Offering>;
}

// Offering
export interface Offering {
  identifier: string;
  serverDescription: string;
  metadata: Record<string, unknown>;
  availablePackages: Package[];
  lifetime: Package | null;
  annual: Package | null;
  sixMonth: Package | null;
  threeMonth: Package | null;
  twoMonth: Package | null;
  monthly: Package | null;
  weekly: Package | null;
}

// Package
export interface Package {
  identifier: string;
  packageType: PackageType;
  product: Product;
  offeringIdentifier: string;
}

// Product
export interface Product {
  identifier: string;
  description: string;
  title: string;
  price: number;
  priceString: string;
  currencyCode: string;
  introductoryPrice?: IntroductoryPrice;
  subscriptionPeriod?: string;
}

// Introductory Price
export interface IntroductoryPrice {
  price: number;
  priceString: string;
  cycles: number;
  period: string;
  periodUnit: PeriodUnit;
  periodNumberOfUnits: number;
}

// Purchase Options
export interface PurchaseOptions {
  packageIdentifier: string;
  offeringIdentifier?: string;
  upgradeInfo?: UpgradeInfo;
}

// Upgrade Info (Android)
export interface UpgradeInfo {
  oldProductIdentifier: string;
  prorationMode?: ProrationMode;
}

// Purchase Result
export interface PurchaseResult {
  subscriber: SubscriberInfo;
  productIdentifier: string;
  transactionIdentifier: string;
}

// Entitlement Options
export interface EntitlementOptions {
  identifier: string;
}

// Entitlement Result
export interface EntitlementResult {
  isActive: boolean;
  entitlement: Entitlement | null;
}

// Attributes Options
export interface AttributesOptions {
  attributes: Record<string, string | null>;
}

// Paywall Options
export interface PaywallOptions {
  identifier?: string;
  locale?: string;
}

// Paywall Result
export interface PaywallResult {
  templateId: string;
  templateType: string;
  offering: Offering;
  config: Record<string, unknown>;
}

// Paywall Present Result
export interface PaywallPresentResult {
  presented: boolean;
  purchased: boolean;
  restored: boolean;
  subscriber?: SubscriberInfo;
}

// Track Event Options
export interface TrackEventOptions {
  eventName: string;
  properties?: Record<string, unknown>;
}

// Purchase Event
export interface PurchaseEvent {
  productIdentifier: string;
  transactionIdentifier?: string;
  error?: string;
}

// Plugin Listener Handle
export interface PluginListenerHandle {
  remove: () => Promise<void>;
}

// Enums
export type Store = 'app_store' | 'play_store' | 'stripe' | 'amazon' | 'paddle';
export type PeriodType = 'normal' | 'intro' | 'trial';
export type PackageType = 'unknown' | 'custom' | 'lifetime' | 'annual' | 'six_month' | 'three_month' | 'two_month' | 'monthly' | 'weekly';
export type PeriodUnit = 'day' | 'week' | 'month' | 'year';
export type ProrationMode = 'immediate_with_time_proration' | 'immediate_and_charge_prorated_price' | 'immediate_without_proration' | 'deferred' | 'immediate_and_charge_full_price';
