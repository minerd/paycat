/**
 * Amazon Appstore Client
 * Receipt Verification Service (RVS) API
 */

import type {
  AmazonConfig,
  AmazonRVSResponse,
  AmazonVerifyRequest,
} from './types';

// RVS Endpoints
const RVS_PRODUCTION = 'https://appstore-sdk.amazon.com';
const RVS_SANDBOX = 'https://appstore-sdk.amazon.com/sandbox';

export class AmazonClient {
  private config: AmazonConfig;
  private baseUrl: string;

  constructor(config: AmazonConfig) {
    this.config = config;
    this.baseUrl = config.sandboxMode ? RVS_SANDBOX : RVS_PRODUCTION;
  }

  /**
   * Verify a purchase receipt
   * GET /version/1.0/verifyReceiptId/developer/{developerSecret}/user/{userId}/receiptId/{receiptId}
   */
  async verifyReceipt(request: AmazonVerifyRequest): Promise<AmazonRVSResponse> {
    const url = `${this.baseUrl}/version/1.0/verifyReceiptId/developer/${this.config.sharedSecret}/user/${request.userId}/receiptId/${request.receiptId}`;

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      const status = response.status;

      if (status === 400) {
        throw new AmazonError('Invalid receipt ID or user ID', 'INVALID_RECEIPT');
      }
      if (status === 404) {
        throw new AmazonError('Receipt not found', 'RECEIPT_NOT_FOUND');
      }
      if (status === 410) {
        throw new AmazonError('Receipt is no longer valid (expired or revoked)', 'RECEIPT_EXPIRED');
      }
      if (status === 429) {
        throw new AmazonError('Rate limit exceeded', 'RATE_LIMITED');
      }
      if (status === 500) {
        throw new AmazonError('Amazon server error', 'SERVER_ERROR');
      }

      throw new AmazonError(`RVS request failed with status ${status}`, 'UNKNOWN_ERROR');
    }

    const data = await response.json() as AmazonRVSResponse;
    return data;
  }

  /**
   * Get subscription status
   */
  async getSubscriptionStatus(request: AmazonVerifyRequest): Promise<{
    isActive: boolean;
    willRenew: boolean;
    expiresAt: number | null;
    isInGracePeriod: boolean;
    isTrial: boolean;
    isIntroOffer: boolean;
  }> {
    const receipt = await this.verifyReceipt(request);

    if (receipt.productType !== 'SUBSCRIPTION') {
      throw new AmazonError('Not a subscription product', 'NOT_SUBSCRIPTION');
    }

    const now = Date.now();
    const isActive = !receipt.cancelDate &&
      (receipt.renewalDate ? receipt.renewalDate > now : true);

    const isInGracePeriod = receipt.gracePeriod === true;
    const isTrial = receipt.freeTrialEndDate ? receipt.freeTrialEndDate > now : false;
    const isIntroOffer = receipt.introductoryPriceEndDate ? receipt.introductoryPriceEndDate > now : false;

    return {
      isActive,
      willRenew: receipt.autoRenewing ?? false,
      expiresAt: receipt.renewalDate ?? null,
      isInGracePeriod,
      isTrial,
      isIntroOffer,
    };
  }

  /**
   * Check if receipt is sandbox/test
   */
  isSandbox(receipt: AmazonRVSResponse): boolean {
    return receipt.testTransaction === true;
  }

  /**
   * Parse subscription term to days
   */
  parseSubscriptionTerm(term: string | undefined): number {
    if (!term) return 30; // Default to monthly

    // Amazon terms: "1 Week", "1 Month", "3 Months", "6 Months", "1 Year"
    const lower = term.toLowerCase();

    if (lower.includes('week')) {
      const weeks = parseInt(term) || 1;
      return weeks * 7;
    }
    if (lower.includes('month')) {
      const months = parseInt(term) || 1;
      return months * 30;
    }
    if (lower.includes('year')) {
      const years = parseInt(term) || 1;
      return years * 365;
    }

    return 30; // Default
  }
}

/**
 * Amazon Error class
 */
export class AmazonError extends Error {
  code: string;

  constructor(message: string, code: string) {
    super(message);
    this.name = 'AmazonError';
    this.code = code;
  }
}

/**
 * Create Amazon client from app config
 */
export function createAmazonClient(configJson: string | null): AmazonClient | null {
  if (!configJson) return null;

  try {
    const config = JSON.parse(configJson) as AmazonConfig;
    if (!config.sharedSecret) return null;
    return new AmazonClient(config);
  } catch {
    return null;
  }
}
