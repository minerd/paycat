/**
 * MRRCat Web SDK
 * Unified subscription management for web applications
 */

// Types
export interface MRRCatConfig {
  /** Your MRRCat API key */
  apiKey: string;
  /** Your MRRCat API URL (e.g., "https://mrrcat.yourdomain.com") */
  baseURL: string;
  /** Optional user ID. If not provided, an anonymous ID will be generated */
  appUserID?: string;
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
}

export interface Package {
  identifier: string;
  displayName: string | null;
  description: string | null;
  packageType: PackageType;
  products: ProductInfo[];
}

export interface ProductInfo {
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

export type MRRCatEventType = 'subscriberInfoUpdated' | 'error' | 'paywallEvent';

export interface MRRCatEvent {
  type: MRRCatEventType;
  data?: SubscriberInfo | Error | PaywallEvent;
}

// Paywall Types
export interface PaywallTemplate {
  id: string;
  identifier: string;
  name: string;
  description: string | null;
  templateType: 'single' | 'multi' | 'feature_list' | 'comparison' | 'minimal';
  isDefault: boolean;
}

export interface PaywallEvent {
  eventType: 'impression' | 'close' | 'purchase_started' | 'purchase_completed' | 'purchase_failed' | 'restore_started';
  templateId: string;
  packageId?: string;
  productId?: string;
}

export interface PaywallOptions {
  templateIdentifier?: string;
  locale?: string;
  onPurchase?: (packageId: string) => Promise<void>;
  onRestore?: () => Promise<void>;
  onClose?: () => void;
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

interface ApiError {
  error: {
    code: string;
    message: string;
  };
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
  constructor(
    public code: string,
    message: string
  ) {
    super(message);
    this.name = 'MRRCatError';
  }
}

/**
 * MRRCat SDK
 */
export class MRRCat {
  private static instance: MRRCat | null = null;

  private apiKey: string;
  private appUserID: string;
  private baseURL: string;
  private subscriberInfoCache: SubscriberInfo | null = null;
  private cacheExpiry: Date | null = null;
  private cacheDuration = 5 * 60 * 1000; // 5 minutes
  private listeners: Map<MRRCatEventType, Set<EventCallback>> = new Map();

  private constructor(config: MRRCatConfig) {
    this.apiKey = config.apiKey;
    this.baseURL = config.baseURL;
    this.appUserID = config.appUserID || this.getOrCreateAnonymousID();
  }

  /**
   * Configure MRRCat SDK
   */
  static configure(config: MRRCatConfig): MRRCat {
    if (!MRRCat.instance) {
      MRRCat.instance = new MRRCat(config);
    }
    return MRRCat.instance;
  }

  /**
   * Get shared instance
   */
  static get shared(): MRRCat {
    if (!MRRCat.instance) {
      throw new MRRCatError('not_configured', 'MRRCat is not configured. Call MRRCat.configure() first.');
    }
    return MRRCat.instance;
  }

  /**
   * Check if configured
   */
  static get isConfigured(): boolean {
    return MRRCat.instance !== null;
  }

  /**
   * Current app user ID
   */
  get currentAppUserID(): string {
    return this.appUserID;
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
    this.appUserID = this.getOrCreateAnonymousID(true);
    this.subscriberInfoCache = null;
    this.cacheExpiry = null;
    return this.getSubscriberInfo();
  }

  /**
   * Sync Stripe subscription
   */
  async syncStripeSubscription(subscriptionId: string): Promise<SubscriberInfo> {
    const body = {
      app_user_id: this.appUserID,
      platform: 'stripe',
      receipt_data: {
        subscription_id: subscriptionId,
      },
    };

    await this.apiRequest<ApiSubscriberResponse>('POST', '/v1/receipts', body);
    return this.getSubscriberInfo(true);
  }

  /**
   * Get management URL for Stripe billing portal
   */
  getManagementURL(): string {
    // This would typically redirect to Stripe's customer portal
    return `${this.baseURL}/v1/subscribers/${this.appUserID}/manage`;
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

  // =====================================================
  // PAYWALLS
  // =====================================================

  private paywallContainer: HTMLElement | null = null;
  private paywallIframe: HTMLIFrameElement | null = null;
  private paywallOptions: PaywallOptions | null = null;

  /**
   * Get available paywall templates
   */
  async getPaywallTemplates(): Promise<PaywallTemplate[]> {
    interface ApiPaywallResponse {
      templates: Array<{
        id: string;
        identifier: string;
        name: string;
        description: string | null;
        template_type: string;
        is_default: boolean;
      }>;
    }

    const response = await this.apiRequest<ApiPaywallResponse>('GET', '/v1/paywalls');
    return response.templates.map(t => ({
      id: t.id,
      identifier: t.identifier,
      name: t.name,
      description: t.description,
      templateType: t.template_type as PaywallTemplate['templateType'],
      isDefault: t.is_default,
    }));
  }

  /**
   * Present paywall
   */
  async presentPaywall(options: PaywallOptions = {}): Promise<void> {
    this.paywallOptions = options;

    // Create container
    this.paywallContainer = document.createElement('div');
    this.paywallContainer.id = 'mrrcat-paywall-container';
    this.paywallContainer.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.5);
      z-index: 999999;
      display: flex;
      align-items: center;
      justify-content: center;
      animation: mrrcatFadeIn 0.3s ease-out;
    `;

    // Add animation styles
    const style = document.createElement('style');
    style.textContent = `
      @keyframes mrrcatFadeIn {
        from { opacity: 0; }
        to { opacity: 1; }
      }
      @keyframes mrrcatSlideUp {
        from { transform: translateY(100%); }
        to { transform: translateY(0); }
      }
    `;
    document.head.appendChild(style);

    // Create iframe
    this.paywallIframe = document.createElement('iframe');
    const templateId = options.templateIdentifier || 'current';
    const locale = options.locale || 'en';
    this.paywallIframe.src = `${this.baseURL}/v1/paywalls/${templateId}/render?locale=${locale}&app_user_id=${this.appUserID}`;
    this.paywallIframe.style.cssText = `
      width: 100%;
      max-width: 500px;
      height: 90vh;
      max-height: 800px;
      border: none;
      border-radius: 16px;
      background: white;
      animation: mrrcatSlideUp 0.3s ease-out;
    `;

    this.paywallContainer.appendChild(this.paywallIframe);
    document.body.appendChild(this.paywallContainer);

    // Listen for messages from iframe
    window.addEventListener('message', this.handlePaywallMessage);

    // Close on backdrop click
    this.paywallContainer.addEventListener('click', (e) => {
      if (e.target === this.paywallContainer) {
        this.dismissPaywall();
      }
    });

    // Track impression
    this.trackPaywallEvent('impression', templateId);
  }

  /**
   * Dismiss paywall
   */
  dismissPaywall(): void {
    if (this.paywallContainer) {
      this.paywallContainer.remove();
      this.paywallContainer = null;
    }
    if (this.paywallIframe) {
      this.paywallIframe = null;
    }
    window.removeEventListener('message', this.handlePaywallMessage);

    this.paywallOptions?.onClose?.();
    this.paywallOptions = null;
  }

  /**
   * Track paywall event
   */
  async trackPaywallEvent(
    eventType: PaywallEvent['eventType'],
    templateId: string,
    packageId?: string,
    productId?: string
  ): Promise<void> {
    try {
      await this.apiRequest('POST', `/v1/paywalls/${templateId}/events`, {
        event_type: eventType,
        app_user_id: this.appUserID,
        package_id: packageId,
        product_id: productId,
        platform: 'web',
        locale: navigator.language,
      });

      this.emit({
        type: 'paywallEvent',
        data: { eventType, templateId, packageId, productId },
      });
    } catch (error) {
      console.error('Failed to track paywall event:', error);
    }
  }

  private handlePaywallMessage = async (event: MessageEvent) => {
    if (!event.data?.type?.startsWith('mrrcat_')) return;

    const { type, packageId, eventType, data } = event.data;

    switch (type) {
      case 'mrrcat_purchase':
        if (this.paywallOptions?.onPurchase && packageId) {
          try {
            await this.paywallOptions.onPurchase(packageId);
            this.trackPaywallEvent('purchase_completed', 'current', packageId);
          } catch (error) {
            this.trackPaywallEvent('purchase_failed', 'current', packageId);
          }
        }
        break;

      case 'mrrcat_trial':
        if (this.paywallOptions?.onPurchase && packageId) {
          await this.paywallOptions.onPurchase(packageId);
        }
        break;

      case 'mrrcat_restore':
        if (this.paywallOptions?.onRestore) {
          this.trackPaywallEvent('restore_started', 'current');
          await this.paywallOptions.onRestore();
        }
        break;

      case 'mrrcat_close':
        this.trackPaywallEvent('close', 'current');
        this.dismissPaywall();
        break;

      case 'mrrcat_event':
        if (eventType && data) {
          this.trackPaywallEvent(eventType, 'current', data.package_id);
        }
        break;
    }
  };

  private parseOfferings(response: ApiOfferingsResponse): Offerings {
    const all: Record<string, Offering> = {};
    let current: Offering | null = null;

    for (const offeringData of response.offerings) {
      const offering: Offering = {
        identifier: offeringData.identifier,
        displayName: offeringData.display_name,
        description: offeringData.description,
        isCurrent: offeringData.is_current || false,
        metadata: offeringData.metadata || {},
        availablePackages: offeringData.available_packages.map(pkg => ({
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
        })),
      };

      all[offering.identifier] = offering;

      if (offeringData.identifier === response.current_offering_id) {
        current = offering;
      }
    }

    return { current, all };
  }

  /**
   * Add event listener
   */
  on(event: MRRCatEventType, callback: EventCallback): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(callback);
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

  private getOrCreateAnonymousID(forceNew = false): string {
    const storageKey = 'mrrcat_anonymous_id';

    if (!forceNew && typeof localStorage !== 'undefined') {
      const stored = localStorage.getItem(storageKey);
      if (stored) return stored;
    }

    const id = `$anon_${crypto.randomUUID()}`;

    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(storageKey, id);
    }

    return id;
  }

  private async apiRequest<T>(method: string, path: string, body?: unknown): Promise<T> {
    const url = `${this.baseURL}${path}`;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-API-Key': this.apiKey,
      'User-Agent': 'MRRCat-Web/1.0.0',
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
      const error = data as ApiError;
      throw new MRRCatError(error.error?.code || 'unknown', error.error?.message || 'Request failed');
    }

    return data as T;
  }

  private parseSubscriberInfo(data: ApiSubscriberResponse['subscriber']): SubscriberInfo {
    const subscriptions: Record<string, Subscription> = {};
    for (const [key, value] of Object.entries(data.subscriptions)) {
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
    for (const [key, value] of Object.entries(data.entitlements)) {
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

// Default export
export default MRRCat;
