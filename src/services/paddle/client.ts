/**
 * Paddle Billing API Client
 */

import type {
  PaddleConfig,
  PaddleAPIResponse,
  PaddleSubscription,
  PaddlePlan,
} from './types';

// API Endpoints
const PADDLE_API = 'https://vendors.paddle.com/api/2.0';
const PADDLE_SANDBOX_API = 'https://sandbox-vendors.paddle.com/api/2.0';

export class PaddleClient {
  private config: PaddleConfig;
  private baseUrl: string;

  constructor(config: PaddleConfig) {
    this.config = config;
    this.baseUrl = config.sandboxMode ? PADDLE_SANDBOX_API : PADDLE_API;
  }

  /**
   * Make authenticated API request
   */
  private async request<T>(
    endpoint: string,
    data: Record<string, any> = {}
  ): Promise<T> {
    const formData = new URLSearchParams();
    formData.append('vendor_id', this.config.vendorId);
    formData.append('vendor_auth_code', this.config.apiKey);

    for (const [key, value] of Object.entries(data)) {
      if (value !== undefined && value !== null) {
        formData.append(key, String(value));
      }
    }

    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: formData.toString(),
    });

    const result = await response.json() as PaddleAPIResponse<T>;

    if (!result.success) {
      throw new PaddleError(
        result.error?.message || 'API request failed',
        result.error?.code || 0
      );
    }

    return result.response;
  }

  /**
   * List all subscriptions
   */
  async listSubscriptions(options?: {
    subscription_id?: string;
    plan_id?: string;
    user_id?: string;
    state?: 'active' | 'past_due' | 'trialing' | 'paused' | 'deleted';
    page?: number;
    results_per_page?: number;
  }): Promise<PaddleSubscription[]> {
    return this.request<PaddleSubscription[]>('/subscription/users', options);
  }

  /**
   * Get a specific subscription
   */
  async getSubscription(subscriptionId: string): Promise<PaddleSubscription | null> {
    const subscriptions = await this.listSubscriptions({
      subscription_id: subscriptionId,
    });
    return subscriptions[0] || null;
  }

  /**
   * Update subscription
   */
  async updateSubscription(
    subscriptionId: string,
    updates: {
      plan_id?: number;
      quantity?: number;
      price?: number;
      currency?: string;
      recurring_price?: number;
      bill_immediately?: boolean;
      prorate?: boolean;
      keep_modifiers?: boolean;
      passthrough?: string;
    }
  ): Promise<{ subscription_id: number; plan_id: number; user_id: number }> {
    return this.request('/subscription/users/update', {
      subscription_id: subscriptionId,
      ...updates,
    });
  }

  /**
   * Cancel subscription
   */
  async cancelSubscription(subscriptionId: string): Promise<void> {
    await this.request('/subscription/users_cancel', {
      subscription_id: subscriptionId,
    });
  }

  /**
   * Pause subscription
   */
  async pauseSubscription(subscriptionId: string, pauseDate?: string): Promise<void> {
    await this.request('/subscription/users/pause', {
      subscription_id: subscriptionId,
      pause_date: pauseDate,
    });
  }

  /**
   * Resume subscription
   */
  async resumeSubscription(subscriptionId: string): Promise<void> {
    await this.request('/subscription/users/pause', {
      subscription_id: subscriptionId,
      pause_date: null, // Setting to null resumes
    });
  }

  /**
   * List subscription plans
   */
  async listPlans(): Promise<PaddlePlan[]> {
    return this.request<PaddlePlan[]>('/subscription/plans');
  }

  /**
   * Get subscription plan
   */
  async getPlan(planId: number): Promise<PaddlePlan | null> {
    const plans = await this.request<PaddlePlan[]>('/subscription/plans', {
      plan: planId,
    });
    return plans[0] || null;
  }

  /**
   * Create one-time charge for subscription
   */
  async createModifier(
    subscriptionId: string,
    amount: number,
    options?: {
      recurring?: boolean;
      description?: string;
    }
  ): Promise<{ subscription_id: number; modifier_id: number }> {
    return this.request('/subscription/modifiers/create', {
      subscription_id: subscriptionId,
      modifier_amount: amount,
      modifier_recurring: options?.recurring ?? false,
      modifier_description: options?.description,
    });
  }

  /**
   * Issue a refund
   */
  async refundPayment(
    orderId: string,
    options?: {
      amount?: number;
      reason?: string;
    }
  ): Promise<{ refund_request_id: number }> {
    return this.request('/payment/refund', {
      order_id: orderId,
      amount: options?.amount,
      reason: options?.reason,
    });
  }

  /**
   * Get user history/transactions
   */
  async getUserTransactions(
    userId: string | number
  ): Promise<Array<{
    order_id: string;
    checkout_id: string;
    amount: string;
    currency: string;
    status: string;
    created_at: string;
    product_id: number;
    is_subscription: number;
    receipt_url: string;
  }>> {
    return this.request('/user/history', { user_id: userId });
  }

  /**
   * Generate pay link for subscription
   */
  async generatePayLink(options: {
    product_id: number;
    customer_email?: string;
    passthrough?: string;
    prices?: string[]; // ['USD:19.99', 'EUR:15.99']
    return_url?: string;
    quantity?: number;
    discountable?: number;
    coupon_code?: string;
    custom_message?: string;
    trial_days?: number;
  }): Promise<{ url: string }> {
    return this.request('/product/generate_pay_link', options);
  }
}

/**
 * Paddle Error class
 */
export class PaddleError extends Error {
  code: number;

  constructor(message: string, code: number) {
    super(message);
    this.name = 'PaddleError';
    this.code = code;
  }
}

/**
 * Create Paddle client from app config
 */
export function createPaddleClient(configJson: string | null): PaddleClient | null {
  if (!configJson) return null;

  try {
    const config = JSON.parse(configJson) as PaddleConfig;
    if (!config.vendorId || !config.apiKey) return null;
    return new PaddleClient(config);
  } catch {
    return null;
  }
}
