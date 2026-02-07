/**
 * Admin Experiments Routes
 * A/B testing management endpoints
 */

import { Hono } from 'hono';
import type { Env } from '../../types';
import { adminAuthMiddleware } from '../../middleware/admin-auth';
import { generateId } from '../../utils/id';
import { Errors } from '../../middleware/error';

export const adminExperimentsRouter = new Hono<{ Bindings: Env }>();

adminExperimentsRouter.use('/apps/:id/experiments', adminAuthMiddleware);
adminExperimentsRouter.use('/apps/:id/experiments/*', adminAuthMiddleware);
adminExperimentsRouter.use('/experiments/*', adminAuthMiddleware);

/**
 * GET /admin/apps/:id/experiments
 */
adminExperimentsRouter.get('/apps/:id/experiments', async (c) => {
  const appId = c.req.param('id');
  const status = c.req.query('status');

  let query = 'SELECT * FROM experiments WHERE app_id = ?';
  const params: (string | number)[] = [appId];
  if (status) { query += ' AND status = ?'; params.push(status); }
  query += ' ORDER BY created_at DESC';

  const experiments = await c.env.DB.prepare(query).bind(...params).all();

  // Get variant counts and enrollment counts for each experiment
  const enriched = await Promise.all((experiments.results || []).map(async (exp: any) => {
    const [variants, enrollments] = await Promise.all([
      c.env.DB.prepare('SELECT * FROM experiment_variants WHERE experiment_id = ?').bind(exp.id).all(),
      c.env.DB.prepare('SELECT COUNT(*) as count FROM experiment_enrollments WHERE experiment_id = ?').bind(exp.id).first<{ count: number }>(),
    ]);
    return {
      ...exp, variants: variants.results || [],
      enrollment_count: enrollments?.count || 0,
    };
  }));

  return c.json({ experiments: enriched });
});

/**
 * POST /admin/apps/:id/experiments
 */
adminExperimentsRouter.post('/apps/:id/experiments', async (c) => {
  const appId = c.req.param('id');
  const body = await c.req.json<{
    name: string;
    description?: string;
    variants: { name: string; offering_id: string; weight: number }[];
  }>();

  if (!body.name) throw Errors.validationError('name is required');
  if (!body.variants || body.variants.length < 2) throw Errors.validationError('At least 2 variants required');

  const totalWeight = body.variants.reduce((s, v) => s + v.weight, 0);
  if (totalWeight !== 100) throw Errors.validationError('Variant weights must sum to 100');

  const expId = generateId();
  const now = Date.now();

  await c.env.DB.prepare(
    `INSERT INTO experiments (id, app_id, name, description, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'draft', ?, ?)`
  ).bind(expId, appId, body.name, body.description || null, now, now).run();

  // Create variants
  for (const variant of body.variants) {
    const varId = generateId();
    await c.env.DB.prepare(
      `INSERT INTO experiment_variants (id, experiment_id, offering_id, name, weight, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).bind(varId, expId, variant.offering_id, variant.name, variant.weight, now).run();
  }

  // Fetch back
  const exp = await c.env.DB.prepare('SELECT * FROM experiments WHERE id = ?').bind(expId).first();
  const variants = await c.env.DB.prepare('SELECT * FROM experiment_variants WHERE experiment_id = ?').bind(expId).all();

  return c.json({ experiment: { ...exp, variants: variants.results || [] } }, 201);
});

/**
 * GET /admin/experiments/:id
 */
adminExperimentsRouter.get('/experiments/:id', async (c) => {
  const expId = c.req.param('id');

  const [exp, variants, enrollmentCount] = await Promise.all([
    c.env.DB.prepare('SELECT * FROM experiments WHERE id = ?').bind(expId).first(),
    c.env.DB.prepare('SELECT * FROM experiment_variants WHERE experiment_id = ?').bind(expId).all(),
    c.env.DB.prepare('SELECT COUNT(*) as count FROM experiment_enrollments WHERE experiment_id = ?').bind(expId).first<{ count: number }>(),
  ]);

  if (!exp) throw Errors.notFound('Experiment');

  return c.json({
    experiment: { ...exp, variants: variants.results || [], enrollment_count: enrollmentCount?.count || 0 },
  });
});

/**
 * PATCH /admin/experiments/:id
 */
adminExperimentsRouter.patch('/experiments/:id', async (c) => {
  const expId = c.req.param('id');
  const body = await c.req.json<{ status?: string; name?: string; description?: string }>();

  const exp = await c.env.DB.prepare('SELECT * FROM experiments WHERE id = ?').bind(expId).first();
  if (!exp) throw Errors.notFound('Experiment');

  const updates: string[] = [];
  const params: (string | number)[] = [];

  if (body.status) {
    const validTransitions: Record<string, string[]> = {
      draft: ['running'], running: ['paused', 'completed'], paused: ['running', 'completed'],
    };
    if (!validTransitions[exp.status as string]?.includes(body.status)) {
      throw Errors.validationError(`Cannot transition from ${exp.status} to ${body.status}`);
    }
    updates.push('status = ?');
    params.push(body.status);
    if (body.status === 'running' && !exp.start_at) {
      updates.push('start_at = ?');
      params.push(Date.now());
    }
    if (body.status === 'completed') {
      updates.push('end_at = ?');
      params.push(Date.now());
    }
  }
  if (body.name) { updates.push('name = ?'); params.push(body.name); }
  if (body.description !== undefined) { updates.push('description = ?'); params.push(body.description); }

  updates.push('updated_at = ?');
  params.push(Date.now());
  params.push(expId);

  await c.env.DB.prepare(`UPDATE experiments SET ${updates.join(', ')} WHERE id = ?`).bind(...params).run();
  return c.json({ message: 'Experiment updated' });
});

/**
 * GET /admin/experiments/:id/results
 */
adminExperimentsRouter.get('/experiments/:id/results', async (c) => {
  const expId = c.req.param('id');

  const variants = await c.env.DB.prepare(
    'SELECT * FROM experiment_variants WHERE experiment_id = ?'
  ).bind(expId).all();

  const results = await Promise.all((variants.results || []).map(async (v: any) => {
    const [enrollments, conversions, revenue] = await Promise.all([
      c.env.DB.prepare('SELECT COUNT(*) as count FROM experiment_enrollments WHERE variant_id = ?').bind(v.id).first<{ count: number }>(),
      c.env.DB.prepare('SELECT COUNT(*) as count FROM experiment_enrollments WHERE variant_id = ? AND converted = 1').bind(v.id).first<{ count: number }>(),
      c.env.DB.prepare(
        `SELECT SUM(t.revenue_amount) as total FROM experiment_enrollments ee
         JOIN subscriptions s ON s.subscriber_id = ee.subscriber_id
         JOIN transactions t ON t.subscription_id = s.id AND t.is_refunded = 0
         WHERE ee.variant_id = ? AND t.created_at >= ee.enrolled_at`
      ).bind(v.id).first<{ total: number }>(),
    ]);

    const enrollCount = enrollments?.count || 0;
    const convertCount = conversions?.count || 0;
    const convRate = enrollCount > 0 ? convertCount / enrollCount : 0;

    return {
      variant_id: v.id, name: v.name, offering_id: v.offering_id, weight: v.weight,
      enrollments: enrollCount, conversions: convertCount,
      conversion_rate: Math.round(convRate * 10000) / 100,
      revenue: ((revenue?.total || 0) / 100),
    };
  }));

  // Calculate statistical significance between first two variants (z-test)
  let significance = null;
  if (results.length >= 2) {
    const [a, b] = results;
    const n1 = a.enrollments, n2 = b.enrollments;
    const p1 = n1 > 0 ? a.conversions / n1 : 0;
    const p2 = n2 > 0 ? b.conversions / n2 : 0;
    if (n1 > 0 && n2 > 0) {
      const pPool = (a.conversions + b.conversions) / (n1 + n2);
      const se = Math.sqrt(pPool * (1 - pPool) * (1 / n1 + 1 / n2));
      const z = se > 0 ? Math.abs(p1 - p2) / se : 0;
      // Approximate p-value from z-score
      const pValue = z > 3.5 ? 0.001 : z > 2.58 ? 0.01 : z > 1.96 ? 0.05 : z > 1.65 ? 0.10 : 1;
      significance = { z_score: Math.round(z * 100) / 100, p_value: pValue, significant: pValue < 0.05 };
    }
  }

  return c.json({ variants: results, significance });
});

/**
 * DELETE /admin/experiments/:id
 */
adminExperimentsRouter.delete('/experiments/:id', async (c) => {
  const expId = c.req.param('id');

  await c.env.DB.batch([
    c.env.DB.prepare('DELETE FROM experiment_enrollments WHERE experiment_id = ?').bind(expId),
    c.env.DB.prepare('DELETE FROM experiment_variants WHERE experiment_id = ?').bind(expId),
    c.env.DB.prepare('DELETE FROM experiments WHERE id = ?').bind(expId),
  ]);

  return c.json({ message: 'Experiment deleted' });
});
