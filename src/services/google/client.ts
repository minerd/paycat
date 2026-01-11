/**
 * Google Play Developer API Client
 */

import { getGoogleAccessToken } from './auth';
import { Errors } from '../../middleware/error';
import type {
  GoogleConfig,
  SubscriptionPurchaseV2,
  ProductPurchase,
} from './types';

const ENDPOINT = 'https://androidpublisher.googleapis.com';

export class GooglePlayClient {
  private config: GoogleConfig;

  constructor(config: GoogleConfig) {
    this.config = config;
  }

  /**
   * Make authenticated request to Google Play Developer API
   */
  private async request<T>(
    method: string,
    path: string,
    body?: unknown
  ): Promise<T> {
    const accessToken = await getGoogleAccessToken(this.config);

    const response = await fetch(`${ENDPOINT}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw Errors.platformError(
        'Google Play',
        (error as { error?: { message?: string } })?.error?.message ||
          `HTTP ${response.status}`,
        { status: response.status }
      );
    }

    return response.json() as Promise<T>;
  }

  /**
   * Get subscription purchase (V2 API)
   */
  async getSubscriptionV2(purchaseToken: string): Promise<SubscriptionPurchaseV2> {
    const path = `/androidpublisher/v3/applications/${this.config.packageName}/purchases/subscriptionsv2/tokens/${purchaseToken}`;
    return this.request<SubscriptionPurchaseV2>('GET', path);
  }

  /**
   * Acknowledge subscription purchase
   */
  async acknowledgeSubscription(
    subscriptionId: string,
    purchaseToken: string
  ): Promise<void> {
    const path = `/androidpublisher/v3/applications/${this.config.packageName}/purchases/subscriptions/${subscriptionId}/tokens/${purchaseToken}:acknowledge`;
    await this.request('POST', path, {});
  }

  /**
   * Get product purchase (one-time)
   */
  async getProductPurchase(
    productId: string,
    purchaseToken: string
  ): Promise<ProductPurchase> {
    const path = `/androidpublisher/v3/applications/${this.config.packageName}/purchases/products/${productId}/tokens/${purchaseToken}`;
    return this.request<ProductPurchase>('GET', path);
  }

  /**
   * Acknowledge product purchase
   */
  async acknowledgeProductPurchase(
    productId: string,
    purchaseToken: string
  ): Promise<void> {
    const path = `/androidpublisher/v3/applications/${this.config.packageName}/purchases/products/${productId}/tokens/${purchaseToken}:acknowledge`;
    await this.request('POST', path, {});
  }

  /**
   * Consume product purchase
   */
  async consumeProductPurchase(
    productId: string,
    purchaseToken: string
  ): Promise<void> {
    const path = `/androidpublisher/v3/applications/${this.config.packageName}/purchases/products/${productId}/tokens/${purchaseToken}:consume`;
    await this.request('POST', path, {});
  }

  /**
   * Cancel subscription (immediate)
   */
  async cancelSubscription(
    subscriptionId: string,
    purchaseToken: string
  ): Promise<void> {
    const path = `/androidpublisher/v3/applications/${this.config.packageName}/purchases/subscriptions/${subscriptionId}/tokens/${purchaseToken}:cancel`;
    await this.request('POST', path, {});
  }

  /**
   * Revoke subscription (immediate refund)
   */
  async revokeSubscription(
    subscriptionId: string,
    purchaseToken: string
  ): Promise<void> {
    const path = `/androidpublisher/v3/applications/${this.config.packageName}/purchases/subscriptions/${subscriptionId}/tokens/${purchaseToken}:revoke`;
    await this.request('POST', path, {});
  }

  /**
   * Defer subscription (extend without charging)
   */
  async deferSubscription(
    subscriptionId: string,
    purchaseToken: string,
    expectedExpiryTimeMillis: string,
    desiredExpiryTimeMillis: string
  ): Promise<{ newExpiryTimeMillis: string }> {
    const path = `/androidpublisher/v3/applications/${this.config.packageName}/purchases/subscriptions/${subscriptionId}/tokens/${purchaseToken}:defer`;
    return this.request('POST', path, {
      deferralInfo: {
        expectedExpiryTimeMillis,
        desiredExpiryTimeMillis,
      },
    });
  }

  /**
   * Refund subscription
   */
  async refundSubscription(
    subscriptionId: string,
    purchaseToken: string,
    proratedRefund: boolean = false
  ): Promise<void> {
    const path = `/androidpublisher/v3/applications/${this.config.packageName}/purchases/subscriptions/${subscriptionId}/tokens/${purchaseToken}:refund`;
    await this.request('POST', path, { proratedRefund });
  }

  /**
   * Get voided purchases
   */
  async getVoidedPurchases(
    startTime: number,
    endTime?: number,
    maxResults: number = 100,
    token?: string
  ): Promise<{
    voidedPurchases: Array<{
      purchaseToken: string;
      purchaseTimeMillis: string;
      voidedTimeMillis: string;
      orderId: string;
      voidedSource: number;
      voidedReason: number;
      kind: string;
    }>;
    pageInfo: {
      totalResults: number;
      resultPerPage: number;
      startIndex: number;
    };
    tokenPagination: {
      nextPageToken: string;
    };
  }> {
    let path = `/androidpublisher/v3/applications/${this.config.packageName}/purchases/voidedpurchases?startTime=${startTime}&maxResults=${maxResults}`;
    if (endTime) {
      path += `&endTime=${endTime}`;
    }
    if (token) {
      path += `&token=${token}`;
    }
    return this.request('GET', path);
  }
}

/**
 * Create Google Play client from app config
 */
export function createGoogleClient(configJson: string): GooglePlayClient {
  const config = JSON.parse(configJson) as GoogleConfig;
  return new GooglePlayClient(config);
}
