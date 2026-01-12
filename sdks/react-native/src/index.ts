/**
 * MRRCat React Native SDK
 * Unified subscription management across iOS, Android, and Web
 */

import { Platform, NativeModules, NativeEventEmitter } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Types
export interface MRRCatConfig {
  apiKey: string;
  appUserID?: string;
  baseURL?: string;
  useNativeIAP?: boolean;
}

export interface SubscriberInfo {
  originalAppUserID: string;
  firstSeen: Date;
  subscriptions: Record<string, Subscription>;
  entitlements: Record<string, Entitlement>;
}

export interface Subscription {
  platform: Platform;
  productID: string;
  status: SubscriptionStatus;
  purchaseDate: Date;
  expiresDate: Date | null;
  isSandbox: boolean;
  isTrialPeriod: boolean;
  willRenew: boolean;
  gracePeriodExpiresDate: Date | null;
}

export interface Entitlement {
  isActive: boolean;
  productIdentifier: string;
  expiresDate: Date | null;
}

export interface ProductDetails {
  productId: string;
  title: string;
  description: string;
  price: string;
  priceAmountMicros: number;
  priceCurrencyCode: string;
  subscriptionPeriod?: string;
  introductoryPrice?: string;
}

export type Platform = 'ios' | 'android' | 'stripe';
export type SubscriptionStatus = 'active' | 'expired' | 'cancelled' | 'grace_period' | 'paused' | 'billing_retry';
export type PackageType = 'weekly' | 'monthly' | 'two_month' | 'three_month' | 'six_month' | 'annual' | 'lifetime' | 'custom';
export type ProductType = 'subscription' | 'consumable' | 'non_consumable';

// Offerings types
export interface Offerings {
  current: Offering | null;
  all: Record<string, Offering>;
}

export interface Offering {
  identifier: string;
  displayName: string | null;
  description: string | null;
  isCurrent: boolean;
  metadata: Record<string, string>;
  availablePackages: Package[];
  // Convenience getters
  monthly?: Package;
  annual?: Package;
  weekly?: Package;
  lifetime?: Package;
}

export interface Package {
  identifier: string;
  displayName: string | null;
  description: string | null;
  packageType: PackageType;
  products: MRRCatProduct[];
}

export interface MRRCatProduct {
  storeProductId: string;
  platform: Platform;
  displayName: string | null;
  description: string | null;
  productType: ProductType;
  price: { amount: number; currency: string } | null;
  subscriptionPeriod: string | null;
  trialPeriod: string | null;
  metadata: Record<string, string>;
}

// Events
export type MRRCatEventType = 'subscriberInfoUpdated' | 'purchaseCompleted' | 'purchaseFailed' | 'restoreCompleted';

export interface MRRCatEvent {
  type: MRRCatEventType;
  data?: SubscriberInfo | MRRCatError | ProductDetails;
}

type EventCallback = (event: MRRCatEvent) => void;

// API Response types
interface ApiSubscriberResponse {
  subscriber: {
    original_app_user_id: string;
    first_seen: string;
    subscriptions: Record<string, ApiSubscription>;
    entitlements: Record<string, ApiEntitlement>;
  };
}

interface ApiSubscription {
  platform: string;
  product_id: string;
  status: string;
  purchase_date: string;
  expires_date: string | null;
  is_sandbox: boolean;
  is_trial_period: boolean;
  will_renew: boolean;
  grace_period_expires_date: string | null;
}

interface ApiEntitlement {
  is_active: boolean;
  product_identifier: string;
  expires_date: string | null;
}

// Offerings API response types
interface ApiOfferingsResponse {
  current_offering_id: string | null;
  offerings: ApiOffering[];
}

interface ApiOffering {
  identifier: string;
  display_name: string | null;
  description: string | null;
  is_current: boolean;
  metadata: Record<string, string>;
  available_packages: ApiPackage[];
}

interface ApiPackage {
  identifier: string;
  display_name: string | null;
  description: string | null;
  package_type: string;
  products: ApiProduct[];
}

interface ApiProduct {
  store_product_id: string;
  platform: string;
  display_name: string | null;
  description: string | null;
  product_type: string;
  price: { amount: number; currency: string } | null;
  subscription_period: string | null;
  trial_period: string | null;
  metadata: Record<string, string>;
}

/**
 * MRRCat Error
 */
export class MRRCatError extends Error {
  code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'MRRCatError';
    this.code = code;
  }
}

/**
 * MRRCat React Native SDK
 */
class MRRCatSDK {
  private static instance: MRRCatSDK | null = null;

  private apiKey: string = '';
  private appUserID: string = '';
  private baseURL: string = 'https://mrrcat.ongoru.workers.dev';
  private useNativeIAP: boolean = true;

  private subscriberInfoCache: SubscriberInfo | null = null;
  private cacheExpiry: Date | null = null;
  private cacheDuration = 5 * 60 * 1000; // 5 minutes

  private listeners: Map<MRRCatEventType, Set<EventCallback>> = new Map();
  private iapModule: any = null;
  private iapEventEmitter: NativeEventEmitter | null = null;

  private constructor() {}

  /**
   * Configure MRRCat SDK
   */
  static async configure(config: MRRCatConfig): Promise<MRRCatSDK> {
    if (!MRRCatSDK.instance) {
      MRRCatSDK.instance = new MRRCatSDK();
    }

    const instance = MRRCatSDK.instance;
    instance.apiKey = config.apiKey;
    instance.baseURL = config.baseURL || 'https://mrrcat.ongoru.workers.dev';
    instance.useNativeIAP = config.useNativeIAP !== false;

    // Get or create app user ID
    if (config.appUserID) {
      instance.appUserID = config.appUserID;
    } else {
      instance.appUserID = await instance.getOrCreateAnonymousID();
    }

    // Initialize native IAP if available
    if (instance.useNativeIAP) {
      await instance.initializeNativeIAP();
    }

    // Fetch initial subscriber info
    try {
      await instance.getSubscriberInfo();
    } catch (e) {
      console.warn('MRRCat: Failed to fetch initial subscriber info:', e);
    }

    return instance;
  }

  /**
   * Get shared instance
   */
  static get shared(): MRRCatSDK {
    if (!MRRCatSDK.instance) {
      throw new MRRCatError('not_configured', 'MRRCat is not configured. Call MRRCat.configure() first.');
    }
    return MRRCatSDK.instance;
  }

  /**
   * Check if configured
   */
  static get isConfigured(): boolean {
    return MRRCatSDK.instance !== null && MRRCatSDK.instance.apiKey !== '';
  }

  /**
   * Current app user ID
   */
  get currentAppUserID(): string {
    return this.appUserID;
  }

  /**
   * Current cached subscriber info
   */
  get currentSubscriberInfo(): SubscriberInfo | null {
    return this.subscriberInfoCache;
  }

  /**
   * Initialize native IAP module
   */
  private async initializeNativeIAP(): Promise<void> {
    try {
      // Try to use react-native-iap if available
      const RNIap = require('react-native-iap');
      this.iapModule = RNIap;

      const isAvailable = await RNIap.initConnection();
      if (!isAvailable) {
        console.warn('MRRCat: Store is not available');
        return;
      }

      // Setup purchase listener
      this.iapEventEmitter = new NativeEventEmitter(NativeModules.RNIapModule);

      RNIap.purchaseUpdatedListener(async (purchase: any) => {
        await this.handlePurchase(purchase);
      });

      RNIap.purchaseErrorListener((error: any) => {
        this.emit({
          type: 'purchaseFailed',
          data: new MRRCatError('purchase_failed', error.message || 'Purchase failed'),
        });
      });
    } catch (e) {
      console.warn('MRRCat: react-native-iap not available, using API-only mode');
      this.useNativeIAP = false;
    }
  }

  /**
   * Get subscriber info
   */
  async getSubscriberInfo(forceRefresh = false): Promise<SubscriberInfo> {
    if (!forceRefresh && this.subscriberInfoCache && this.cacheExpiry && new Date() < this.cacheExpiry) {
      return this.subscriberInfoCache;
    }

    const response = await this.apiRequest<ApiSubscriberResponse>('GET', `/v1/subscribers/${this.appUserID}`);
    const info = this.parseSubscriberInfo(response.subscriber);

    this.subscriberInfoCache = info;
    this.cacheExpiry = new Date(Date.now() + this.cacheDuration);

    this.emit({ type: 'subscriberInfoUpdated', data: info });

    return info;
  }

  /**
   * Check if user has active entitlement
   */
  async hasEntitlement(identifier: string): Promise<boolean> {
    const info = await this.getSubscriberInfo();
    return info.entitlements[identifier]?.isActive ?? false;
  }

  /**
   * Check if any entitlement is active
   */
  async hasActiveSubscription(): Promise<boolean> {
    const info = await this.getSubscriberInfo();
    return Object.values(info.entitlements).some(e => e.isActive);
  }

  /**
   * Get all active entitlement identifiers
   */
  async getActiveEntitlements(): Promise<string[]> {
    const info = await this.getSubscriberInfo();
    return Object.entries(info.entitlements)
      .filter(([_, e]) => e.isActive)
      .map(([key]) => key);
  }

  /**
   * Identify user (login)
   */
  async identify(appUserID: string): Promise<SubscriberInfo> {
    this.appUserID = appUserID;
    this.subscriberInfoCache = null;
    this.cacheExpiry = null;
    return this.getSubscriberInfo();
  }

  /**
   * Log out and switch to anonymous user
   */
  async logOut(): Promise<SubscriberInfo> {
    this.appUserID = await this.getOrCreateAnonymousID(true);
    this.subscriberInfoCache = null;
    this.cacheExpiry = null;
    return this.getSubscriberInfo();
  }

  /**
   * Get available products
   */
  async getProducts(productIds: string[]): Promise<ProductDetails[]> {
    if (!this.useNativeIAP || !this.iapModule) {
      throw new MRRCatError('iap_unavailable', 'Native IAP is not available');
    }

    const products = await this.iapModule.getSubscriptions({ skus: productIds });

    return products.map((p: any) => ({
      productId: p.productId,
      title: p.title,
      description: p.description,
      price: p.localizedPrice,
      priceAmountMicros: p.price ? Math.round(parseFloat(p.price) * 1000000) : 0,
      priceCurrencyCode: p.currency,
      subscriptionPeriod: p.subscriptionPeriodUnitIOS || p.subscriptionPeriodAndroid,
      introductoryPrice: p.introductoryPrice,
    }));
  }

  /**
   * Purchase a product
   */
  async purchase(productId: string): Promise<SubscriberInfo> {
    if (!this.useNativeIAP || !this.iapModule) {
      throw new MRRCatError('iap_unavailable', 'Native IAP is not available');
    }

    try {
      await this.iapModule.requestSubscription({ sku: productId });

      // Wait for purchase to complete via listener
      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new MRRCatError('purchase_timeout', 'Purchase timed out'));
        }, 60000);

        const unsubscribe = this.on('subscriberInfoUpdated', (event) => {
          clearTimeout(timeout);
          unsubscribe();
          resolve(event.data as SubscriberInfo);
        });

        const errorUnsubscribe = this.on('purchaseFailed', (event) => {
          clearTimeout(timeout);
          errorUnsubscribe();
          reject(event.data);
        });
      });
    } catch (e: any) {
      if (e.code === 'E_USER_CANCELLED') {
        throw new MRRCatError('purchase_cancelled', 'Purchase was cancelled by user');
      }
      throw new MRRCatError('purchase_failed', e.message || 'Purchase failed');
    }
  }

  /**
   * Restore purchases
   */
  async restorePurchases(): Promise<SubscriberInfo> {
    if (!this.useNativeIAP || !this.iapModule) {
      throw new MRRCatError('iap_unavailable', 'Native IAP is not available');
    }

    try {
      const purchases = await this.iapModule.getAvailablePurchases();

      for (const purchase of purchases) {
        await this.syncPurchase(purchase);
      }

      this.emit({ type: 'restoreCompleted' });
      return this.getSubscriberInfo(true);
    } catch (e: any) {
      throw new MRRCatError('restore_failed', e.message || 'Restore failed');
    }
  }

  /**
   * Sync a Stripe subscription (web purchases)
   */
  async syncStripeSubscription(subscriptionId: string): Promise<SubscriberInfo> {
    const body = {
      app_user_id: this.appUserID,
      platform: 'stripe',
      receipt_data: {
        subscription_id: subscriptionId,
      },
    };

    await this.apiRequest('POST', '/v1/receipts', body);
    return this.getSubscriberInfo(true);
  }

  // Offerings
  private offeringsCache: Offerings | null = null;
  private offeringsCacheExpiry: Date | null = null;

  /**
   * Get offerings
   */
  async getOfferings(forceRefresh = false): Promise<Offerings> {
    if (!forceRefresh && this.offeringsCache && this.offeringsCacheExpiry && new Date() < this.offeringsCacheExpiry) {
      return this.offeringsCache;
    }

    const response = await this.apiRequest<ApiOfferingsResponse>('GET', `/v1/offerings?app_user_id=${this.appUserID}`);
    const offerings = this.parseOfferings(response);

    this.offeringsCache = offerings;
    this.offeringsCacheExpiry = new Date(Date.now() + this.cacheDuration);

    return offerings;
  }

  /**
   * Get current offering
   */
  async getCurrentOffering(): Promise<Offering | null> {
    const offerings = await this.getOfferings();
    return offerings.current;
  }

  /**
   * Get offering by identifier
   */
  async getOffering(identifier: string): Promise<Offering | null> {
    const offerings = await this.getOfferings();
    return offerings.all[identifier] || null;
  }

  private parseOfferings(response: ApiOfferingsResponse): Offerings {
    const all: Record<string, Offering> = {};
    let current: Offering | null = null;

    for (const offeringData of response.offerings) {
      const packages = offeringData.available_packages.map(pkg => ({
        identifier: pkg.identifier,
        displayName: pkg.display_name,
        description: pkg.description,
        packageType: pkg.package_type as PackageType,
        products: pkg.products.map(product => ({
          storeProductId: product.store_product_id,
          platform: product.platform as Platform,
          displayName: product.display_name,
          description: product.description,
          productType: product.product_type as ProductType,
          price: product.price,
          subscriptionPeriod: product.subscription_period,
          trialPeriod: product.trial_period,
          metadata: product.metadata || {},
        })),
      }));

      const offering: Offering = {
        identifier: offeringData.identifier,
        displayName: offeringData.display_name,
        description: offeringData.description,
        isCurrent: offeringData.is_current || false,
        metadata: offeringData.metadata || {},
        availablePackages: packages,
        monthly: packages.find(p => p.packageType === 'monthly'),
        annual: packages.find(p => p.packageType === 'annual'),
        weekly: packages.find(p => p.packageType === 'weekly'),
        lifetime: packages.find(p => p.packageType === 'lifetime'),
      };

      all[offering.identifier] = offering;

      if (offeringData.identifier === response.current_offering_id) {
        current = offering;
      }
    }

    return { current, all };
  }

  /**
   * Handle purchase from native IAP
   */
  private async handlePurchase(purchase: any): Promise<void> {
    try {
      await this.syncPurchase(purchase);

      // Acknowledge/finish the purchase
      if (this.iapModule) {
        if (Platform.OS === 'ios') {
          await this.iapModule.finishTransaction({ purchase });
        } else {
          await this.iapModule.acknowledgePurchaseAndroid({
            token: purchase.purchaseToken,
          });
        }
      }

      const info = await this.getSubscriberInfo(true);
      this.emit({ type: 'purchaseCompleted', data: info });
    } catch (e) {
      console.error('MRRCat: Failed to handle purchase:', e);
      this.emit({
        type: 'purchaseFailed',
        data: new MRRCatError('sync_failed', 'Failed to sync purchase'),
      });
    }
  }

  /**
   * Sync purchase to MRRCat backend
   */
  private async syncPurchase(purchase: any): Promise<void> {
    const platform = Platform.OS === 'ios' ? 'ios' : 'android';

    const body: any = {
      app_user_id: this.appUserID,
      platform,
      receipt_data: {
        product_id: purchase.productId,
      },
    };

    if (Platform.OS === 'ios') {
      body.receipt_data.transaction_id = purchase.transactionId;
    } else {
      body.receipt_data.purchase_token = purchase.purchaseToken;
    }

    await this.apiRequest('POST', '/v1/receipts', body);
  }

  /**
   * Add event listener
   */
  on(event: MRRCatEventType, callback: EventCallback): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(callback);

    // Return unsubscribe function
    return () => {
      this.listeners.get(event)?.delete(callback);
    };
  }

  /**
   * Remove event listener
   */
  off(event: MRRCatEventType, callback: EventCallback): void {
    this.listeners.get(event)?.delete(callback);
  }

  private emit(event: MRRCatEvent): void {
    this.listeners.get(event.type)?.forEach(callback => {
      try {
        callback(event);
      } catch (e) {
        console.error('MRRCat event listener error:', e);
      }
    });
  }

  private async getOrCreateAnonymousID(forceNew = false): Promise<string> {
    const storageKey = 'mrrcat_anonymous_id';

    if (!forceNew) {
      try {
        const stored = await AsyncStorage.getItem(storageKey);
        if (stored) return stored;
      } catch (e) {
        // AsyncStorage not available
      }
    }

    const id = `$anon_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;

    try {
      await AsyncStorage.setItem(storageKey, id);
    } catch (e) {
      // AsyncStorage not available
    }

    return id;
  }

  private async apiRequest<T>(method: string, path: string, body?: unknown): Promise<T> {
    const url = `${this.baseURL}${path}`;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-API-Key': this.apiKey,
      'User-Agent': `MRRCat-ReactNative/1.0.0 ${Platform.OS}`,
    };

    const options: RequestInit = {
      method,
      headers,
    };

    if (body) {
      options.body = JSON.stringify(body);
    }

    const response = await fetch(url, options);
    const data = await response.json();

    if (!response.ok) {
      throw new MRRCatError(data.error?.code || 'unknown', data.error?.message || 'Request failed');
    }

    return data as T;
  }

  private parseSubscriberInfo(data: ApiSubscriberResponse['subscriber']): SubscriberInfo {
    const subscriptions: Record<string, Subscription> = {};
    for (const [key, value] of Object.entries(data.subscriptions || {})) {
      subscriptions[key] = {
        platform: value.platform as Platform,
        productID: value.product_id,
        status: value.status as SubscriptionStatus,
        purchaseDate: new Date(value.purchase_date),
        expiresDate: value.expires_date ? new Date(value.expires_date) : null,
        isSandbox: value.is_sandbox,
        isTrialPeriod: value.is_trial_period,
        willRenew: value.will_renew,
        gracePeriodExpiresDate: value.grace_period_expires_date ? new Date(value.grace_period_expires_date) : null,
      };
    }

    const entitlements: Record<string, Entitlement> = {};
    for (const [key, value] of Object.entries(data.entitlements || {})) {
      entitlements[key] = {
        isActive: value.is_active,
        productIdentifier: value.product_identifier,
        expiresDate: value.expires_date ? new Date(value.expires_date) : null,
      };
    }

    return {
      originalAppUserID: data.original_app_user_id,
      firstSeen: new Date(data.first_seen),
      subscriptions,
      entitlements,
    };
  }
}

// Export hooks
export {
  useSubscriberInfo,
  useEntitlement,
  useHasActiveSubscription,
  useProducts,
  usePurchase,
  useAppUserID,
} from './hooks';

// Export class and convenience alias
export { MRRCatSDK as MRRCat };
export default MRRCatSDK;
