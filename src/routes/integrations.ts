/**
 * Integrations Routes
 * Manage third-party integrations (Amplitude, Mixpanel, Segment, etc.)
 */

import { Hono } from 'hono';
import type { Env, App } from '../types';
import {
  getIntegrations,
  createIntegration,
  updateIntegration,
  deleteIntegration,
  type IntegrationType,
  type IntegrationConfig,
} from '../services/integrations';
import { Errors } from '../middleware/error';
import { generateId } from '../utils/id';

type Variables = { app: App };

export const integrationsRouter = new Hono<{
  Bindings: Env;
  Variables: Variables;
}>();

const VALID_INTEGRATION_TYPES: IntegrationType[] = [
  'amplitude',
  'mixpanel',
  'segment',
  'firebase',
  'braze',
  'slack',
  'appsflyer',
  'adjust',
  'webhook',
];

const VALID_EVENTS = [
  '*',
  'initial_purchase',
  'renewal',
  'cancellation',
  'uncancellation',
  'expiration',
  'billing_issue',
  'grace_period_started',
  'grace_period_ended',
  'trial_started',
  'trial_converted',
  'trial_cancelled',
  'refund',
  'product_change',
  'subscriber_alias',
];

/**
 * GET /v1/integrations
 * List all integrations
 */
integrationsRouter.get('/', async (c) => {
  const app = c.get('app');

  const integrations = await getIntegrations(c.env.DB, app.id);

  return c.json({
    integrations: integrations.map((i) => ({
      id: i.id,
      type: i.type,
      name: i.name,
      enabled: i.enabled,
      events: i.events,
      created_at: new Date(i.createdAt).toISOString(),
      // Don't expose full config for security
      config_preview: getConfigPreview(i.type, i.config),
    })),
  });
});

/**
 * POST /v1/integrations
 * Create a new integration
 */
integrationsRouter.post('/', async (c) => {
  const app = c.get('app');
  const body = await c.req.json<{
    type: IntegrationType;
    name: string;
    config: IntegrationConfig;
    events?: string[];
  }>();

  if (!body.type || !VALID_INTEGRATION_TYPES.includes(body.type)) {
    throw Errors.validationError(`type must be one of: ${VALID_INTEGRATION_TYPES.join(', ')}`);
  }

  if (!body.name) {
    throw Errors.validationError('name is required');
  }

  if (!body.config) {
    throw Errors.validationError('config is required');
  }

  // Validate config based on type
  validateConfig(body.type, body.config);

  // Validate events
  if (body.events) {
    for (const event of body.events) {
      if (!VALID_EVENTS.includes(event)) {
        throw Errors.validationError(`Invalid event: ${event}`);
      }
    }
  }

  const integration = await createIntegration(c.env.DB, app.id, {
    type: body.type,
    name: body.name,
    config: body.config,
    events: body.events,
  });

  return c.json(
    {
      integration: {
        id: integration.id,
        type: integration.type,
        name: integration.name,
        enabled: integration.enabled,
        events: integration.events,
        created_at: new Date(integration.createdAt).toISOString(),
      },
    },
    201
  );
});

/**
 * GET /v1/integrations/:id
 * Get integration details
 */
integrationsRouter.get('/:id', async (c) => {
  const app = c.get('app');
  const integrationId = c.req.param('id');

  const integrations = await getIntegrations(c.env.DB, app.id);
  const integration = integrations.find((i) => i.id === integrationId);

  if (!integration) {
    throw Errors.notFound('Integration');
  }

  return c.json({
    integration: {
      id: integration.id,
      type: integration.type,
      name: integration.name,
      enabled: integration.enabled,
      events: integration.events,
      config: integration.config, // Full config for detail view
      created_at: new Date(integration.createdAt).toISOString(),
      updated_at: new Date(integration.updatedAt).toISOString(),
    },
  });
});

/**
 * PATCH /v1/integrations/:id
 * Update integration
 */
integrationsRouter.patch('/:id', async (c) => {
  const app = c.get('app');
  const integrationId = c.req.param('id');
  const body = await c.req.json<{
    name?: string;
    config?: IntegrationConfig;
    enabled?: boolean;
    events?: string[];
  }>();

  // Verify integration exists and belongs to app
  const integrations = await getIntegrations(c.env.DB, app.id);
  const integration = integrations.find((i) => i.id === integrationId);

  if (!integration) {
    throw Errors.notFound('Integration');
  }

  // Validate events
  if (body.events) {
    for (const event of body.events) {
      if (!VALID_EVENTS.includes(event)) {
        throw Errors.validationError(`Invalid event: ${event}`);
      }
    }
  }

  // Validate config if provided
  if (body.config) {
    validateConfig(integration.type, body.config);
  }

  await updateIntegration(c.env.DB, integrationId, body);

  return c.json({ updated: true });
});

/**
 * DELETE /v1/integrations/:id
 * Delete integration
 */
integrationsRouter.delete('/:id', async (c) => {
  const app = c.get('app');
  const integrationId = c.req.param('id');

  // Verify integration exists and belongs to app
  const integrations = await getIntegrations(c.env.DB, app.id);
  const integration = integrations.find((i) => i.id === integrationId);

  if (!integration) {
    throw Errors.notFound('Integration');
  }

  await deleteIntegration(c.env.DB, integrationId);

  return c.json({ deleted: true });
});

/**
 * POST /v1/integrations/:id/test
 * Test integration connection
 */
integrationsRouter.post('/:id/test', async (c) => {
  const app = c.get('app');
  const integrationId = c.req.param('id');

  const integrations = await getIntegrations(c.env.DB, app.id);
  const integration = integrations.find((i) => i.id === integrationId);

  if (!integration) {
    throw Errors.notFound('Integration');
  }

  try {
    // Send a test event
    const testResult = await testIntegrationConnection(integration);
    return c.json({ success: true, message: testResult });
  } catch (error) {
    return c.json({ success: false, error: (error as Error).message }, 400);
  }
});

/**
 * GET /v1/integrations/events
 * List available event types
 */
integrationsRouter.get('/events', async (c) => {
  return c.json({
    events: VALID_EVENTS.filter((e) => e !== '*').map((e) => ({
      type: e,
      description: getEventDescription(e),
    })),
  });
});

// Custom Events Routes

/**
 * POST /v1/events
 * Track a custom event
 */
integrationsRouter.post('/events', async (c) => {
  const app = c.get('app');
  const body = await c.req.json<{
    app_user_id: string;
    event_name: string;
    properties?: Record<string, unknown>;
    timestamp?: number;
  }>();

  if (!body.app_user_id) {
    throw Errors.validationError('app_user_id is required');
  }

  if (!body.event_name) {
    throw Errors.validationError('event_name is required');
  }

  const id = generateId();
  const now = Date.now();
  const timestamp = body.timestamp || now;

  // Get subscriber
  const subscriber = await c.env.DB.prepare(
    'SELECT id FROM subscribers WHERE app_id = ? AND app_user_id = ?'
  )
    .bind(app.id, body.app_user_id)
    .first<{ id: string }>();

  await c.env.DB.prepare(`
    INSERT INTO custom_events (id, app_id, subscriber_id, event_name, event_properties, timestamp, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `)
    .bind(
      id,
      app.id,
      subscriber?.id || null,
      body.event_name,
      body.properties ? JSON.stringify(body.properties) : null,
      timestamp,
      now
    )
    .run();

  return c.json(
    {
      event: {
        id,
        event_name: body.event_name,
        app_user_id: body.app_user_id,
        timestamp: new Date(timestamp).toISOString(),
      },
    },
    201
  );
});

/**
 * GET /v1/events
 * List custom events
 */
integrationsRouter.get('/events', async (c) => {
  const app = c.get('app');
  const limit = Math.min(parseInt(c.req.query('limit') || '100'), 1000);
  const offset = parseInt(c.req.query('offset') || '0');
  const eventName = c.req.query('event_name');
  const appUserId = c.req.query('app_user_id');

  let query = 'SELECT * FROM custom_events WHERE app_id = ?';
  const params: (string | number)[] = [app.id];

  if (eventName) {
    query += ' AND event_name = ?';
    params.push(eventName);
  }

  if (appUserId) {
    const subscriber = await c.env.DB.prepare(
      'SELECT id FROM subscribers WHERE app_id = ? AND app_user_id = ?'
    )
      .bind(app.id, appUserId)
      .first<{ id: string }>();

    if (subscriber) {
      query += ' AND subscriber_id = ?';
      params.push(subscriber.id);
    }
  }

  query += ' ORDER BY timestamp DESC LIMIT ? OFFSET ?';
  params.push(limit, offset);

  const events = await c.env.DB.prepare(query)
    .bind(...params)
    .all();

  return c.json({
    events: events.results.map((e: any) => ({
      id: e.id,
      event_name: e.event_name,
      properties: e.event_properties ? JSON.parse(e.event_properties) : null,
      timestamp: new Date(e.timestamp).toISOString(),
      created_at: new Date(e.created_at).toISOString(),
    })),
  });
});

// Helper functions

function validateConfig(type: IntegrationType, config: any): void {
  switch (type) {
    case 'amplitude':
      if (!config.apiKey) throw Errors.validationError('Amplitude requires apiKey');
      break;
    case 'mixpanel':
      if (!config.token) throw Errors.validationError('Mixpanel requires token');
      break;
    case 'segment':
      if (!config.writeKey) throw Errors.validationError('Segment requires writeKey');
      break;
    case 'firebase':
      if (!config.projectId) throw Errors.validationError('Firebase requires projectId');
      break;
    case 'braze':
      if (!config.apiKey || !config.restEndpoint)
        throw Errors.validationError('Braze requires apiKey and restEndpoint');
      break;
    case 'slack':
      if (!config.webhookUrl) throw Errors.validationError('Slack requires webhookUrl');
      break;
    case 'appsflyer':
      if (!config.devKey || !config.appId)
        throw Errors.validationError('AppsFlyer requires devKey and appId');
      break;
    case 'adjust':
      if (!config.appToken) throw Errors.validationError('Adjust requires appToken');
      break;
    case 'webhook':
      if (!config.url) throw Errors.validationError('Webhook requires url');
      break;
  }
}

function getConfigPreview(type: IntegrationType, config: any): string {
  switch (type) {
    case 'amplitude':
      return `API Key: ${maskString(config.apiKey)}`;
    case 'mixpanel':
      return `Token: ${maskString(config.token)}`;
    case 'segment':
      return `Write Key: ${maskString(config.writeKey)}`;
    case 'firebase':
      return `Project: ${config.projectId}`;
    case 'braze':
      return `Endpoint: ${config.restEndpoint}`;
    case 'slack':
      return `Webhook: ${maskString(config.webhookUrl)}`;
    case 'appsflyer':
      return `App ID: ${config.appId}`;
    case 'adjust':
      return `App Token: ${maskString(config.appToken)}`;
    case 'webhook':
      return `URL: ${config.url}`;
    default:
      return 'Configured';
  }
}

function maskString(str: string): string {
  if (!str || str.length < 8) return '****';
  return str.substring(0, 4) + '****' + str.substring(str.length - 4);
}

async function testIntegrationConnection(integration: any): Promise<string> {
  // Basic connectivity test based on integration type
  switch (integration.type) {
    case 'slack':
      // Test Slack webhook
      const slackResponse = await fetch(integration.config.webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: '🧪 PayCat integration test - connection successful!' }),
      });
      if (!slackResponse.ok) throw new Error('Slack webhook failed');
      return 'Slack message sent successfully';

    case 'webhook':
      // Test custom webhook
      const webhookResponse = await fetch(integration.config.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...integration.config.headers,
        },
        body: JSON.stringify({ test: true, timestamp: Date.now() }),
      });
      if (!webhookResponse.ok) throw new Error(`Webhook returned ${webhookResponse.status}`);
      return 'Webhook responded successfully';

    default:
      return 'Configuration looks valid (full test requires actual event)';
  }
}

function getEventDescription(event: string): string {
  const descriptions: Record<string, string> = {
    initial_purchase: 'First subscription purchase',
    renewal: 'Subscription renewed',
    cancellation: 'Subscription cancelled',
    uncancellation: 'Cancellation reversed',
    expiration: 'Subscription expired',
    billing_issue: 'Payment failed',
    grace_period_started: 'Grace period began',
    grace_period_ended: 'Grace period ended',
    trial_started: 'Free trial started',
    trial_converted: 'Trial converted to paid',
    trial_cancelled: 'Trial cancelled',
    refund: 'Refund issued',
    product_change: 'Plan upgrade/downgrade',
    subscriber_alias: 'User ID aliased',
  };
  return descriptions[event] || event;
}
