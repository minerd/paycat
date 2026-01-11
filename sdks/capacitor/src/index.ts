/**
 * PayCat Capacitor Plugin
 */

import { registerPlugin } from '@capacitor/core';

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
  PurchaseEvent,
} from './definitions';

// Register the native plugin
const PayCatNative = registerPlugin<PayCatPlugin>('PayCat', {
  web: () => import('./web').then(m => new m.PayCatWeb()),
});

/**
 * PayCat SDK - Main entry point
 */
class PayCat {
  private static instance: PayCat;
  private plugin: PayCatPlugin;
  private configured = false;

  private constructor() {
    this.plugin = PayCatNative;
  }

  /**
   * Get singleton instance
   */
  static getInstance(): PayCat {
    if (!PayCat.instance) {
      PayCat.instance = new PayCat();
    }
    return PayCat.instance;
  }

  /**
   * Configure the SDK
   */
  async configure(options: ConfigureOptions): Promise<void> {
    await this.plugin.configure(options);
    this.configured = true;
  }

  /**
   * Check if SDK is configured
   */
  isConfigured(): boolean {
    return this.configured;
  }

  /**
   * Log in user
   */
  async login(appUserId: string): Promise<SubscriberInfo> {
    this.ensureConfigured();
    return this.plugin.login({ appUserId });
  }

  /**
   * Log out user
   */
  async logout(): Promise<void> {
    this.ensureConfigured();
    return this.plugin.logout();
  }

  /**
   * Get subscriber info
   */
  async getSubscriberInfo(): Promise<SubscriberInfo> {
    this.ensureConfigured();
    return this.plugin.getSubscriberInfo();
  }

  /**
   * Get offerings
   */
  async getOfferings(): Promise<Offerings> {
    this.ensureConfigured();
    return this.plugin.getOfferings();
  }

  /**
   * Purchase a package
   */
  async purchasePackage(
    packageIdentifier: string,
    offeringIdentifier?: string
  ): Promise<PurchaseResult> {
    this.ensureConfigured();
    return this.plugin.purchasePackage({
      packageIdentifier,
      offeringIdentifier,
    });
  }

  /**
   * Restore purchases
   */
  async restorePurchases(): Promise<SubscriberInfo> {
    this.ensureConfigured();
    return this.plugin.restorePurchases();
  }

  /**
   * Check if user has entitlement
   */
  async checkEntitlement(identifier: string): Promise<boolean> {
    this.ensureConfigured();
    const result = await this.plugin.checkEntitlement({ identifier });
    return result.isActive;
  }

  /**
   * Get entitlement details
   */
  async getEntitlement(identifier: string): Promise<EntitlementResult> {
    this.ensureConfigured();
    return this.plugin.checkEntitlement({ identifier });
  }

  /**
   * Set user attributes
   */
  async setAttributes(attributes: Record<string, string | null>): Promise<void> {
    this.ensureConfigured();
    return this.plugin.setAttributes({ attributes });
  }

  /**
   * Set single attribute
   */
  async setAttribute(key: string, value: string | null): Promise<void> {
    return this.setAttributes({ [key]: value });
  }

  /**
   * Get paywall data
   */
  async getPaywall(identifier?: string, locale?: string): Promise<PaywallResult> {
    this.ensureConfigured();
    return this.plugin.getPaywall({ identifier, locale });
  }

  /**
   * Present paywall UI
   */
  async presentPaywall(
    identifier?: string,
    locale?: string
  ): Promise<PaywallPresentResult> {
    this.ensureConfigured();
    return this.plugin.presentPaywall({ identifier, locale });
  }

  /**
   * Track custom event
   */
  async trackEvent(
    eventName: string,
    properties?: Record<string, unknown>
  ): Promise<void> {
    this.ensureConfigured();
    return this.plugin.trackEvent({ eventName, properties });
  }

  /**
   * Add subscription update listener
   */
  async addSubscriptionUpdateListener(
    listener: (info: SubscriberInfo) => void
  ): Promise<PluginListenerHandle> {
    return this.plugin.addListener('subscriptionUpdated', listener);
  }

  /**
   * Add purchase completed listener
   */
  async addPurchaseCompletedListener(
    listener: (event: PurchaseEvent) => void
  ): Promise<PluginListenerHandle> {
    return this.plugin.addListener('purchaseCompleted', listener);
  }

  /**
   * Add purchase failed listener
   */
  async addPurchaseFailedListener(
    listener: (event: PurchaseEvent) => void
  ): Promise<PluginListenerHandle> {
    return this.plugin.addListener('purchaseFailed', listener);
  }

  /**
   * Remove all listeners
   */
  async removeAllListeners(): Promise<void> {
    return this.plugin.removeAllListeners();
  }

  /**
   * Ensure SDK is configured
   */
  private ensureConfigured(): void {
    if (!this.configured) {
      throw new Error('PayCat SDK not configured. Call configure() first.');
    }
  }
}

// Export singleton
export const paycat = PayCat.getInstance();

// Export types
export * from './definitions';

// Export default
export default paycat;
