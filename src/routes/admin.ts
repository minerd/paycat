/**
 * Admin Routes
 * Full CRUD for apps, platform keys, and admin management
 */

import { Hono } from 'hono';
import type { Env } from '../types';
import { Errors } from '../middleware/error';
import {
  adminAuthMiddleware,
  createAdminSession,
  verifyAdminPassword,
  hashPassword,
} from '../middleware/admin-auth';
import { generateId, generateApiKey } from '../utils/id';

export const adminRouter = new Hono<{ Bindings: Env }>();

// ============ Auth Endpoints (No auth required) ============

/**
 * POST /admin/login
 * Admin login with email/password
 */
adminRouter.post('/login', async (c) => {
  const body = await c.req.json<{ email: string; password: string }>();

  if (!body.email || !body.password) {
    throw Errors.validationError('Email and password are required');
  }

  const user = await verifyAdminPassword(c.env.DB, body.email, body.password);
  if (!user) {
    throw Errors.unauthorized('Invalid email or password');
  }

  const token = await createAdminSession(c.env.DB, user.id);

  return c.json({
    token,
    user: {
      id: user.id,
      email: user.email,
    },
  });
});

/**
 * POST /admin/setup
 * Initial admin setup (only works if no admin exists)
 */
adminRouter.post('/setup', async (c) => {
  try {
    // Check if any admin exists
    const existing = await c.env.DB.prepare('SELECT id FROM admin_users LIMIT 1').first();

    if (existing) {
      throw Errors.forbidden('Admin already exists. Use /admin/login instead.');
    }

    const body = await c.req.json<{ email: string; password: string; name?: string }>();

    if (!body.email || !body.password) {
      throw Errors.validationError('Email and password are required');
    }

    if (body.password.length < 8) {
      throw Errors.validationError('Password must be at least 8 characters');
    }

    const id = generateId();
    const passwordHash = await hashPassword(body.password);
    const apiKey = generateApiKey('admin');
    const now = Date.now();

    await c.env.DB.prepare(
      `INSERT INTO admin_users (id, email, password_hash, name, api_key, active, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 1, ?, ?)`
    )
      .bind(id, body.email, passwordHash, body.name || null, apiKey, now, now)
      .run();

    const token = await createAdminSession(c.env.DB, id);

    return c.json({
      message: 'Admin account created successfully',
      token,
      user: {
        id,
        email: body.email,
        api_key: apiKey,
      },
    });
  } catch (err) {
    console.error('Setup error:', err);
    if (err instanceof Error && 'code' in err) {
      throw err;
    }
    throw Errors.internal((err as Error).message || 'Setup failed');
  }
});

// ============ Protected Routes (Auth required) ============

// Apply auth middleware to protected routes only
adminRouter.use('/logout', adminAuthMiddleware);
adminRouter.use('/me', adminAuthMiddleware);
adminRouter.use('/apps', adminAuthMiddleware);
adminRouter.use('/apps/*', adminAuthMiddleware);
adminRouter.use('/dashboard', adminAuthMiddleware);
adminRouter.use('/webhooks/*', adminAuthMiddleware);
adminRouter.use('/product-mappings/*', adminAuthMiddleware);
adminRouter.use('/subscribers/*', adminAuthMiddleware);

/**
 * POST /admin/logout
 * Logout current session
 */
adminRouter.post('/logout', async (c) => {
  const authHeader = c.req.header('Authorization');
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice(7);
    await c.env.DB.prepare('DELETE FROM admin_sessions WHERE token = ?').bind(token).run();
  }
  return c.json({ message: 'Logged out successfully' });
});

/**
 * GET /admin/me
 * Get current admin user
 */
adminRouter.get('/me', async (c) => {
  const adminUser = c.get('adminUser');
  return c.json({ user: adminUser });
});

// ============ Apps CRUD ============

/**
 * GET /admin/apps
 * List all apps
 */
adminRouter.get('/apps', async (c) => {
  const apps = await c.env.DB.prepare(
    `SELECT id, name, api_key,
            CASE WHEN apple_config IS NOT NULL THEN 1 ELSE 0 END as has_apple,
            CASE WHEN google_config IS NOT NULL THEN 1 ELSE 0 END as has_google,
            CASE WHEN stripe_config IS NOT NULL THEN 1 ELSE 0 END as has_stripe,
            created_at
     FROM apps ORDER BY created_at DESC`
  ).all();

  return c.json({ apps: apps.results || [] });
});

/**
 * GET /admin/apps/:id
 * Get app details (including config, but secrets masked)
 */
adminRouter.get('/apps/:id', async (c) => {
  const { id } = c.req.param();

  const app = await c.env.DB.prepare('SELECT * FROM apps WHERE id = ?').bind(id).first();

  if (!app) {
    throw Errors.notFound('App');
  }

  // Parse configs and mask sensitive data
  const result: Record<string, unknown> = {
    id: app.id,
    name: app.name,
    api_key: app.api_key,
    created_at: app.created_at,
    apple_config: null,
    google_config: null,
    stripe_config: null,
  };

  if (app.apple_config) {
    try {
      const config = JSON.parse(app.apple_config as string);
      result.apple_config = {
        key_id: config.keyId,
        issuer_id: config.issuerId,
        bundle_id: config.bundleId,
        has_private_key: !!config.privateKey,
      };
    } catch {
      result.apple_config = { error: 'Invalid config' };
    }
  }

  if (app.google_config) {
    try {
      const config = JSON.parse(app.google_config as string);
      result.google_config = {
        package_name: config.packageName,
        has_service_account: !!config.serviceAccountJson,
      };
    } catch {
      result.google_config = { error: 'Invalid config' };
    }
  }

  if (app.stripe_config) {
    try {
      const config = JSON.parse(app.stripe_config as string);
      result.stripe_config = {
        has_secret_key: !!config.secretKey,
        has_webhook_secret: !!config.webhookSecret,
      };
    } catch {
      result.stripe_config = { error: 'Invalid config' };
    }
  }

  return c.json({ app: result });
});

/**
 * POST /admin/apps
 * Create new app
 */
adminRouter.post('/apps', async (c) => {
  const body = await c.req.json<{ name: string }>();

  if (!body.name || body.name.length > 255) {
    throw Errors.validationError('App name is required and must be 255 characters or less');
  }

  const id = generateId();
  const apiKey = generateApiKey('pk');
  const now = Date.now();

  await c.env.DB.prepare('INSERT INTO apps (id, name, api_key, created_at) VALUES (?, ?, ?, ?)')
    .bind(id, body.name, apiKey, now)
    .run();

  return c.json({
    app: {
      id,
      name: body.name,
      api_key: apiKey,
      created_at: now,
    },
  });
});

/**
 * PUT /admin/apps/:id
 * Update app name
 */
adminRouter.put('/apps/:id', async (c) => {
  const { id } = c.req.param();
  const body = await c.req.json<{ name: string }>();

  if (!body.name) {
    throw Errors.validationError('App name is required');
  }

  const result = await c.env.DB.prepare('UPDATE apps SET name = ? WHERE id = ?')
    .bind(body.name, id)
    .run();

  if (!result.meta.changes) {
    throw Errors.notFound('App');
  }

  return c.json({ message: 'App updated successfully' });
});

/**
 * DELETE /admin/apps/:id
 * Delete app (and all related data)
 */
adminRouter.delete('/apps/:id', async (c) => {
  const { id } = c.req.param();

  // Delete in order to respect foreign keys
  await c.env.DB.batch([
    c.env.DB.prepare('DELETE FROM webhook_deliveries WHERE webhook_id IN (SELECT id FROM webhooks WHERE app_id = ?)').bind(id),
    c.env.DB.prepare('DELETE FROM webhooks WHERE app_id = ?').bind(id),
    c.env.DB.prepare('DELETE FROM analytics_events WHERE app_id = ?').bind(id),
    c.env.DB.prepare('DELETE FROM transactions WHERE app_id = ?').bind(id),
    c.env.DB.prepare('DELETE FROM subscriptions WHERE app_id = ?').bind(id),
    c.env.DB.prepare('DELETE FROM subscribers WHERE app_id = ?').bind(id),
    c.env.DB.prepare('DELETE FROM product_entitlements WHERE app_id = ?').bind(id),
    c.env.DB.prepare('DELETE FROM entitlement_definitions WHERE app_id = ?').bind(id),
    c.env.DB.prepare('DELETE FROM apps WHERE id = ?').bind(id),
  ]);

  return c.json({ message: 'App deleted successfully' });
});

/**
 * POST /admin/apps/:id/regenerate-key
 * Regenerate API key for app
 */
adminRouter.post('/apps/:id/regenerate-key', async (c) => {
  const { id } = c.req.param();
  const newApiKey = generateApiKey('pk');

  const result = await c.env.DB.prepare('UPDATE apps SET api_key = ? WHERE id = ?')
    .bind(newApiKey, id)
    .run();

  if (!result.meta.changes) {
    throw Errors.notFound('App');
  }

  return c.json({ api_key: newApiKey });
});

// ============ Platform Configuration ============

/**
 * PUT /admin/apps/:id/apple
 * Configure Apple App Store credentials
 */
adminRouter.put('/apps/:id/apple', async (c) => {
  const { id } = c.req.param();
  const body = await c.req.json<{
    key_id: string;
    issuer_id: string;
    bundle_id: string;
    private_key: string;
  }>();

  if (!body.key_id || !body.issuer_id || !body.bundle_id || !body.private_key) {
    throw Errors.validationError('All Apple credentials are required: key_id, issuer_id, bundle_id, private_key');
  }

  const config = JSON.stringify({
    keyId: body.key_id,
    issuerId: body.issuer_id,
    bundleId: body.bundle_id,
    privateKey: body.private_key,
  });

  const result = await c.env.DB.prepare('UPDATE apps SET apple_config = ? WHERE id = ?')
    .bind(config, id)
    .run();

  if (!result.meta.changes) {
    throw Errors.notFound('App');
  }

  return c.json({ message: 'Apple configuration saved successfully' });
});

/**
 * DELETE /admin/apps/:id/apple
 * Remove Apple configuration
 */
adminRouter.delete('/apps/:id/apple', async (c) => {
  const { id } = c.req.param();

  const result = await c.env.DB.prepare('UPDATE apps SET apple_config = NULL WHERE id = ?')
    .bind(id)
    .run();

  if (!result.meta.changes) {
    throw Errors.notFound('App');
  }

  return c.json({ message: 'Apple configuration removed' });
});

/**
 * PUT /admin/apps/:id/google
 * Configure Google Play credentials
 */
adminRouter.put('/apps/:id/google', async (c) => {
  const { id } = c.req.param();
  const body = await c.req.json<{
    package_name: string;
    service_account_json: string;
  }>();

  if (!body.package_name || !body.service_account_json) {
    throw Errors.validationError('package_name and service_account_json are required');
  }

  // Validate JSON
  try {
    JSON.parse(body.service_account_json);
  } catch {
    throw Errors.validationError('service_account_json must be valid JSON');
  }

  const config = JSON.stringify({
    packageName: body.package_name,
    serviceAccountJson: body.service_account_json,
  });

  const result = await c.env.DB.prepare('UPDATE apps SET google_config = ? WHERE id = ?')
    .bind(config, id)
    .run();

  if (!result.meta.changes) {
    throw Errors.notFound('App');
  }

  return c.json({ message: 'Google configuration saved successfully' });
});

/**
 * DELETE /admin/apps/:id/google
 * Remove Google configuration
 */
adminRouter.delete('/apps/:id/google', async (c) => {
  const { id } = c.req.param();

  const result = await c.env.DB.prepare('UPDATE apps SET google_config = NULL WHERE id = ?')
    .bind(id)
    .run();

  if (!result.meta.changes) {
    throw Errors.notFound('App');
  }

  return c.json({ message: 'Google configuration removed' });
});

/**
 * PUT /admin/apps/:id/stripe
 * Configure Stripe credentials
 */
adminRouter.put('/apps/:id/stripe', async (c) => {
  const { id } = c.req.param();
  const body = await c.req.json<{
    secret_key: string;
    webhook_secret: string;
  }>();

  if (!body.secret_key || !body.webhook_secret) {
    throw Errors.validationError('secret_key and webhook_secret are required');
  }

  const config = JSON.stringify({
    secretKey: body.secret_key,
    webhookSecret: body.webhook_secret,
  });

  const result = await c.env.DB.prepare('UPDATE apps SET stripe_config = ? WHERE id = ?')
    .bind(config, id)
    .run();

  if (!result.meta.changes) {
    throw Errors.notFound('App');
  }

  return c.json({ message: 'Stripe configuration saved successfully' });
});

/**
 * DELETE /admin/apps/:id/stripe
 * Remove Stripe configuration
 */
adminRouter.delete('/apps/:id/stripe', async (c) => {
  const { id } = c.req.param();

  const result = await c.env.DB.prepare('UPDATE apps SET stripe_config = NULL WHERE id = ?')
    .bind(id)
    .run();

  if (!result.meta.changes) {
    throw Errors.notFound('App');
  }

  return c.json({ message: 'Stripe configuration removed' });
});

// ============ Dashboard Stats ============

/**
 * GET /admin/dashboard
 * Get overall dashboard statistics
 * Query params:
 *   - exclude_sandbox: If "true", exclude sandbox/test data
 */
adminRouter.get('/dashboard', async (c) => {
  const now = Date.now();
  const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000;
  const excludeSandbox = c.req.query('exclude_sandbox') === 'true';
  const sandboxFilter = excludeSandbox ? ' AND is_sandbox = 0' : '';

  // Get counts
  const [appsCount, subscribersCount, activeSubsCount, revenueResult, mrrResult, refundCountResult, refundAmountResult] = await Promise.all([
    c.env.DB.prepare('SELECT COUNT(*) as count FROM apps').first<{ count: number }>(),
    c.env.DB.prepare('SELECT COUNT(*) as count FROM subscribers').first<{ count: number }>(),
    c.env.DB.prepare(`SELECT COUNT(*) as count FROM subscriptions WHERE status = 'active'${sandboxFilter}`).first<{ count: number }>(),
    // Revenue: join with subscriptions for sandbox filter
    excludeSandbox
      ? c.env.DB.prepare(
          `SELECT SUM(t.revenue_amount) as total, t.revenue_currency as currency
           FROM transactions t
           JOIN subscriptions s ON s.id = t.subscription_id AND s.is_sandbox = 0
           WHERE t.created_at > ? AND t.is_refunded = 0
           GROUP BY t.revenue_currency`
        )
          .bind(thirtyDaysAgo)
          .all<{ total: number; currency: string }>()
      : c.env.DB.prepare(
          `SELECT SUM(revenue_amount) as total, revenue_currency as currency
           FROM transactions
           WHERE created_at > ? AND is_refunded = 0
           GROUP BY revenue_currency`
        )
          .bind(thirtyDaysAgo)
          .all<{ total: number; currency: string }>(),
    // MRR: Sum of active subscription prices (assuming monthly)
    c.env.DB.prepare(
      `SELECT SUM(price_amount) as total, price_currency as currency
       FROM subscriptions
       WHERE status = 'active' AND price_amount IS NOT NULL${sandboxFilter}
       GROUP BY price_currency`
    ).all<{ total: number; currency: string }>(),
    // Refund count (30d)
    excludeSandbox
      ? c.env.DB.prepare(
          `SELECT COUNT(*) as count FROM transactions t
           JOIN subscriptions s ON s.id = t.subscription_id AND s.is_sandbox = 0
           WHERE t.is_refunded = 1 AND t.refund_date > ?`
        )
          .bind(thirtyDaysAgo)
          .first<{ count: number }>()
      : c.env.DB.prepare(
          'SELECT COUNT(*) as count FROM transactions WHERE is_refunded = 1 AND refund_date > ?'
        )
          .bind(thirtyDaysAgo)
          .first<{ count: number }>(),
    // Refund amount (30d)
    excludeSandbox
      ? c.env.DB.prepare(
          `SELECT SUM(t.revenue_amount) as total, t.revenue_currency as currency
           FROM transactions t
           JOIN subscriptions s ON s.id = t.subscription_id AND s.is_sandbox = 0
           WHERE t.is_refunded = 1 AND t.refund_date > ?
           GROUP BY t.revenue_currency`
        )
          .bind(thirtyDaysAgo)
          .all<{ total: number; currency: string }>()
      : c.env.DB.prepare(
          `SELECT SUM(revenue_amount) as total, revenue_currency as currency
           FROM transactions
           WHERE is_refunded = 1 AND refund_date > ?
           GROUP BY revenue_currency`
        )
          .bind(thirtyDaysAgo)
          .all<{ total: number; currency: string }>(),
  ]);

  // Get recent events (join with subscriptions for sandbox filter)
  const recentEvents = excludeSandbox
    ? await c.env.DB.prepare(
        `SELECT ae.event_type, COUNT(*) as count
         FROM analytics_events ae
         JOIN subscriptions s ON s.subscriber_id = ae.subscriber_id AND s.is_sandbox = 0
         WHERE ae.created_at > ?
         GROUP BY ae.event_type`
      )
        .bind(thirtyDaysAgo)
        .all<{ event_type: string; count: number }>()
    : await c.env.DB.prepare(
        `SELECT event_type, COUNT(*) as count
         FROM analytics_events
         WHERE created_at > ?
         GROUP BY event_type`
      )
        .bind(thirtyDaysAgo)
        .all<{ event_type: string; count: number }>();

  // Platform breakdown
  const platformBreakdown = await c.env.DB.prepare(
    `SELECT platform, COUNT(*) as count
     FROM subscriptions
     WHERE status = 'active'${sandboxFilter}
     GROUP BY platform`
  ).all<{ platform: string; count: number }>();

  return c.json({
    exclude_sandbox: excludeSandbox,
    apps: appsCount?.count || 0,
    total_subscribers: subscribersCount?.count || 0,
    active_subscriptions: activeSubsCount?.count || 0,
    mrr: mrrResult.results || [],
    revenue_30d: revenueResult.results || [],
    refunds_30d_count: refundCountResult?.count || 0,
    refunds_30d_amount: refundAmountResult.results || [],
    events_30d: recentEvents.results || [],
    platform_breakdown: platformBreakdown.results || [],
  });
});

// ============ Webhooks Management ============

/**
 * GET /admin/apps/:id/webhooks
 * List webhooks for an app
 */
adminRouter.get('/apps/:id/webhooks', async (c) => {
  const { id } = c.req.param();

  const webhooks = await c.env.DB.prepare(
    'SELECT id, url, events, active, created_at FROM webhooks WHERE app_id = ? ORDER BY created_at DESC'
  )
    .bind(id)
    .all();

  return c.json({
    webhooks: (webhooks.results || []).map((w) => ({
      ...w,
      events: JSON.parse((w.events as string) || '[]'),
    })),
  });
});

/**
 * POST /admin/apps/:id/webhooks
 * Create webhook for an app
 */
adminRouter.post('/apps/:id/webhooks', async (c) => {
  const appId = c.req.param('id');
  const body = await c.req.json<{ url: string; events: string[] }>();

  if (!body.url || !body.events?.length) {
    throw Errors.validationError('url and events are required');
  }

  // Validate URL and enforce HTTPS
  try {
    const parsed = new URL(body.url);
    if (parsed.protocol !== 'https:') {
      throw Errors.validationError('Webhook URL must use HTTPS');
    }
  } catch (e) {
    if (e instanceof Error && 'code' in e) throw e;
    throw Errors.validationError('Invalid webhook URL');
  }

  const id = generateId();
  const secret = generateApiKey('whsec');
  const now = Date.now();

  await c.env.DB.prepare(
    'INSERT INTO webhooks (id, app_id, url, secret, events, active, created_at) VALUES (?, ?, ?, ?, ?, 1, ?)'
  )
    .bind(id, appId, body.url, secret, JSON.stringify(body.events), now)
    .run();

  return c.json({
    webhook: {
      id,
      url: body.url,
      secret,
      events: body.events,
      active: true,
      created_at: now,
    },
  });
});

/**
 * DELETE /admin/webhooks/:id
 * Delete a webhook
 */
adminRouter.delete('/webhooks/:id', async (c) => {
  const { id } = c.req.param();

  await c.env.DB.batch([
    c.env.DB.prepare('DELETE FROM webhook_deliveries WHERE webhook_id = ?').bind(id),
    c.env.DB.prepare('DELETE FROM webhooks WHERE id = ?').bind(id),
  ]);

  return c.json({ message: 'Webhook deleted' });
});

// ============ Entitlements Management ============

/**
 * GET /admin/apps/:id/entitlements
 * List entitlement definitions for an app
 */
adminRouter.get('/apps/:id/entitlements', async (c) => {
  const { id } = c.req.param();

  const entitlements = await c.env.DB.prepare(
    'SELECT * FROM entitlement_definitions WHERE app_id = ? ORDER BY identifier'
  )
    .bind(id)
    .all();

  return c.json({ entitlements: entitlements.results || [] });
});

/**
 * POST /admin/apps/:id/entitlements
 * Create entitlement definition
 */
adminRouter.post('/apps/:id/entitlements', async (c) => {
  const appId = c.req.param('id');
  const body = await c.req.json<{ identifier: string; display_name?: string }>();

  if (!body.identifier) {
    throw Errors.validationError('identifier is required');
  }

  const id = generateId();
  const now = Date.now();

  await c.env.DB.prepare(
    'INSERT INTO entitlement_definitions (id, app_id, identifier, display_name, created_at) VALUES (?, ?, ?, ?, ?)'
  )
    .bind(id, appId, body.identifier, body.display_name || null, now)
    .run();

  return c.json({
    entitlement: {
      id,
      app_id: appId,
      identifier: body.identifier,
      display_name: body.display_name,
      created_at: now,
    },
  });
});

/**
 * GET /admin/apps/:id/product-mappings
 * List product to entitlement mappings
 */
adminRouter.get('/apps/:id/product-mappings', async (c) => {
  const { id } = c.req.param();

  const mappings = await c.env.DB.prepare(
    `SELECT pe.*, ed.identifier as entitlement_identifier
     FROM product_entitlements pe
     JOIN entitlement_definitions ed ON ed.id = pe.entitlement_id
     WHERE pe.app_id = ?
     ORDER BY pe.product_id`
  )
    .bind(id)
    .all();

  return c.json({ mappings: mappings.results || [] });
});

/**
 * POST /admin/apps/:id/product-mappings
 * Create product to entitlement mapping
 */
adminRouter.post('/apps/:id/product-mappings', async (c) => {
  const appId = c.req.param('id');
  const body = await c.req.json<{
    product_id: string;
    platform: 'ios' | 'android' | 'stripe';
    entitlement_id: string;
  }>();

  if (!body.product_id || !body.platform || !body.entitlement_id) {
    throw Errors.validationError('product_id, platform, and entitlement_id are required');
  }

  const id = generateId();
  const now = Date.now();

  await c.env.DB.prepare(
    'INSERT INTO product_entitlements (id, app_id, product_id, platform, entitlement_id, created_at) VALUES (?, ?, ?, ?, ?, ?)'
  )
    .bind(id, appId, body.product_id, body.platform, body.entitlement_id, now)
    .run();

  return c.json({
    mapping: {
      id,
      app_id: appId,
      product_id: body.product_id,
      platform: body.platform,
      entitlement_id: body.entitlement_id,
      created_at: now,
    },
  });
});

/**
 * DELETE /admin/product-mappings/:id
 * Delete product mapping
 */
adminRouter.delete('/product-mappings/:id', async (c) => {
  const { id } = c.req.param();

  await c.env.DB.prepare('DELETE FROM product_entitlements WHERE id = ?').bind(id).run();

  return c.json({ message: 'Mapping deleted' });
});

// ============ Subscribers List ============

/**
 * GET /admin/apps/:id/subscribers
 * List subscribers for an app with pagination
 */
adminRouter.get('/apps/:id/subscribers', async (c) => {
  const appId = c.req.param('id');
  const limit = Math.min(parseInt(c.req.query('limit') || '50'), 100);
  const offset = parseInt(c.req.query('offset') || '0');

  const [subscribers, total] = await Promise.all([
    c.env.DB.prepare(
      `SELECT s.*,
              (SELECT COUNT(*) FROM subscriptions WHERE subscriber_id = s.id AND status = 'active') as active_subscriptions
       FROM subscribers s
       WHERE s.app_id = ?
       ORDER BY s.last_seen_at DESC
       LIMIT ? OFFSET ?`
    )
      .bind(appId, limit, offset)
      .all(),
    c.env.DB.prepare('SELECT COUNT(*) as count FROM subscribers WHERE app_id = ?')
      .bind(appId)
      .first<{ count: number }>(),
  ]);

  return c.json({
    subscribers: subscribers.results || [],
    total: total?.count || 0,
    limit,
    offset,
  });
});

/**
 * GET /admin/subscribers/:id
 * Get subscriber details with subscriptions
 */
adminRouter.get('/subscribers/:id', async (c) => {
  const { id } = c.req.param();

  const [subscriber, subscriptions, transactions] = await Promise.all([
    c.env.DB.prepare('SELECT * FROM subscribers WHERE id = ?').bind(id).first(),
    c.env.DB.prepare('SELECT * FROM subscriptions WHERE subscriber_id = ? ORDER BY created_at DESC')
      .bind(id)
      .all(),
    c.env.DB.prepare(
      'SELECT * FROM transactions WHERE subscription_id IN (SELECT id FROM subscriptions WHERE subscriber_id = ?) ORDER BY created_at DESC LIMIT 50'
    )
      .bind(id)
      .all(),
  ]);

  if (!subscriber) {
    throw Errors.notFound('Subscriber');
  }

  return c.json({
    subscriber,
    subscriptions: subscriptions.results || [],
    transactions: transactions.results || [],
  });
});

// ============ Real-time Updates (SSE) ============

/**
 * GET /admin/stream
 * Server-Sent Events endpoint for real-time dashboard updates
 */
adminRouter.use('/stream', adminAuthMiddleware);
adminRouter.get('/stream', async (c) => {
  const encoder = new TextEncoder();

  // Create a readable stream for SSE
  const stream = new ReadableStream({
    async start(controller) {
      // Send initial connection message
      const initialData = JSON.stringify({
        type: 'connected',
        timestamp: Date.now(),
      });
      controller.enqueue(encoder.encode(`data: ${initialData}\n\n`));

      // Poll for updates every 5 seconds
      let running = true;
      let lastCheck = Date.now();

      const poll = async () => {
        if (!running) return;

        try {
          // Get recent events since last check
          const recentEvents = await c.env.DB.prepare(
            `SELECT ae.*, s.app_user_id
             FROM analytics_events ae
             LEFT JOIN subscribers s ON s.id = ae.subscriber_id
             WHERE ae.created_at > ?
             ORDER BY ae.created_at DESC
             LIMIT 10`
          )
            .bind(lastCheck)
            .all();

          // Get recent transactions
          const recentTransactions = await c.env.DB.prepare(
            `SELECT t.*, sub.product_id
             FROM transactions t
             LEFT JOIN subscriptions sub ON sub.id = t.subscription_id
             WHERE t.created_at > ?
             ORDER BY t.created_at DESC
             LIMIT 10`
          )
            .bind(lastCheck)
            .all();

          // Get current stats
          const [activeCount, mrrResult] = await Promise.all([
            c.env.DB.prepare("SELECT COUNT(*) as count FROM subscriptions WHERE status = 'active'").first<{ count: number }>(),
            c.env.DB.prepare(
              "SELECT SUM(price_amount) as total FROM subscriptions WHERE status = 'active' AND price_amount IS NOT NULL"
            ).first<{ total: number }>(),
          ]);

          lastCheck = Date.now();

          // Send update if there's new data
          if ((recentEvents.results?.length || 0) > 0 || (recentTransactions.results?.length || 0) > 0) {
            const eventData = JSON.stringify({
              type: 'update',
              timestamp: lastCheck,
              events: recentEvents.results || [],
              transactions: recentTransactions.results || [],
              stats: {
                active_subscriptions: activeCount?.count || 0,
                mrr: Math.round(((mrrResult?.total || 0) / 100) * 100) / 100,
              },
            });
            controller.enqueue(encoder.encode(`data: ${eventData}\n\n`));
          } else {
            // Send heartbeat
            const heartbeat = JSON.stringify({
              type: 'heartbeat',
              timestamp: lastCheck,
              stats: {
                active_subscriptions: activeCount?.count || 0,
                mrr: Math.round(((mrrResult?.total || 0) / 100) * 100) / 100,
              },
            });
            controller.enqueue(encoder.encode(`data: ${heartbeat}\n\n`));
          }

          // Schedule next poll
          setTimeout(poll, 5000);
        } catch (error) {
          console.error('SSE poll error:', error);
          // Try again after error
          setTimeout(poll, 10000);
        }
      };

      // Start polling
      poll();

      // Cleanup on close (handled by Cloudflare Workers)
      // Note: In production, you might want to use Durable Objects for better connection management
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
});

/**
 * GET /admin/stream/app/:id
 * SSE endpoint for app-specific real-time updates
 */
adminRouter.use('/stream/app/*', adminAuthMiddleware);
adminRouter.get('/stream/app/:id', async (c) => {
  const appId = c.req.param('id');
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const initialData = JSON.stringify({
        type: 'connected',
        app_id: appId,
        timestamp: Date.now(),
      });
      controller.enqueue(encoder.encode(`data: ${initialData}\n\n`));

      let lastCheck = Date.now();

      const poll = async () => {
        try {
          // Get app-specific recent events
          const recentEvents = await c.env.DB.prepare(
            `SELECT ae.*, s.app_user_id
             FROM analytics_events ae
             LEFT JOIN subscribers s ON s.id = ae.subscriber_id
             WHERE ae.app_id = ? AND ae.created_at > ?
             ORDER BY ae.created_at DESC
             LIMIT 10`
          )
            .bind(appId, lastCheck)
            .all();

          // Get app-specific recent transactions
          const recentTransactions = await c.env.DB.prepare(
            `SELECT t.*, sub.product_id
             FROM transactions t
             LEFT JOIN subscriptions sub ON sub.id = t.subscription_id
             WHERE t.app_id = ? AND t.created_at > ?
             ORDER BY t.created_at DESC
             LIMIT 10`
          )
            .bind(appId, lastCheck)
            .all();

          // Get app stats
          const [activeCount, mrrResult, subscriberCount] = await Promise.all([
            c.env.DB.prepare("SELECT COUNT(*) as count FROM subscriptions WHERE app_id = ? AND status = 'active'")
              .bind(appId)
              .first<{ count: number }>(),
            c.env.DB.prepare(
              "SELECT SUM(price_amount) as total FROM subscriptions WHERE app_id = ? AND status = 'active' AND price_amount IS NOT NULL"
            )
              .bind(appId)
              .first<{ total: number }>(),
            c.env.DB.prepare('SELECT COUNT(*) as count FROM subscribers WHERE app_id = ?')
              .bind(appId)
              .first<{ count: number }>(),
          ]);

          lastCheck = Date.now();

          const hasNewData = (recentEvents.results?.length || 0) > 0 || (recentTransactions.results?.length || 0) > 0;

          const eventData = JSON.stringify({
            type: hasNewData ? 'update' : 'heartbeat',
            app_id: appId,
            timestamp: lastCheck,
            events: hasNewData ? recentEvents.results : undefined,
            transactions: hasNewData ? recentTransactions.results : undefined,
            stats: {
              active_subscriptions: activeCount?.count || 0,
              total_subscribers: subscriberCount?.count || 0,
              mrr: Math.round(((mrrResult?.total || 0) / 100) * 100) / 100,
            },
          });
          controller.enqueue(encoder.encode(`data: ${eventData}\n\n`));

          setTimeout(poll, 5000);
        } catch (error) {
          console.error('SSE poll error:', error);
          setTimeout(poll, 10000);
        }
      };

      poll();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
});
