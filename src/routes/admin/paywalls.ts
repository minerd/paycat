/**
 * Admin Paywalls Routes
 * Paywall template management
 */

import { Hono } from 'hono';
import type { Env } from '../../types';
import { adminAuthMiddleware } from '../../middleware/admin-auth';
import { generateId } from '../../utils/id';
import { Errors } from '../../middleware/error';

export const adminPaywallsRouter = new Hono<{ Bindings: Env }>();

adminPaywallsRouter.use('/apps/:id/paywalls', adminAuthMiddleware);
adminPaywallsRouter.use('/apps/:id/paywalls/*', adminAuthMiddleware);

/**
 * GET /admin/apps/:id/paywalls
 */
adminPaywallsRouter.get('/apps/:id/paywalls', async (c) => {
  const appId = c.req.param('id');

  const result = await c.env.DB.prepare(
    'SELECT * FROM paywall_templates WHERE app_id = ? ORDER BY created_at DESC'
  ).bind(appId).all();

  const paywalls = (result.results || []).map((p: any) => ({
    id: p.id, identifier: p.identifier, name: p.name,
    description: p.description, template_type: p.template_type,
    config: JSON.parse(p.config || '{}'),
    offering_id: p.offering_id,
    active: p.active === 1, is_default: p.is_default === 1,
    created_at: p.created_at, updated_at: p.updated_at,
  }));

  return c.json({ paywalls });
});

/**
 * POST /admin/apps/:id/paywalls
 */
adminPaywallsRouter.post('/apps/:id/paywalls', async (c) => {
  const appId = c.req.param('id');
  const body = await c.req.json<{
    identifier: string;
    name: string;
    description?: string;
    template_type: string;
    config: Record<string, unknown>;
    offering_id?: string;
    active?: boolean;
    is_default?: boolean;
  }>();

  if (!body.identifier || !body.name || !body.template_type) {
    throw Errors.validationError('identifier, name, and template_type are required');
  }

  const validTypes = ['single', 'multi', 'feature_list', 'comparison', 'minimal'];
  if (!validTypes.includes(body.template_type)) {
    throw Errors.validationError(`template_type must be one of: ${validTypes.join(', ')}`);
  }

  const id = generateId();
  const now = Date.now();

  // If setting as default, unset other defaults
  if (body.is_default) {
    await c.env.DB.prepare('UPDATE paywall_templates SET is_default = 0 WHERE app_id = ?').bind(appId).run();
  }

  await c.env.DB.prepare(
    `INSERT INTO paywall_templates (id, app_id, identifier, name, description, template_type, config, offering_id, active, is_default, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    id, appId, body.identifier, body.name, body.description || null,
    body.template_type, JSON.stringify(body.config),
    body.offering_id || null, body.active !== false ? 1 : 0,
    body.is_default ? 1 : 0, now, now
  ).run();

  return c.json({
    paywall: {
      id, identifier: body.identifier, name: body.name,
      template_type: body.template_type, config: body.config,
      active: body.active !== false, is_default: body.is_default || false,
      created_at: now,
    },
  }, 201);
});

/**
 * PATCH /admin/apps/:id/paywalls/:identifier
 */
adminPaywallsRouter.patch('/apps/:id/paywalls/:identifier', async (c) => {
  const appId = c.req.param('id');
  const identifier = c.req.param('identifier');
  const body = await c.req.json<{
    name?: string;
    description?: string;
    config?: Record<string, unknown>;
    offering_id?: string;
    active?: boolean;
    is_default?: boolean;
  }>();

  const existing = await c.env.DB.prepare(
    'SELECT id FROM paywall_templates WHERE app_id = ? AND identifier = ?'
  ).bind(appId, identifier).first();
  if (!existing) throw Errors.notFound('Paywall template');

  if (body.is_default) {
    await c.env.DB.prepare('UPDATE paywall_templates SET is_default = 0 WHERE app_id = ?').bind(appId).run();
  }

  const updates: string[] = [];
  const params: (string | number | null)[] = [];

  if (body.name) { updates.push('name = ?'); params.push(body.name); }
  if (body.description !== undefined) { updates.push('description = ?'); params.push(body.description || null); }
  if (body.config) { updates.push('config = ?'); params.push(JSON.stringify(body.config)); }
  if (body.offering_id !== undefined) { updates.push('offering_id = ?'); params.push(body.offering_id || null); }
  if (body.active !== undefined) { updates.push('active = ?'); params.push(body.active ? 1 : 0); }
  if (body.is_default !== undefined) { updates.push('is_default = ?'); params.push(body.is_default ? 1 : 0); }

  updates.push('updated_at = ?');
  params.push(Date.now());
  params.push(existing.id as string);

  await c.env.DB.prepare(`UPDATE paywall_templates SET ${updates.join(', ')} WHERE id = ?`).bind(...params).run();
  return c.json({ message: 'Paywall template updated' });
});

/**
 * DELETE /admin/apps/:id/paywalls/:identifier
 */
adminPaywallsRouter.delete('/apps/:id/paywalls/:identifier', async (c) => {
  const appId = c.req.param('id');
  const identifier = c.req.param('identifier');

  const existing = await c.env.DB.prepare(
    'SELECT id FROM paywall_templates WHERE app_id = ? AND identifier = ?'
  ).bind(appId, identifier).first();
  if (!existing) throw Errors.notFound('Paywall template');

  await c.env.DB.batch([
    c.env.DB.prepare('DELETE FROM paywall_events WHERE template_id = ?').bind(existing.id),
    c.env.DB.prepare('DELETE FROM paywall_assets WHERE template_id = ?').bind(existing.id),
    c.env.DB.prepare('DELETE FROM paywall_templates WHERE id = ?').bind(existing.id),
  ]);

  return c.json({ message: 'Paywall template deleted' });
});

/**
 * GET /admin/apps/:id/paywalls/:identifier/analytics
 */
adminPaywallsRouter.get('/apps/:id/paywalls/:identifier/analytics', async (c) => {
  const appId = c.req.param('id');
  const identifier = c.req.param('identifier');
  const period = parseInt(c.req.query('period') || '30');
  const since = Date.now() - period * 24 * 60 * 60 * 1000;

  const template = await c.env.DB.prepare(
    'SELECT id FROM paywall_templates WHERE app_id = ? AND identifier = ?'
  ).bind(appId, identifier).first();
  if (!template) throw Errors.notFound('Paywall template');

  const result = await c.env.DB.prepare(
    `SELECT event_type, COUNT(*) as count FROM paywall_events
     WHERE template_id = ? AND timestamp >= ?
     GROUP BY event_type`
  ).bind(template.id, since).all<{ event_type: string; count: number }>();

  const metrics: Record<string, number> = {};
  for (const row of result.results || []) {
    metrics[row.event_type] = row.count;
  }

  const impressions = metrics['impression'] || 0;
  const purchases = metrics['purchase_completed'] || 0;
  const conversionRate = impressions > 0 ? Math.round((purchases / impressions) * 10000) / 100 : 0;

  return c.json({ metrics, impressions, purchases, conversion_rate: conversionRate });
});
