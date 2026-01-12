/**
 * Webhook Management Routes
 * Configure customer webhook endpoints
 */

import { Hono } from 'hono';
import type { Env, App, EventType } from '../types';
import { createWebhook } from '../db/queries';
import { generateWebhookSecret } from '../utils/id';
import { Errors } from '../middleware/error';
import { toISOString } from '../utils/time';

type Variables = { app: App };

// Valid event types
const VALID_EVENT_TYPES: EventType[] = [
  'initial_purchase',
  'renewal',
  'cancellation',
  'expiration',
  'refund',
  'billing_issue',
  'grace_period_started',
  'grace_period_expired',
  'trial_started',
  'trial_converted',
  'product_change',
];

export const webhooksRouter = new Hono<{
  Bindings: Env;
  Variables: Variables;
}>();

/**
 * GET /v1/webhooks
 * List all webhooks
 */
webhooksRouter.get('/', async (c) => {
  const app = c.get('app');

  const result = await c.env.DB.prepare(
    'SELECT id, url, events, active, created_at FROM webhooks WHERE app_id = ?'
  )
    .bind(app.id)
    .all();

  const webhooks = (result.results || []).map((wh) => {
    let events: string[] = [];
    try {
      events = JSON.parse(wh.events as string);
    } catch {
      events = ['*'];
    }
    return {
      id: wh.id,
      url: wh.url,
      events,
      active: !!wh.active,
      created_at: toISOString(wh.created_at as number),
    };
  });

  return c.json({ webhooks });
});

/**
 * POST /v1/webhooks
 * Create a new webhook endpoint
 */
webhooksRouter.post('/', async (c) => {
  const app = c.get('app');
  const body = await c.req.json<{
    url: string;
    events?: string[];
  }>();

  // Validate URL
  if (!body.url) {
    throw Errors.validationError('url is required');
  }

  try {
    new URL(body.url);
  } catch {
    throw Errors.validationError('Invalid URL format');
  }

  if (!body.url.startsWith('https://')) {
    throw Errors.validationError('Webhook URL must use HTTPS');
  }

  // Validate events
  const events = body.events || ['*'];
  for (const event of events) {
    if (event !== '*' && !VALID_EVENT_TYPES.includes(event as EventType)) {
      throw Errors.validationError(`Invalid event type: ${event}`);
    }
  }

  // Generate secret
  const secret = generateWebhookSecret();

  // Create webhook
  const webhook = await createWebhook(c.env.DB, app.id, body.url, secret, events);

  return c.json(
    {
      webhook: {
        id: webhook.id,
        url: webhook.url,
        secret: webhook.secret, // Only returned once on creation
        events: events,
        active: true,
        created_at: toISOString(webhook.created_at),
      },
    },
    201
  );
});

/**
 * GET /v1/webhooks/:id
 * Get webhook by ID
 */
webhooksRouter.get('/:id', async (c) => {
  const app = c.get('app');
  const id = c.req.param('id');

  const webhook = await c.env.DB.prepare(
    'SELECT id, url, events, active, created_at FROM webhooks WHERE id = ? AND app_id = ?'
  )
    .bind(id, app.id)
    .first();

  if (!webhook) {
    throw Errors.notFound('Webhook');
  }

  let events: string[] = [];
  try {
    events = JSON.parse(webhook.events as string);
  } catch {
    events = ['*'];
  }

  return c.json({
    webhook: {
      id: webhook.id,
      url: webhook.url,
      events,
      active: !!webhook.active,
      created_at: toISOString(webhook.created_at as number),
    },
  });
});

/**
 * PATCH /v1/webhooks/:id
 * Update webhook
 */
webhooksRouter.patch('/:id', async (c) => {
  const app = c.get('app');
  const id = c.req.param('id');
  const body = await c.req.json<{
    url?: string;
    events?: string[];
    active?: boolean;
  }>();

  const webhook = await c.env.DB.prepare(
    'SELECT id FROM webhooks WHERE id = ? AND app_id = ?'
  )
    .bind(id, app.id)
    .first();

  if (!webhook) {
    throw Errors.notFound('Webhook');
  }

  const updates: string[] = [];
  const values: (string | number)[] = [];

  if (body.url !== undefined) {
    try {
      new URL(body.url);
    } catch {
      throw Errors.validationError('Invalid URL format');
    }
    if (!body.url.startsWith('https://')) {
      throw Errors.validationError('Webhook URL must use HTTPS');
    }
    updates.push('url = ?');
    values.push(body.url);
  }

  if (body.events !== undefined) {
    for (const event of body.events) {
      if (event !== '*' && !VALID_EVENT_TYPES.includes(event as EventType)) {
        throw Errors.validationError(`Invalid event type: ${event}`);
      }
    }
    updates.push('events = ?');
    values.push(JSON.stringify(body.events));
  }

  if (body.active !== undefined) {
    updates.push('active = ?');
    values.push(body.active ? 1 : 0);
  }

  if (updates.length > 0) {
    values.push(id);
    await c.env.DB.prepare(
      `UPDATE webhooks SET ${updates.join(', ')} WHERE id = ?`
    )
      .bind(...values)
      .run();
  }

  // Get updated webhook
  const updated = await c.env.DB.prepare(
    'SELECT id, url, events, active, created_at FROM webhooks WHERE id = ?'
  )
    .bind(id)
    .first();

  let updatedEvents: string[] = [];
  try {
    updatedEvents = JSON.parse(updated!.events as string);
  } catch {
    updatedEvents = ['*'];
  }

  return c.json({
    webhook: {
      id: updated!.id,
      url: updated!.url,
      events: updatedEvents,
      active: !!updated!.active,
      created_at: toISOString(updated!.created_at as number),
    },
  });
});

/**
 * DELETE /v1/webhooks/:id
 * Delete webhook
 */
webhooksRouter.delete('/:id', async (c) => {
  const app = c.get('app');
  const id = c.req.param('id');

  const webhook = await c.env.DB.prepare(
    'SELECT id FROM webhooks WHERE id = ? AND app_id = ?'
  )
    .bind(id, app.id)
    .first();

  if (!webhook) {
    throw Errors.notFound('Webhook');
  }

  // Delete deliveries first
  await c.env.DB.prepare(
    'DELETE FROM webhook_deliveries WHERE webhook_id = ?'
  )
    .bind(id)
    .run();

  // Delete webhook
  await c.env.DB.prepare('DELETE FROM webhooks WHERE id = ?')
    .bind(id)
    .run();

  return c.json({ deleted: true });
});

/**
 * POST /v1/webhooks/:id/rotate-secret
 * Rotate webhook secret
 */
webhooksRouter.post('/:id/rotate-secret', async (c) => {
  const app = c.get('app');
  const id = c.req.param('id');

  const webhook = await c.env.DB.prepare(
    'SELECT id FROM webhooks WHERE id = ? AND app_id = ?'
  )
    .bind(id, app.id)
    .first();

  if (!webhook) {
    throw Errors.notFound('Webhook');
  }

  // Generate new secret
  const newSecret = generateWebhookSecret();

  await c.env.DB.prepare('UPDATE webhooks SET secret = ? WHERE id = ?')
    .bind(newSecret, id)
    .run();

  return c.json({
    webhook: {
      id,
      secret: newSecret, // Return new secret
    },
  });
});

/**
 * GET /v1/webhooks/:id/deliveries
 * Get webhook delivery history
 */
webhooksRouter.get('/:id/deliveries', async (c) => {
  const app = c.get('app');
  const id = c.req.param('id');
  const limit = parseInt(c.req.query('limit') || '50', 10);
  const offset = parseInt(c.req.query('offset') || '0', 10);

  const webhook = await c.env.DB.prepare(
    'SELECT id FROM webhooks WHERE id = ? AND app_id = ?'
  )
    .bind(id, app.id)
    .first();

  if (!webhook) {
    throw Errors.notFound('Webhook');
  }

  const result = await c.env.DB.prepare(
    `SELECT id, event_type, response_status, attempts, delivered_at, created_at
     FROM webhook_deliveries
     WHERE webhook_id = ?
     ORDER BY created_at DESC
     LIMIT ? OFFSET ?`
  )
    .bind(id, limit, offset)
    .all();

  const deliveries = (result.results || []).map((d) => ({
    id: d.id,
    event_type: d.event_type,
    response_status: d.response_status,
    attempts: d.attempts,
    delivered: d.delivered_at !== null,
    delivered_at: d.delivered_at ? toISOString(d.delivered_at as number) : null,
    created_at: toISOString(d.created_at as number),
  }));

  return c.json({ deliveries, limit, offset });
});

/**
 * POST /v1/webhooks/:id/test
 * Send a test webhook
 */
webhooksRouter.post('/:id/test', async (c) => {
  const app = c.get('app');
  const id = c.req.param('id');

  const webhook = await c.env.DB.prepare(
    'SELECT * FROM webhooks WHERE id = ? AND app_id = ?'
  )
    .bind(id, app.id)
    .first();

  if (!webhook) {
    throw Errors.notFound('Webhook');
  }

  // Send test event
  const testPayload = {
    id: 'test_' + Date.now(),
    type: 'test',
    created_at: new Date().toISOString(),
    data: {
      message: 'This is a test webhook from MRRCat',
    },
  };

  const timestamp = Math.floor(Date.now() / 1000);
  const payloadString = JSON.stringify(testPayload);

  // Import dynamically to avoid circular dependency
  const { hmacSha256 } = await import('../utils/crypto');
  const signaturePayload = `${timestamp}.${payloadString}`;
  const signature = await hmacSha256(webhook.secret as string, signaturePayload);

  // Set timeout for test webhook (10 seconds max)
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);

  try {
    const response = await fetch(webhook.url as string, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-MRRCat-Signature': `t=${timestamp},v1=${signature}`,
        'X-MRRCat-Delivery-ID': 'test',
        'User-Agent': 'MRRCat-Webhook/1.0',
      },
      body: payloadString,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    const responseBody = await response.text().catch(() => '');

    return c.json({
      success: response.ok,
      status: response.status,
      response: responseBody.slice(0, 500), // Limit response size
    });
  } catch (error) {
    clearTimeout(timeoutId);

    if (error instanceof Error && error.name === 'AbortError') {
      return c.json({
        success: false,
        error: 'Request timeout (10 seconds exceeded)',
      });
    }

    return c.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});
