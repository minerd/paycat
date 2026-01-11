/**
 * Stripe API Client
 */

import { Errors } from '../../middleware/error';
import type {
  StripeConfig,
  StripeSubscription,
  StripeCustomer,
  StripeInvoice,
} from './types';

const STRIPE_API = 'https://api.stripe.com/v1';
const STRIPE_VERSION = '2024-11-20.acacia';

export class StripeClient {
  private secretKey: string;

  constructor(config: StripeConfig) {
    this.secretKey = config.secretKey;
  }

  /**
   * Make authenticated request to Stripe API
   */
  private async request<T>(
    method: string,
    path: string,
    body?: Record<string, unknown>
  ): Promise<T> {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.secretKey}`,
      'Stripe-Version': STRIPE_VERSION,
    };

    let requestBody: string | undefined;
    if (body) {
      headers['Content-Type'] = 'application/x-www-form-urlencoded';
      requestBody = this.encodeFormData(body);
    }

    const response = await fetch(`${STRIPE_API}${path}`, {
      method,
      headers,
      body: requestBody,
    });

    const data = await response.json();

    if (!response.ok) {
      const error = data as { error?: { message?: string; code?: string } };
      throw Errors.platformError(
        'Stripe',
        error.error?.message || `HTTP ${response.status}`,
        { code: error.error?.code }
      );
    }

    return data as T;
  }

  /**
   * Encode object to URL-encoded form data (Stripe format)
   */
  private encodeFormData(
    obj: Record<string, unknown>,
    prefix?: string
  ): string {
    const params: string[] = [];

    for (const [key, value] of Object.entries(obj)) {
      if (value === undefined || value === null) continue;

      const fullKey = prefix ? `${prefix}[${key}]` : key;

      if (typeof value === 'object' && !Array.isArray(value)) {
        params.push(
          this.encodeFormData(value as Record<string, unknown>, fullKey)
        );
      } else if (Array.isArray(value)) {
        value.forEach((item, index) => {
          if (typeof item === 'object') {
            params.push(
              this.encodeFormData(item as Record<string, unknown>, `${fullKey}[${index}]`)
            );
          } else {
            params.push(`${fullKey}[${index}]=${encodeURIComponent(String(item))}`);
          }
        });
      } else {
        params.push(`${fullKey}=${encodeURIComponent(String(value))}`);
      }
    }

    return params.filter(Boolean).join('&');
  }

  /**
   * Get subscription by ID
   */
  async getSubscription(subscriptionId: string): Promise<StripeSubscription> {
    return this.request<StripeSubscription>(
      'GET',
      `/subscriptions/${subscriptionId}`
    );
  }

  /**
   * List subscriptions for a customer
   */
  async listCustomerSubscriptions(
    customerId: string,
    limit: number = 10
  ): Promise<{ data: StripeSubscription[]; has_more: boolean }> {
    return this.request(
      'GET',
      `/subscriptions?customer=${customerId}&limit=${limit}`
    );
  }

  /**
   * Cancel subscription
   */
  async cancelSubscription(
    subscriptionId: string,
    cancelAtPeriodEnd: boolean = true
  ): Promise<StripeSubscription> {
    if (cancelAtPeriodEnd) {
      return this.request<StripeSubscription>(
        'POST',
        `/subscriptions/${subscriptionId}`,
        { cancel_at_period_end: true }
      );
    } else {
      return this.request<StripeSubscription>(
        'DELETE',
        `/subscriptions/${subscriptionId}`
      );
    }
  }

  /**
   * Resume a paused subscription
   */
  async resumeSubscription(subscriptionId: string): Promise<StripeSubscription> {
    return this.request<StripeSubscription>(
      'POST',
      `/subscriptions/${subscriptionId}/resume`
    );
  }

  /**
   * Get customer by ID
   */
  async getCustomer(customerId: string): Promise<StripeCustomer> {
    return this.request<StripeCustomer>('GET', `/customers/${customerId}`);
  }

  /**
   * Search customers by email
   */
  async searchCustomers(
    email: string
  ): Promise<{ data: StripeCustomer[] }> {
    return this.request(
      'GET',
      `/customers/search?query=email:'${encodeURIComponent(email)}'`
    );
  }

  /**
   * Get invoice by ID
   */
  async getInvoice(invoiceId: string): Promise<StripeInvoice> {
    return this.request<StripeInvoice>('GET', `/invoices/${invoiceId}`);
  }

  /**
   * List invoices for a subscription
   */
  async listSubscriptionInvoices(
    subscriptionId: string,
    limit: number = 10
  ): Promise<{ data: StripeInvoice[]; has_more: boolean }> {
    return this.request(
      'GET',
      `/invoices?subscription=${subscriptionId}&limit=${limit}`
    );
  }

  /**
   * Create a refund
   */
  async createRefund(
    chargeId: string,
    amount?: number,
    reason?: 'duplicate' | 'fraudulent' | 'requested_by_customer'
  ): Promise<{ id: string; amount: number; status: string }> {
    const body: Record<string, unknown> = { charge: chargeId };
    if (amount) body.amount = amount;
    if (reason) body.reason = reason;

    return this.request('POST', '/refunds', body);
  }

  /**
   * Update subscription metadata
   */
  async updateSubscriptionMetadata(
    subscriptionId: string,
    metadata: Record<string, string>
  ): Promise<StripeSubscription> {
    return this.request<StripeSubscription>(
      'POST',
      `/subscriptions/${subscriptionId}`,
      { metadata }
    );
  }

  /**
   * Create billing portal session
   */
  async createBillingPortalSession(
    customerId: string,
    returnUrl: string
  ): Promise<{ url: string }> {
    return this.request('POST', '/billing_portal/sessions', {
      customer: customerId,
      return_url: returnUrl,
    });
  }

  /**
   * Create checkout session
   */
  async createCheckoutSession(options: {
    customerId?: string;
    customerEmail?: string;
    priceId: string;
    successUrl: string;
    cancelUrl: string;
    metadata?: Record<string, string>;
    trialDays?: number;
  }): Promise<{ id: string; url: string }> {
    const body: Record<string, unknown> = {
      mode: 'subscription',
      line_items: [{ price: options.priceId, quantity: 1 }],
      success_url: options.successUrl,
      cancel_url: options.cancelUrl,
    };

    if (options.customerId) body.customer = options.customerId;
    if (options.customerEmail) body.customer_email = options.customerEmail;
    if (options.metadata) body.metadata = options.metadata;
    if (options.trialDays) {
      body.subscription_data = {
        trial_period_days: options.trialDays,
      };
    }

    return this.request('POST', '/checkout/sessions', body);
  }
}

/**
 * Create Stripe client from app config
 */
export function createStripeClient(configJson: string): StripeClient {
  const config = JSON.parse(configJson) as StripeConfig;
  return new StripeClient(config);
}
