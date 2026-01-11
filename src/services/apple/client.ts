/**
 * Apple App Store Server API Client
 */

import { createAppleJWT, decodeAppleSignedData } from './jwt';
import { Errors } from '../../middleware/error';
import type {
  AppleConfig,
  TransactionHistoryResponse,
  StatusResponse,
  TransactionInfoResponse,
  JWSTransactionDecodedPayload,
  JWSRenewalInfoDecodedPayload,
  AppleErrorResponse,
} from './types';

const ENDPOINTS = {
  production: 'https://api.storekit.itunes.apple.com',
  sandbox: 'https://api.storekit-sandbox.itunes.apple.com',
} as const;

export class AppleAppStoreClient {
  private config: AppleConfig;
  private baseUrl: string;

  constructor(config: AppleConfig) {
    this.config = config;
    this.baseUrl = ENDPOINTS[config.environment];
  }

  /**
   * Make authenticated request to App Store Server API
   */
  private async request<T>(
    method: string,
    path: string,
    body?: unknown
  ): Promise<T> {
    const token = await createAppleJWT(this.config);

    const response = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      const error = (await response.json()) as AppleErrorResponse;
      throw Errors.platformError(
        'Apple',
        error.errorMessage || `HTTP ${response.status}`,
        { errorCode: error.errorCode }
      );
    }

    return response.json() as Promise<T>;
  }

  /**
   * Get transaction info by transaction ID
   */
  async getTransactionInfo(
    transactionId: string
  ): Promise<JWSTransactionDecodedPayload> {
    const response = await this.request<TransactionInfoResponse>(
      'GET',
      `/inApps/v1/transactions/${transactionId}`
    );

    return decodeAppleSignedData<JWSTransactionDecodedPayload>(
      response.signedTransactionInfo
    );
  }

  /**
   * Get transaction history for a transaction
   */
  async getTransactionHistory(
    transactionId: string,
    revision?: string
  ): Promise<{
    transactions: JWSTransactionDecodedPayload[];
    hasMore: boolean;
    revision: string;
  }> {
    let path = `/inApps/v1/history/${transactionId}`;
    if (revision) {
      path += `?revision=${revision}`;
    }

    const response = await this.request<TransactionHistoryResponse>(
      'GET',
      path
    );

    const transactions = response.signedTransactions.map((signed) =>
      decodeAppleSignedData<JWSTransactionDecodedPayload>(signed)
    );

    return {
      transactions,
      hasMore: response.hasMore,
      revision: response.revision,
    };
  }

  /**
   * Get all subscription statuses for a transaction
   */
  async getAllSubscriptionStatuses(transactionId: string): Promise<{
    groups: Array<{
      subscriptionGroupIdentifier: string;
      subscriptions: Array<{
        status: number;
        originalTransactionId: string;
        transaction: JWSTransactionDecodedPayload;
        renewalInfo: JWSRenewalInfoDecodedPayload;
      }>;
    }>;
  }> {
    const response = await this.request<StatusResponse>(
      'GET',
      `/inApps/v1/subscriptions/${transactionId}`
    );

    const groups = response.data.map((group) => ({
      subscriptionGroupIdentifier: group.subscriptionGroupIdentifier,
      subscriptions: group.lastTransactions.map((item) => ({
        status: item.status,
        originalTransactionId: item.originalTransactionId,
        transaction: decodeAppleSignedData<JWSTransactionDecodedPayload>(
          item.signedTransactionInfo
        ),
        renewalInfo: decodeAppleSignedData<JWSRenewalInfoDecodedPayload>(
          item.signedRenewalInfo
        ),
      })),
    }));

    return { groups };
  }

  /**
   * Request a test notification (for testing)
   */
  async requestTestNotification(): Promise<{ testNotificationToken: string }> {
    return this.request<{ testNotificationToken: string }>(
      'POST',
      '/inApps/v1/notifications/test'
    );
  }

  /**
   * Get notification history
   */
  async getNotificationHistory(
    startDate: number,
    endDate: number,
    paginationToken?: string
  ): Promise<{
    notificationHistory: Array<{
      signedPayload: string;
      sendAttempts: Array<{
        attemptDate: number;
        sendAttemptResult: string;
      }>;
    }>;
    paginationToken?: string;
    hasMore: boolean;
  }> {
    const body: Record<string, unknown> = {
      startDate,
      endDate,
    };

    if (paginationToken) {
      body.paginationToken = paginationToken;
    }

    return this.request(
      'POST',
      '/inApps/v1/notifications/history',
      body
    );
  }

  /**
   * Send consumption information (for refund prevention)
   */
  async sendConsumptionInformation(
    transactionId: string,
    consumptionData: {
      accountTenure: number;
      appAccountToken?: string;
      consumptionStatus: number;
      customerConsented: boolean;
      deliveryStatus: number;
      lifetimeDollarsPurchased: number;
      lifetimeDollarsRefunded: number;
      platform: number;
      playTime: number;
      sampleContentProvided: boolean;
      userStatus: number;
    }
  ): Promise<void> {
    await this.request(
      'PUT',
      `/inApps/v1/transactions/consumption/${transactionId}`,
      consumptionData
    );
  }

  /**
   * Look up order by order ID
   */
  async lookUpOrderId(orderId: string): Promise<{
    transactions: JWSTransactionDecodedPayload[];
  }> {
    const response = await this.request<{ signedTransactions: string[] }>(
      'GET',
      `/inApps/v1/lookup/${orderId}`
    );

    const transactions = response.signedTransactions.map((signed) =>
      decodeAppleSignedData<JWSTransactionDecodedPayload>(signed)
    );

    return { transactions };
  }

  /**
   * Extend a subscription renewal date
   */
  async extendSubscriptionRenewalDate(
    originalTransactionId: string,
    extendByDays: number,
    extendReasonCode: 0 | 1 | 2 | 3,
    requestIdentifier: string
  ): Promise<{
    effectiveDate: number;
    originalTransactionId: string;
    webOrderLineItemId: string;
  }> {
    return this.request(
      'PUT',
      `/inApps/v1/subscriptions/extend/${originalTransactionId}`,
      {
        extendByDays,
        extendReasonCode,
        requestIdentifier,
      }
    );
  }
}

/**
 * Create Apple client from app config
 */
export function createAppleClient(configJson: string): AppleAppStoreClient {
  const config = JSON.parse(configJson) as AppleConfig;
  return new AppleAppStoreClient(config);
}
