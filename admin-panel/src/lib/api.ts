const API_BASE = import.meta.env.PROD
  ? 'https://mrrcat.ongoru.workers.dev/admin'
  : '/admin';

class ApiClient {
  private token: string | null = null;

  constructor() {
    this.token = localStorage.getItem('admin_token');
  }

  setToken(token: string | null) {
    this.token = token;
    if (token) {
      localStorage.setItem('admin_token', token);
    } else {
      localStorage.removeItem('admin_token');
    }
  }

  getToken() {
    return this.token;
  }

  isAuthenticated() {
    return !!this.token;
  }

  private async request<T>(
    path: string,
    options: RequestInit = {}
  ): Promise<T> {
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
      ...options.headers,
    };

    if (this.token) {
      (headers as Record<string, string>)['Authorization'] = `Bearer ${this.token}`;
    }

    const response = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers,
    });

    if (response.status === 401) {
      this.setToken(null);
      window.location.href = '/login';
      throw new Error('Unauthorized');
    }

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error?.message || 'Request failed');
    }

    return data;
  }

  // Setup status (no auth required)
  async getSetupStatus() {
    return this.request<{ needs_setup: boolean }>('/setup/status');
  }

  // Auth
  async login(email: string, password: string) {
    const data = await this.request<{ token: string; user: { id: string; email: string } }>(
      '/login',
      {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      }
    );
    this.setToken(data.token);
    return data;
  }

  async setup(email: string, password: string, name?: string) {
    const data = await this.request<{ token: string; user: { id: string; email: string; api_key: string } }>(
      '/setup',
      {
        method: 'POST',
        body: JSON.stringify({ email, password, name }),
      }
    );
    this.setToken(data.token);
    return data;
  }

  async logout() {
    try {
      await this.request('/logout', { method: 'POST' });
    } finally {
      this.setToken(null);
    }
  }

  async getMe() {
    return this.request<{ user: { id: string; email: string } }>('/me');
  }

  // Dashboard
  async getDashboard(excludeSandbox: boolean = false) {
    const query = excludeSandbox ? '?exclude_sandbox=true' : '';
    return this.request<{
      exclude_sandbox: boolean;
      apps: number;
      total_subscribers: number;
      active_subscriptions: number;
      mrr: { total: number; currency: string }[];
      revenue_30d: { total: number; currency: string }[];
      refunds_30d_count: number;
      refunds_30d_amount: { total: number; currency: string }[];
      events_30d: { event_type: string; count: number }[];
      platform_breakdown: { platform: string; count: number }[];
    }>(`/dashboard${query}`);
  }

  // Apps
  async getApps() {
    return this.request<{
      apps: {
        id: string;
        name: string;
        api_key: string;
        has_apple: number;
        has_google: number;
        has_stripe: number;
        created_at: number;
      }[];
    }>('/apps');
  }

  async getApp(id: string) {
    return this.request<{
      app: {
        id: string;
        name: string;
        api_key: string;
        created_at: number;
        apple_config: {
          key_id?: string;
          issuer_id?: string;
          bundle_id?: string;
          has_private_key?: boolean;
        } | null;
        google_config: {
          package_name?: string;
          has_service_account?: boolean;
        } | null;
        stripe_config: {
          has_secret_key?: boolean;
          has_webhook_secret?: boolean;
        } | null;
      };
    }>(`/apps/${id}`);
  }

  async createApp(name: string) {
    return this.request<{
      app: { id: string; name: string; api_key: string; created_at: number };
    }>('/apps', {
      method: 'POST',
      body: JSON.stringify({ name }),
    });
  }

  async updateApp(id: string, name: string) {
    return this.request<{ message: string }>(`/apps/${id}`, {
      method: 'PUT',
      body: JSON.stringify({ name }),
    });
  }

  async deleteApp(id: string) {
    return this.request<{ message: string }>(`/apps/${id}`, {
      method: 'DELETE',
    });
  }

  async regenerateApiKey(id: string) {
    return this.request<{ api_key: string }>(`/apps/${id}/regenerate-key`, {
      method: 'POST',
    });
  }

  // Platform configs
  async saveAppleConfig(
    appId: string,
    config: { key_id: string; issuer_id: string; bundle_id: string; private_key: string }
  ) {
    return this.request<{ message: string }>(`/apps/${appId}/apple`, {
      method: 'PUT',
      body: JSON.stringify(config),
    });
  }

  async deleteAppleConfig(appId: string) {
    return this.request<{ message: string }>(`/apps/${appId}/apple`, {
      method: 'DELETE',
    });
  }

  async saveGoogleConfig(
    appId: string,
    config: { package_name: string; service_account_json: string }
  ) {
    return this.request<{ message: string }>(`/apps/${appId}/google`, {
      method: 'PUT',
      body: JSON.stringify(config),
    });
  }

  async deleteGoogleConfig(appId: string) {
    return this.request<{ message: string }>(`/apps/${appId}/google`, {
      method: 'DELETE',
    });
  }

  async saveStripeConfig(
    appId: string,
    config: { secret_key: string; webhook_secret: string }
  ) {
    return this.request<{ message: string }>(`/apps/${appId}/stripe`, {
      method: 'PUT',
      body: JSON.stringify(config),
    });
  }

  async deleteStripeConfig(appId: string) {
    return this.request<{ message: string }>(`/apps/${appId}/stripe`, {
      method: 'DELETE',
    });
  }

  // Webhooks
  async getWebhooks(appId: string) {
    return this.request<{
      webhooks: {
        id: string;
        url: string;
        events: string[];
        active: number;
        created_at: number;
      }[];
    }>(`/apps/${appId}/webhooks`);
  }

  async createWebhook(appId: string, url: string, events: string[]) {
    return this.request<{
      webhook: {
        id: string;
        url: string;
        secret: string;
        events: string[];
        active: boolean;
        created_at: number;
      };
    }>(`/apps/${appId}/webhooks`, {
      method: 'POST',
      body: JSON.stringify({ url, events }),
    });
  }

  async deleteWebhook(id: string) {
    return this.request<{ message: string }>(`/webhooks/${id}`, {
      method: 'DELETE',
    });
  }

  // Entitlements
  async getEntitlements(appId: string) {
    return this.request<{
      entitlements: {
        id: string;
        app_id: string;
        identifier: string;
        display_name: string | null;
        created_at: number;
      }[];
    }>(`/apps/${appId}/entitlements`);
  }

  async createEntitlement(appId: string, identifier: string, displayName?: string) {
    return this.request<{
      entitlement: {
        id: string;
        app_id: string;
        identifier: string;
        display_name: string | null;
        created_at: number;
      };
    }>(`/apps/${appId}/entitlements`, {
      method: 'POST',
      body: JSON.stringify({ identifier, display_name: displayName }),
    });
  }

  // Product mappings
  async getProductMappings(appId: string) {
    return this.request<{
      mappings: {
        id: string;
        app_id: string;
        product_id: string;
        platform: string;
        entitlement_id: string;
        entitlement_identifier: string;
        created_at: number;
      }[];
    }>(`/apps/${appId}/product-mappings`);
  }

  async createProductMapping(
    appId: string,
    productId: string,
    platform: string,
    entitlementId: string
  ) {
    return this.request<{
      mapping: {
        id: string;
        app_id: string;
        product_id: string;
        platform: string;
        entitlement_id: string;
        created_at: number;
      };
    }>(`/apps/${appId}/product-mappings`, {
      method: 'POST',
      body: JSON.stringify({
        product_id: productId,
        platform,
        entitlement_id: entitlementId,
      }),
    });
  }

  async deleteProductMapping(id: string) {
    return this.request<{ message: string }>(`/product-mappings/${id}`, {
      method: 'DELETE',
    });
  }

  // Subscribers
  async getSubscribers(appId: string, limit = 50, offset = 0) {
    return this.request<{
      subscribers: {
        id: string;
        app_id: string;
        app_user_id: string;
        first_seen_at: number;
        last_seen_at: number;
        active_subscriptions: number;
      }[];
      total: number;
      limit: number;
      offset: number;
    }>(`/apps/${appId}/subscribers?limit=${limit}&offset=${offset}`);
  }

  async getSubscriber(id: string) {
    return this.request<{
      subscriber: {
        id: string;
        app_id: string;
        app_user_id: string;
        first_seen_at: number;
        last_seen_at: number;
        attributes: string | null;
      };
      subscriptions: {
        id: string;
        platform: string;
        product_id: string;
        status: string;
        is_trial: number;
        price_amount: number | null;
        expires_at: number | null;
        created_at: number;
      }[];
      transactions: {
        id: string;
        transaction_id: string;
        type: string;
        revenue_amount: number | null;
        revenue_currency: string | null;
        is_refunded: number;
        created_at: number;
      }[];
    }>(`/subscribers/${id}`);
  }

  // Customer Support
  async grantEntitlement(subscriberId: string, entitlementId: string, reason?: string, expiresAt?: number) {
    return this.request<{ entitlement: any }>(`/subscribers/${subscriberId}/grant-entitlement`, {
      method: 'POST',
      body: JSON.stringify({ entitlement_id: entitlementId, reason, expires_at: expiresAt }),
    });
  }

  async revokeEntitlement(subscriberId: string, entitlementId: string) {
    return this.request<{ message: string }>(`/subscribers/${subscriberId}/entitlements/${entitlementId}`, { method: 'DELETE' });
  }

  async extendSubscription(subscriberId: string, subscriptionId: string, days: number) {
    return this.request<{ message: string; new_expires_at: number }>(`/subscribers/${subscriberId}/subscriptions/${subscriptionId}/extend`, {
      method: 'PATCH',
      body: JSON.stringify({ days }),
    });
  }

  async refundTransaction(subscriberId: string, transactionId: string) {
    return this.request<{ message: string }>(`/subscribers/${subscriberId}/transactions/${transactionId}/refund`, { method: 'POST' });
  }

  async getSubscriberTimeline(subscriberId: string) {
    return this.request<{ timeline: any[] }>(`/subscribers/${subscriberId}/timeline`);
  }

  // Analytics
  async getAnalyticsOverview(appId: string, period = '30d', excludeSandbox = false) {
    const qs = `?period=${period}${excludeSandbox ? '&exclude_sandbox=true' : ''}`;
    return this.request<any>(`/apps/${appId}/analytics/overview${qs}`);
  }

  async getAnalyticsRevenue(appId: string, period = '30d', excludeSandbox = false) {
    const qs = `?period=${period}${excludeSandbox ? '&exclude_sandbox=true' : ''}`;
    return this.request<any>(`/apps/${appId}/analytics/revenue${qs}`);
  }

  async getAnalyticsSubscribers(appId: string, excludeSandbox = false) {
    const qs = excludeSandbox ? '?exclude_sandbox=true' : '';
    return this.request<any>(`/apps/${appId}/analytics/subscribers${qs}`);
  }

  async getAnalyticsMRR(appId: string, excludeSandbox = false) {
    const qs = excludeSandbox ? '?exclude_sandbox=true' : '';
    return this.request<any>(`/apps/${appId}/analytics/mrr${qs}`);
  }

  async getAnalyticsChurn(appId: string, period = '30d', excludeSandbox = false) {
    const qs = `?period=${period}${excludeSandbox ? '&exclude_sandbox=true' : ''}`;
    return this.request<any>(`/apps/${appId}/analytics/churn${qs}`);
  }

  async getAnalyticsCohort(appId: string) {
    return this.request<any>(`/apps/${appId}/analytics/cohort`);
  }

  async getAnalyticsLTV(appId: string) {
    return this.request<any>(`/apps/${appId}/analytics/ltv`);
  }

  async getAnalyticsFunnel(appId: string, period = '30d') {
    return this.request<any>(`/apps/${appId}/analytics/funnel?period=${period}`);
  }

  // Experiments
  async getExperiments(appId: string, status?: string) {
    const qs = status ? `?status=${status}` : '';
    return this.request<{ experiments: any[] }>(`/apps/${appId}/experiments${qs}`);
  }

  async createExperiment(appId: string, data: { name: string; description?: string; variants: { name: string; offering_id: string; weight: number }[] }) {
    return this.request<{ experiment: any }>(`/apps/${appId}/experiments`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async getExperimentResults(experimentId: string) {
    return this.request<{ variants: any[]; significance: any }>(`/experiments/${experimentId}/results`);
  }

  async updateExperiment(experimentId: string, data: { status?: string; name?: string; description?: string }) {
    return this.request<{ message: string }>(`/experiments/${experimentId}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  async deleteExperiment(experimentId: string) {
    return this.request<{ message: string }>(`/experiments/${experimentId}`, { method: 'DELETE' });
  }

  // Integrations
  async getIntegrations(appId: string) {
    return this.request<{ integrations: any[] }>(`/apps/${appId}/integrations`);
  }

  async createIntegration(appId: string, data: { type: string; name: string; config: Record<string, string>; events: string[] }) {
    return this.request<{ integration: any }>(`/apps/${appId}/integrations`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateIntegration(appId: string, integrationId: string, data: { name?: string; config?: Record<string, string>; events?: string[]; enabled?: boolean }) {
    return this.request<{ message: string }>(`/apps/${appId}/integrations/${integrationId}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  async deleteIntegration(appId: string, integrationId: string) {
    return this.request<{ message: string }>(`/apps/${appId}/integrations/${integrationId}`, { method: 'DELETE' });
  }

  async testIntegration(appId: string, integrationId: string) {
    return this.request<{ message: string }>(`/apps/${appId}/integrations/${integrationId}/test`, { method: 'POST' });
  }

  async getIntegrationDeliveries(appId: string, integrationId: string) {
    return this.request<{ deliveries: any[] }>(`/apps/${appId}/integrations/${integrationId}/deliveries`);
  }

  // Paywalls
  async getPaywalls(appId: string) {
    return this.request<{ paywalls: any[] }>(`/apps/${appId}/paywalls`);
  }

  async createPaywall(appId: string, data: any) {
    return this.request<{ paywall: any }>(`/apps/${appId}/paywalls`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updatePaywall(appId: string, identifier: string, data: any) {
    return this.request<{ message: string }>(`/apps/${appId}/paywalls/${identifier}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  async deletePaywall(appId: string, identifier: string) {
    return this.request<{ message: string }>(`/apps/${appId}/paywalls/${identifier}`, { method: 'DELETE' });
  }

  // Offerings (for experiment creation)
  async getOfferings(appId: string) {
    return this.request<{ offerings: { id: string; identifier: string }[] }>(`/apps/${appId}/offerings`);
  }
}

export const api = new ApiClient();
