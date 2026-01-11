/**
 * PayCat - Unified Payment & Subscription Management System
 * Cloudflare Workers Entry Point
 */

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { prettyJSON } from 'hono/pretty-json';
import { secureHeaders } from 'hono/secure-headers';

import type { Env } from './types';
import { errorMiddleware, PayCatError } from './middleware/error';
import { loggingMiddleware } from './middleware/logging';
import { authMiddleware } from './middleware/auth';
import { rateLimitMiddleware } from './middleware/rate-limit';

// Import routes
import { receiptsRouter } from './routes/receipts';
import { subscribersRouter } from './routes/subscribers';
import { subscriptionsRouter } from './routes/subscriptions';
import { entitlementsRouter } from './routes/entitlements';
import { webhooksRouter } from './routes/webhooks';
import { analyticsRouter } from './routes/analytics';
import { offeringsRouter } from './routes/offerings';
import { integrationsRouter } from './routes/integrations';
import { paywallsRouter } from './routes/paywalls';
import { reportsRouter } from './routes/reports';
import { appleNotificationsRouter } from './routes/notifications/apple';
import { googleNotificationsRouter } from './routes/notifications/google';
import { stripeNotificationsRouter } from './routes/notifications/stripe';
import { amazonNotificationsRouter } from './routes/notifications/amazon';
import { paddleNotificationsRouter } from './routes/notifications/paddle';
import { adminRouter } from './routes/admin';
import { handleScheduled } from './scheduled';

// Create main app
const app = new Hono<{ Bindings: Env }>();

// Global middleware
app.use('*', cors());
app.use('*', prettyJSON());
app.use('*', secureHeaders());
app.use('*', loggingMiddleware);
app.use('*', errorMiddleware);
app.use('*', rateLimitMiddleware);

// Health check (no auth required)
app.get('/', (c) => {
  return c.json({
    name: 'PayCat',
    version: '1.0.0',
    status: 'ok',
    timestamp: new Date().toISOString(),
  });
});

app.get('/health', (c) => {
  return c.json({ status: 'healthy' });
});

// API v1 routes (require auth)
const v1 = new Hono<{ Bindings: Env }>();
v1.use('*', authMiddleware);

// Mount route handlers
v1.route('/receipts', receiptsRouter);
v1.route('/subscribers', subscribersRouter);
v1.route('/subscriptions', subscriptionsRouter);
v1.route('/entitlements', entitlementsRouter);
v1.route('/webhooks', webhooksRouter);
v1.route('/analytics', analyticsRouter);
v1.route('/offerings', offeringsRouter);
v1.route('/products', offeringsRouter);
v1.route('/integrations', integrationsRouter);
v1.route('/events', integrationsRouter);
v1.route('/paywalls', paywallsRouter);
v1.route('/reports', reportsRouter);

app.route('/v1', v1);

// Notification endpoints (platform-specific auth)
app.route('/v1/notifications/apple', appleNotificationsRouter);
app.route('/v1/notifications/google', googleNotificationsRouter);
app.route('/v1/notifications/stripe', stripeNotificationsRouter);
app.route('/v1/notifications/amazon', amazonNotificationsRouter);
app.route('/v1/notifications/paddle', paddleNotificationsRouter);

// Admin panel endpoints
app.route('/admin', adminRouter);

// 404 handler
app.notFound((c) => {
  return c.json(
    {
      error: {
        code: 'not_found',
        message: 'Endpoint not found',
      },
    },
    404
  );
});

// Global error handler (catches errors that bypass middleware)
app.onError((err, c) => {
  // Handle PayCatError
  if (err instanceof Error && err.name === 'PayCatError' && 'code' in err && 'status' in err) {
    const payCatErr = err as PayCatError;
    return c.json(payCatErr.toJSON(), payCatErr.status as 400 | 401 | 403 | 404 | 429 | 500 | 502);
  }

  console.error('Unhandled error:', err);
  return c.json(
    {
      error: {
        code: 'internal_error',
        message: 'An unexpected error occurred',
      },
    },
    500
  );
});

// Export worker with both fetch and scheduled handlers
export default {
  fetch: app.fetch,
  scheduled: handleScheduled,
};
