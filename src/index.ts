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

// Import routes
import { receiptsRouter } from './routes/receipts';
import { subscribersRouter } from './routes/subscribers';
import { subscriptionsRouter } from './routes/subscriptions';
import { entitlementsRouter } from './routes/entitlements';
import { webhooksRouter } from './routes/webhooks';
import { analyticsRouter } from './routes/analytics';
import { appleNotificationsRouter } from './routes/notifications/apple';
import { googleNotificationsRouter } from './routes/notifications/google';
import { stripeNotificationsRouter } from './routes/notifications/stripe';
import { adminRouter } from './routes/admin';

// Create main app
const app = new Hono<{ Bindings: Env }>();

// Global middleware
app.use('*', cors());
app.use('*', prettyJSON());
app.use('*', secureHeaders());
app.use('*', loggingMiddleware);
app.use('*', errorMiddleware);

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

app.route('/v1', v1);

// Notification endpoints (platform-specific auth)
app.route('/v1/notifications/apple', appleNotificationsRouter);
app.route('/v1/notifications/google', googleNotificationsRouter);
app.route('/v1/notifications/stripe', stripeNotificationsRouter);

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

export default app;
