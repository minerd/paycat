/**
 * PayCat Web Implementation for Capacitor
 */

import { WebPlugin } from '@capacitor/core';

import type {
  PayCatPlugin,
  ConfigureOptions,
  LoginOptions,
  SubscriberInfo,
  Offerings,
  PurchaseOptions,
  PurchaseResult,
  EntitlementOptions,
  EntitlementResult,
  AttributesOptions,
  PaywallOptions,
  PaywallResult,
  PaywallPresentResult,
  TrackEventOptions,
  PluginListenerHandle,
} from './definitions';

const DEFAULT_BASE_URL = 'https://api.paycat.dev';

export class PayCatWeb extends WebPlugin implements PayCatPlugin {
  private apiKey: string = '';
  private baseUrl: string = DEFAULT_BASE_URL;
  private appUserId: string | null = null;
  private debugEnabled: boolean = false;
  private paywallIframe: HTMLIFrameElement | null = null;

  async configure(options: ConfigureOptions): Promise<void> {
    this.apiKey = options.apiKey;
    this.debugEnabled = options.debugLogsEnabled ?? false;

    if (options.appUserId) {
      this.appUserId = options.appUserId;
    }

    if (options.useSandbox) {
      this.baseUrl = 'https://sandbox.api.paycat.dev';
    }

    this.log('PayCat configured');
  }

  async login(options: LoginOptions): Promise<SubscriberInfo> {
    this.appUserId = options.appUserId;
    return this.getSubscriberInfo();
  }

  async logout(): Promise<void> {
    this.appUserId = null;
  }

  async getSubscriberInfo(): Promise<SubscriberInfo> {
    if (!this.appUserId) {
      throw new Error('No user logged in');
    }

    const response = await this.request(`/v1/subscribers/${this.appUserId}`);
    return this.mapSubscriberInfo(response.subscriber);
  }

  async getOfferings(): Promise<Offerings> {
    const response = await this.request('/v1/offerings');

    const offerings: Offerings = {
      current: null,
      all: {},
    };

    if (response.offerings) {
      for (const offering of response.offerings) {
        const mapped = this.mapOffering(offering);
        offerings.all[offering.identifier] = mapped;

        if (offering.is_current) {
          offerings.current = mapped;
        }
      }
    }

    return offerings;
  }

  async purchasePackage(options: PurchaseOptions): Promise<PurchaseResult> {
    // On web, we typically redirect to a checkout flow
    // This is a simplified implementation
    throw new Error(
      'Direct purchases are not supported on web. Use presentPaywall() for web checkout.'
    );
  }

  async restorePurchases(): Promise<SubscriberInfo> {
    // Refresh subscriber info from server
    return this.getSubscriberInfo();
  }

  async checkEntitlement(options: EntitlementOptions): Promise<EntitlementResult> {
    const subscriber = await this.getSubscriberInfo();
    const entitlement = subscriber.entitlements[options.identifier];

    return {
      isActive: entitlement?.isActive ?? false,
      entitlement: entitlement ?? null,
    };
  }

  async setAttributes(options: AttributesOptions): Promise<void> {
    if (!this.appUserId) {
      throw new Error('No user logged in');
    }

    await this.request(`/v1/subscribers/${this.appUserId}/attributes`, {
      method: 'POST',
      body: JSON.stringify({ attributes: options.attributes }),
    });
  }

  async getPaywall(options?: PaywallOptions): Promise<PaywallResult> {
    const identifier = options?.identifier || 'default';
    const locale = options?.locale || 'en';

    const response = await this.request(
      `/v1/paywalls/${identifier}?locale=${locale}`
    );

    return {
      templateId: response.template.id,
      templateType: response.template.template_type,
      offering: this.mapOffering(response.template.offering || {}),
      config: response.template.config,
    };
  }

  async presentPaywall(options?: PaywallOptions): Promise<PaywallPresentResult> {
    return new Promise((resolve) => {
      const identifier = options?.identifier || 'current';
      const locale = options?.locale || 'en';

      // Create overlay
      const overlay = document.createElement('div');
      overlay.id = 'paycat-paywall-overlay';
      overlay.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.5);
        z-index: 999999;
        display: flex;
        justify-content: center;
        align-items: center;
      `;

      // Create iframe
      const iframe = document.createElement('iframe');
      iframe.style.cssText = `
        width: 90%;
        max-width: 480px;
        height: 85%;
        max-height: 700px;
        border: none;
        border-radius: 16px;
        background: white;
        box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
      `;
      iframe.src = `${this.baseUrl}/v1/paywalls/${identifier}/render?locale=${locale}&api_key=${this.apiKey}`;

      this.paywallIframe = iframe;

      // Handle messages from iframe
      const messageHandler = async (event: MessageEvent) => {
        if (event.origin !== new URL(this.baseUrl).origin) return;

        const { type, data } = event.data;

        switch (type) {
          case 'paycat:close':
            this.dismissPaywall();
            window.removeEventListener('message', messageHandler);
            resolve({ presented: true, purchased: false, restored: false });
            break;

          case 'paycat:purchase':
            this.dismissPaywall();
            window.removeEventListener('message', messageHandler);
            const subscriber = await this.getSubscriberInfo();
            resolve({
              presented: true,
              purchased: true,
              restored: false,
              subscriber,
            });
            break;

          case 'paycat:restore':
            this.dismissPaywall();
            window.removeEventListener('message', messageHandler);
            const restoredSubscriber = await this.restorePurchases();
            resolve({
              presented: true,
              purchased: false,
              restored: true,
              subscriber: restoredSubscriber,
            });
            break;
        }
      };

      window.addEventListener('message', messageHandler);

      // Close on overlay click
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
          this.dismissPaywall();
          window.removeEventListener('message', messageHandler);
          resolve({ presented: true, purchased: false, restored: false });
        }
      });

      overlay.appendChild(iframe);
      document.body.appendChild(overlay);
    });
  }

  private dismissPaywall(): void {
    const overlay = document.getElementById('paycat-paywall-overlay');
    if (overlay) {
      overlay.remove();
    }
    this.paywallIframe = null;
  }

  async trackEvent(options: TrackEventOptions): Promise<void> {
    await this.request('/v1/events', {
      method: 'POST',
      body: JSON.stringify({
        app_user_id: this.appUserId,
        event_name: options.eventName,
        event_properties: options.properties,
        timestamp: new Date().toISOString(),
      }),
    });
  }

  // Helper methods
  private async request(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<any> {
    const url = `${this.baseUrl}${endpoint}`;

    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': this.apiKey,
        ...options.headers,
      },
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error?.message || `Request failed: ${response.status}`);
    }

    return response.json();
  }

  private mapSubscriberInfo(data: any): SubscriberInfo {
    const entitlements: Record<string, any> = {};
    const subscriptions: Record<string, any> = {};

    if (data.entitlements) {
      for (const [key, ent] of Object.entries(data.entitlements) as any[]) {
        entitlements[key] = {
          identifier: key,
          isActive: ent.is_active,
          willRenew: ent.will_renew,
          productIdentifier: ent.product_identifier,
          expiresDate: ent.expires_date,
          purchaseDate: ent.purchase_date,
          isSandbox: ent.is_sandbox,
          store: ent.store,
        };
      }
    }

    if (data.subscriptions) {
      for (const [key, sub] of Object.entries(data.subscriptions) as any[]) {
        subscriptions[key] = {
          productIdentifier: key,
          purchaseDate: sub.purchase_date,
          expiresDate: sub.expires_date,
          store: sub.store,
          isSandbox: sub.is_sandbox,
          willRenew: sub.will_renew,
          isActive: sub.is_active,
          isTrial: sub.is_trial,
          isIntroOffer: sub.is_intro_offer,
          periodType: sub.is_trial ? 'trial' : sub.is_intro_offer ? 'intro' : 'normal',
        };
      }
    }

    return {
      originalAppUserId: data.original_app_user_id,
      firstSeen: data.first_seen,
      lastSeen: data.last_seen,
      entitlements,
      subscriptions,
      nonSubscriptionPurchases: {},
      attributes: data.attributes || {},
    };
  }

  private mapOffering(data: any): any {
    const packages = (data.packages || []).map((pkg: any) => ({
      identifier: pkg.identifier,
      packageType: pkg.package_type,
      offeringIdentifier: data.identifier,
      product: pkg.product ? {
        identifier: pkg.product.store_product_id,
        description: pkg.product.description || '',
        title: pkg.product.display_name || '',
        price: pkg.product.price?.amount || 0,
        priceString: `${pkg.product.price?.currency || '$'}${pkg.product.price?.amount || 0}`,
        currencyCode: pkg.product.price?.currency || 'USD',
      } : null,
    }));

    return {
      identifier: data.identifier,
      serverDescription: data.description || '',
      metadata: data.metadata || {},
      availablePackages: packages,
      lifetime: packages.find((p: any) => p.packageType === 'lifetime') || null,
      annual: packages.find((p: any) => p.packageType === 'annual') || null,
      sixMonth: packages.find((p: any) => p.packageType === 'six_month') || null,
      threeMonth: packages.find((p: any) => p.packageType === 'three_month') || null,
      twoMonth: packages.find((p: any) => p.packageType === 'two_month') || null,
      monthly: packages.find((p: any) => p.packageType === 'monthly') || null,
      weekly: packages.find((p: any) => p.packageType === 'weekly') || null,
    };
  }

  private log(...args: any[]): void {
    if (this.debugEnabled) {
      console.log('[PayCat]', ...args);
    }
  }
}
