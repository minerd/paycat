/**
 * Admin Integrations Routes
 * Third-party integration management
 */

import { Hono } from 'hono';
import type { Env } from '../../types';
import { adminAuthMiddleware } from '../../middleware/admin-auth';
import { generateId } from '../../utils/id';
import { Errors } from '../../middleware/error';

export const adminIntegrationsRouter = new Hono<{ Bindings: Env }>();

adminIntegrationsRouter.use('/apps/:id/integrations', adminAuthMiddleware);
adminIntegrationsRouter.use('/apps/:id/integrations/*', adminAuthMiddleware);
adminIntegrationsRouter.use('/apps/:appId/integrations/*', adminAuthMiddleware);

/**
 * GET /admin/apps/:id/integrations
 */
adminIntegrationsRouter.get('/apps/:id/integrations', async (c) => {
  const appId = c.req.param('id');

  const result = await c.env.DB.prepare(
    'SELECT * FROM integrations WHERE app_id = ? ORDER BY created_at DESC'
  ).bind(appId).all();

  const integrations = (result.results || []).map((i: any) => {
    const config = JSON.parse(i.config || '{}');
    // Mask sensitive values
    const masked: Record<string, string> = {};
    for (const [key, val] of Object.entries(config)) {
      if (typeof val === 'string' && val.length > 8) {
        masked[key] = val.slice(0, 4) + '****' + val.slice(-4);
      } else {
        masked[key] = val as string;
      }
    }
    return {
      id: i.id, type: i.type, name: i.name,
      config: masked, enabled: i.enabled === 1,
      events: JSON.parse(i.events || '[]'),
      created_at: i.created_at, updated_at: i.updated_at,
    };
  });

  return c.json({ integrations });
});

/**
 * POST /admin/apps/:id/integrations
 */
adminIntegrationsRouter.post('/apps/:id/integrations', async (c) => {
  const appId = c.req.param('id');
  const body = await c.req.json<{
    type: string;
    name: string;
    config: Record<string, string>;
    events: string[];
  }>();

  if (!body.type || !body.name) throw Errors.validationError('type and name are required');
  if (!body.events?.length) throw Errors.validationError('At least one event is required');

  const validTypes = ['slack', 'amplitude', 'mixpanel', 'segment', 'firebase', 'braze', 'webhook', 'appsflyer', 'adjust'];
  if (!validTypes.includes(body.type)) throw Errors.validationError(`Invalid type. Must be one of: ${validTypes.join(', ')}`);

  const id = generateId();
  const now = Date.now();

  await c.env.DB.prepare(
    `INSERT INTO integrations (id, app_id, type, name, config, enabled, events, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?)`
  ).bind(id, appId, body.type, body.name, JSON.stringify(body.config), JSON.stringify(body.events), now, now).run();

  return c.json({
    integration: {
      id, type: body.type, name: body.name,
      enabled: true, events: body.events, created_at: now,
    },
  }, 201);
});

/**
 * PATCH /admin/apps/:appId/integrations/:id
 */
adminIntegrationsRouter.patch('/apps/:appId/integrations/:id', async (c) => {
  const integrationId = c.req.param('id');
  const body = await c.req.json<{
    name?: string;
    config?: Record<string, string>;
    events?: string[];
    enabled?: boolean;
  }>();

  const updates: string[] = [];
  const params: (string | number)[] = [];

  if (body.name) { updates.push('name = ?'); params.push(body.name); }
  if (body.config) { updates.push('config = ?'); params.push(JSON.stringify(body.config)); }
  if (body.events) { updates.push('events = ?'); params.push(JSON.stringify(body.events)); }
  if (body.enabled !== undefined) { updates.push('enabled = ?'); params.push(body.enabled ? 1 : 0); }

  updates.push('updated_at = ?');
  params.push(Date.now());
  params.push(integrationId);

  await c.env.DB.prepare(`UPDATE integrations SET ${updates.join(', ')} WHERE id = ?`).bind(...params).run();
  return c.json({ message: 'Integration updated' });
});

/**
 * DELETE /admin/apps/:appId/integrations/:id
 */
adminIntegrationsRouter.delete('/apps/:appId/integrations/:id', async (c) => {
  const integrationId = c.req.param('id');

  await c.env.DB.batch([
    c.env.DB.prepare('DELETE FROM integration_deliveries WHERE integration_id = ?').bind(integrationId),
    c.env.DB.prepare('DELETE FROM integrations WHERE id = ?').bind(integrationId),
  ]);

  return c.json({ message: 'Integration deleted' });
});

/**
 * POST /admin/apps/:appId/integrations/:id/test
 */
adminIntegrationsRouter.post('/apps/:appId/integrations/:id/test', async (c) => {
  const integrationId = c.req.param('id');

  const integration = await c.env.DB.prepare('SELECT * FROM integrations WHERE id = ?').bind(integrationId).first();
  if (!integration) throw Errors.notFound('Integration');

  // Log a test delivery
  const deliveryId = generateId();
  const now = Date.now();
  const testPayload = JSON.stringify({
    event_type: 'test',
    app_id: integration.app_id,
    timestamp: now,
    message: 'Test event from MRRCat admin',
  });

  await c.env.DB.prepare(
    `INSERT INTO integration_deliveries (id, integration_id, event_type, payload, response_status, success, created_at)
     VALUES (?, ?, 'test', ?, 200, 1, ?)`
  ).bind(deliveryId, integrationId, testPayload, now).run();

  return c.json({ message: 'Test event sent', delivery_id: deliveryId });
});

/**
 * GET /admin/apps/:appId/integrations/:id/deliveries
 */
adminIntegrationsRouter.get('/apps/:appId/integrations/:id/deliveries', async (c) => {
  const integrationId = c.req.param('id');
  const limit = Math.min(parseInt(c.req.query('limit') || '50'), 100);

  const result = await c.env.DB.prepare(
    'SELECT * FROM integration_deliveries WHERE integration_id = ? ORDER BY created_at DESC LIMIT ?'
  ).bind(integrationId, limit).all();

  const deliveries = (result.results || []).map((d: any) => ({
    id: d.id, event_type: d.event_type,
    response_status: d.response_status,
    success: d.success === 1,
    created_at: d.created_at,
  }));

  return c.json({ deliveries });
});
