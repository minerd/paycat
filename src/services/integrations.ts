/**
 * Third-Party Integrations Service
 * Sends events to external analytics and marketing platforms
 */

import { generateId } from '../utils/id';

// Integration types
export type IntegrationType =
  | 'amplitude'
  | 'mixpanel'
  | 'segment'
  | 'firebase'
  | 'braze'
  | 'slack'
  | 'appsflyer'
  | 'adjust'
  | 'webhook';

export interface Integration {
  id: string;
  appId: string;
  type: IntegrationType;
  name: string;
  config: IntegrationConfig;
  enabled: boolean;
  events: string[]; // Which events to send
  createdAt: number;
  updatedAt: number;
}

export type IntegrationConfig =
  | AmplitudeConfig
  | MixpanelConfig
  | SegmentConfig
  | FirebaseConfig
  | BrazeConfig
  | SlackConfig
  | AppsflyerConfig
  | AdjustConfig
  | WebhookConfig;

export interface AmplitudeConfig {
  apiKey: string;
  secretKey?: string;
}

export interface MixpanelConfig {
  token: string;
  apiSecret?: string;
}

export interface SegmentConfig {
  writeKey: string;
}

export interface FirebaseConfig {
  projectId: string;
  serviceAccountJson: string;
}

export interface BrazeConfig {
  apiKey: string;
  restEndpoint: string; // e.g., 'rest.iad-01.braze.com'
}

export interface SlackConfig {
  webhookUrl: string;
  channel?: string;
}

export interface AppsflyerConfig {
  devKey: string;
  appId: string;
}

export interface AdjustConfig {
  appToken: string;
  environment: 'sandbox' | 'production';
}

export interface WebhookConfig {
  url: string;
  headers?: Record<string, string>;
  secret?: string;
}

// Event types
export type IntegrationEventType =
  | 'initial_purchase'
  | 'renewal'
  | 'cancellation'
  | 'uncancellation'
  | 'expiration'
  | 'billing_issue'
  | 'grace_period_started'
  | 'grace_period_ended'
  | 'trial_started'
  | 'trial_converted'
  | 'trial_cancelled'
  | 'refund'
  | 'product_change'
  | 'subscriber_alias';

export interface IntegrationEvent {
  type: IntegrationEventType;
  appId: string;
  subscriberId: string;
  appUserId: string;
  productId?: string;
  platform?: string;
  revenue?: number;
  currency?: string;
  timestamp: number;
  properties?: Record<string, unknown>;
}

// Database row type
interface IntegrationRow {
  id: string;
  app_id: string;
  type: string;
  name: string;
  config: string;
  enabled: number;
  events: string;
  created_at: number;
  updated_at: number;
}

/**
 * Get all integrations for an app
 */
export async function getIntegrations(
  db: D1Database,
  appId: string
): Promise<Integration[]> {
  const rows = await db
    .prepare('SELECT * FROM integrations WHERE app_id = ? ORDER BY created_at DESC')
    .bind(appId)
    .all<IntegrationRow>();

  return rows.results.map(mapIntegrationRow);
}

/**
 * Get enabled integrations for specific event
 */
export async function getEnabledIntegrationsForEvent(
  db: D1Database,
  appId: string,
  eventType: IntegrationEventType
): Promise<Integration[]> {
  const integrations = await getIntegrations(db, appId);

  return integrations.filter(
    (i) => i.enabled && (i.events.includes(eventType) || i.events.includes('*'))
  );
}

/**
 * Create a new integration
 */
export async function createIntegration(
  db: D1Database,
  appId: string,
  data: {
    type: IntegrationType;
    name: string;
    config: IntegrationConfig;
    events?: string[];
  }
): Promise<Integration> {
  const id = generateId();
  const now = Date.now();

  await db
    .prepare(`
      INSERT INTO integrations (id, app_id, type, name, config, enabled, events, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?)
    `)
    .bind(
      id,
      appId,
      data.type,
      data.name,
      JSON.stringify(data.config),
      JSON.stringify(data.events || ['*']),
      now,
      now
    )
    .run();

  return {
    id,
    appId,
    type: data.type,
    name: data.name,
    config: data.config,
    enabled: true,
    events: data.events || ['*'],
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Update integration
 */
export async function updateIntegration(
  db: D1Database,
  integrationId: string,
  data: {
    name?: string;
    config?: IntegrationConfig;
    enabled?: boolean;
    events?: string[];
  }
): Promise<void> {
  const now = Date.now();
  const updates: string[] = ['updated_at = ?'];
  const values: (string | number)[] = [now];

  if (data.name !== undefined) {
    updates.push('name = ?');
    values.push(data.name);
  }
  if (data.config !== undefined) {
    updates.push('config = ?');
    values.push(JSON.stringify(data.config));
  }
  if (data.enabled !== undefined) {
    updates.push('enabled = ?');
    values.push(data.enabled ? 1 : 0);
  }
  if (data.events !== undefined) {
    updates.push('events = ?');
    values.push(JSON.stringify(data.events));
  }

  values.push(integrationId);

  await db
    .prepare(`UPDATE integrations SET ${updates.join(', ')} WHERE id = ?`)
    .bind(...values)
    .run();
}

/**
 * Delete integration
 */
export async function deleteIntegration(
  db: D1Database,
  integrationId: string
): Promise<void> {
  await db.prepare('DELETE FROM integrations WHERE id = ?').bind(integrationId).run();
}

/**
 * Send event to all enabled integrations
 */
export async function dispatchIntegrationEvent(
  db: D1Database,
  event: IntegrationEvent
): Promise<void> {
  const integrations = await getEnabledIntegrationsForEvent(db, event.appId, event.type);

  const dispatches = integrations.map((integration) =>
    sendToIntegration(integration, event).catch((error) => {
      console.error(`Failed to send to ${integration.type}:`, error);
    })
  );

  await Promise.allSettled(dispatches);
}

/**
 * Send event to a specific integration
 */
async function sendToIntegration(
  integration: Integration,
  event: IntegrationEvent
): Promise<void> {
  switch (integration.type) {
    case 'amplitude':
      await sendToAmplitude(integration.config as AmplitudeConfig, event);
      break;
    case 'mixpanel':
      await sendToMixpanel(integration.config as MixpanelConfig, event);
      break;
    case 'segment':
      await sendToSegment(integration.config as SegmentConfig, event);
      break;
    case 'firebase':
      await sendToFirebase(integration.config as FirebaseConfig, event);
      break;
    case 'braze':
      await sendToBraze(integration.config as BrazeConfig, event);
      break;
    case 'slack':
      await sendToSlack(integration.config as SlackConfig, event);
      break;
    case 'appsflyer':
      await sendToAppsflyer(integration.config as AppsflyerConfig, event);
      break;
    case 'adjust':
      await sendToAdjust(integration.config as AdjustConfig, event);
      break;
    case 'webhook':
      await sendToWebhook(integration.config as WebhookConfig, event);
      break;
  }
}

// Integration-specific senders

async function sendToAmplitude(config: AmplitudeConfig, event: IntegrationEvent): Promise<void> {
  const amplitudeEvent = {
    api_key: config.apiKey,
    events: [
      {
        user_id: event.appUserId,
        event_type: `mrrcat_${event.type}`,
        time: event.timestamp,
        event_properties: {
          product_id: event.productId,
          platform: event.platform,
          revenue: event.revenue,
          currency: event.currency,
          ...event.properties,
        },
        revenue: event.revenue,
        revenueType: event.type,
        productId: event.productId,
      },
    ],
  };

  await fetch('https://api2.amplitude.com/2/httpapi', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(amplitudeEvent),
  });
}

async function sendToMixpanel(config: MixpanelConfig, event: IntegrationEvent): Promise<void> {
  const mixpanelEvent = {
    event: `MRRCat ${formatEventName(event.type)}`,
    properties: {
      token: config.token,
      distinct_id: event.appUserId,
      time: Math.floor(event.timestamp / 1000),
      $insert_id: generateId(),
      product_id: event.productId,
      platform: event.platform,
      revenue: event.revenue,
      currency: event.currency,
      ...event.properties,
    },
  };

  const data = btoa(JSON.stringify(mixpanelEvent));
  await fetch(`https://api.mixpanel.com/track?data=${data}`);
}

async function sendToSegment(config: SegmentConfig, event: IntegrationEvent): Promise<void> {
  const segmentEvent = {
    userId: event.appUserId,
    event: `MRRCat ${formatEventName(event.type)}`,
    properties: {
      product_id: event.productId,
      platform: event.platform,
      revenue: event.revenue,
      currency: event.currency,
      ...event.properties,
    },
    timestamp: new Date(event.timestamp).toISOString(),
  };

  const auth = btoa(`${config.writeKey}:`);

  await fetch('https://api.segment.io/v1/track', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Basic ${auth}`,
    },
    body: JSON.stringify(segmentEvent),
  });
}

async function sendToFirebase(config: FirebaseConfig, event: IntegrationEvent): Promise<void> {
  // Firebase Analytics via Measurement Protocol
  const measurementId = config.projectId;

  const firebaseEvent = {
    client_id: event.appUserId,
    user_id: event.appUserId,
    timestamp_micros: event.timestamp * 1000,
    events: [
      {
        name: `mrrcat_${event.type}`,
        params: {
          product_id: event.productId,
          platform: event.platform,
          value: event.revenue,
          currency: event.currency,
          ...event.properties,
        },
      },
    ],
  };

  await fetch(
    `https://www.google-analytics.com/mp/collect?measurement_id=${measurementId}&api_secret=${config.serviceAccountJson}`,
    {
      method: 'POST',
      body: JSON.stringify(firebaseEvent),
    }
  );
}

async function sendToBraze(config: BrazeConfig, event: IntegrationEvent): Promise<void> {
  const brazeEvent = {
    events: [
      {
        external_id: event.appUserId,
        name: `mrrcat_${event.type}`,
        time: new Date(event.timestamp).toISOString(),
        properties: {
          product_id: event.productId,
          platform: event.platform,
          revenue: event.revenue,
          currency: event.currency,
          ...event.properties,
        },
      },
    ],
  };

  await fetch(`https://${config.restEndpoint}/users/track`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify(brazeEvent),
  });
}

async function sendToSlack(config: SlackConfig, event: IntegrationEvent): Promise<void> {
  const emoji = getEventEmoji(event.type);
  const text = formatSlackMessage(event, emoji);

  const payload: Record<string, unknown> = { text };
  if (config.channel) {
    payload.channel = config.channel;
  }

  await fetch(config.webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

async function sendToAppsflyer(config: AppsflyerConfig, event: IntegrationEvent): Promise<void> {
  const appsflyerEvent = {
    appsflyer_id: event.appUserId,
    customer_user_id: event.appUserId,
    eventName: `mrrcat_${event.type}`,
    eventValue: JSON.stringify({
      product_id: event.productId,
      platform: event.platform,
      revenue: event.revenue,
      currency: event.currency,
      ...event.properties,
    }),
    eventTime: new Date(event.timestamp).toISOString(),
  };

  await fetch(
    `https://api2.appsflyer.com/inappevent/${config.appId}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        authentication: config.devKey,
      },
      body: JSON.stringify(appsflyerEvent),
    }
  );
}

async function sendToAdjust(config: AdjustConfig, event: IntegrationEvent): Promise<void> {
  const eventToken = getAdjustEventToken(event.type);

  const params = new URLSearchParams({
    app_token: config.appToken,
    event_token: eventToken,
    s2s: '1',
    environment: config.environment,
    adid: event.appUserId,
  });

  if (event.revenue) {
    params.append('revenue', event.revenue.toString());
    params.append('currency', event.currency || 'USD');
  }

  await fetch(`https://s2s.adjust.com/event?${params.toString()}`);
}

async function sendToWebhook(config: WebhookConfig, event: IntegrationEvent): Promise<void> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...config.headers,
  };

  // Add signature if secret is configured
  if (config.secret) {
    const payload = JSON.stringify(event);
    const signature = await computeHmacSignature(payload, config.secret);
    headers['X-MRRCat-Signature'] = signature;
  }

  await fetch(config.url, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      event: event.type,
      timestamp: event.timestamp,
      data: {
        app_user_id: event.appUserId,
        subscriber_id: event.subscriberId,
        product_id: event.productId,
        platform: event.platform,
        revenue: event.revenue,
        currency: event.currency,
        properties: event.properties,
      },
    }),
  });
}

// Helper functions

function mapIntegrationRow(row: IntegrationRow): Integration {
  return {
    id: row.id,
    appId: row.app_id,
    type: row.type as IntegrationType,
    name: row.name,
    config: JSON.parse(row.config),
    enabled: row.enabled === 1,
    events: JSON.parse(row.events),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function formatEventName(eventType: IntegrationEventType): string {
  return eventType
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function getEventEmoji(eventType: IntegrationEventType): string {
  const emojis: Record<IntegrationEventType, string> = {
    initial_purchase: '💰',
    renewal: '🔄',
    cancellation: '❌',
    uncancellation: '✅',
    expiration: '⏰',
    billing_issue: '⚠️',
    grace_period_started: '🟡',
    grace_period_ended: '🔴',
    trial_started: '🎁',
    trial_converted: '🎉',
    trial_cancelled: '👋',
    refund: '💸',
    product_change: '🔀',
    subscriber_alias: '👤',
  };
  return emojis[eventType] || '📌';
}

function formatSlackMessage(event: IntegrationEvent, emoji: string): string {
  const eventName = formatEventName(event.type);
  let message = `${emoji} *${eventName}*\n`;
  message += `User: \`${event.appUserId}\`\n`;

  if (event.productId) {
    message += `Product: \`${event.productId}\`\n`;
  }
  if (event.platform) {
    message += `Platform: ${event.platform}\n`;
  }
  if (event.revenue) {
    message += `Revenue: ${event.currency || 'USD'} ${(event.revenue / 100).toFixed(2)}\n`;
  }

  return message;
}

function getAdjustEventToken(eventType: IntegrationEventType): string {
  // These would be configured per app, using placeholder tokens
  const tokens: Record<string, string> = {
    initial_purchase: 'abc123',
    renewal: 'def456',
    cancellation: 'ghi789',
    refund: 'jkl012',
  };
  return tokens[eventType] || 'default';
}

async function computeHmacSignature(payload: string, secret: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(payload));
  return Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
