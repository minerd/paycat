/**
 * Analytics Routes
 * Subscription metrics and reporting
 */

import { Hono } from 'hono';
import type { Env, App } from '../types';
import {
  getAnalyticsOverview,
  getRevenueTimeSeries,
  getCohortAnalysis,
  calculateLTV,
  getSubscriptionFunnel,
} from '../services/analytics';
import { Errors } from '../middleware/error';
import { now, toISOString } from '../utils/time';

type Variables = { app: App };

export const analyticsRouter = new Hono<{
  Bindings: Env;
  Variables: Variables;
}>();

/**
 * GET /v1/analytics/overview
 * Get analytics overview
 * Query params:
 *   - period: Time period (e.g., 7d, 4w, 3m)
 *   - exclude_sandbox: If "true", exclude sandbox/test transactions
 */
analyticsRouter.get('/overview', async (c) => {
  const app = c.get('app');
  const period = c.req.query('period') || '30d';
  const excludeSandbox = c.req.query('exclude_sandbox') === 'true';

  // Parse period
  let periodDays = 30;
  if (period.endsWith('d')) {
    periodDays = parseInt(period.slice(0, -1), 10);
  } else if (period.endsWith('w')) {
    periodDays = parseInt(period.slice(0, -1), 10) * 7;
  } else if (period.endsWith('m')) {
    periodDays = parseInt(period.slice(0, -1), 10) * 30;
  }

  if (isNaN(periodDays) || periodDays < 1 || periodDays > 365) {
    throw Errors.validationError('Invalid period. Use format like 7d, 4w, or 3m');
  }

  const overview = await getAnalyticsOverview(c.env.DB, app.id, periodDays, excludeSandbox);

  return c.json({
    period: `${periodDays}d`,
    exclude_sandbox: excludeSandbox,
    ...overview,
  });
});

/**
 * GET /v1/analytics/revenue
 * Get revenue time series
 * Query params:
 *   - exclude_sandbox: If "true", exclude sandbox/test transactions
 */
analyticsRouter.get('/revenue', async (c) => {
  const app = c.get('app');
  const startParam = c.req.query('start');
  const endParam = c.req.query('end');
  const granularity = (c.req.query('granularity') || 'day') as 'day' | 'week' | 'month';
  const excludeSandbox = c.req.query('exclude_sandbox') === 'true';

  // Default to last 30 days
  const endDate = endParam ? new Date(endParam).getTime() : now();
  const startDate = startParam
    ? new Date(startParam).getTime()
    : endDate - 30 * 24 * 60 * 60 * 1000;

  if (startDate >= endDate) {
    throw Errors.validationError('start date must be before end date');
  }

  const data = await getRevenueTimeSeries(
    c.env.DB,
    app.id,
    startDate,
    endDate,
    granularity,
    excludeSandbox
  );

  // Aggregate by date (combine platforms)
  const aggregated: Record<string, number> = {};
  for (const row of data) {
    if (!aggregated[row.date]) {
      aggregated[row.date] = 0;
    }
    aggregated[row.date] += row.revenue;
  }

  const timeSeries = Object.entries(aggregated)
    .map(([date, revenue]) => ({ date, revenue }))
    .sort((a, b) => a.date.localeCompare(b.date));

  return c.json({
    start_date: toISOString(startDate),
    end_date: toISOString(endDate),
    granularity,
    exclude_sandbox: excludeSandbox,
    data: timeSeries,
    total: timeSeries.reduce((sum, row) => sum + row.revenue, 0),
  });
});

/**
 * GET /v1/analytics/cohort
 * Get cohort retention analysis
 */
analyticsRouter.get('/cohort', async (c) => {
  const app = c.get('app');
  const startParam = c.req.query('start');
  const endParam = c.req.query('end');

  // Default to last 6 months
  const endDate = endParam ? new Date(endParam).getTime() : now();
  const startDate = startParam
    ? new Date(startParam).getTime()
    : endDate - 180 * 24 * 60 * 60 * 1000;

  const analysis = await getCohortAnalysis(c.env.DB, app.id, startDate, endDate);

  return c.json({
    start_date: toISOString(startDate),
    end_date: toISOString(endDate),
    ...analysis,
  });
});

/**
 * GET /v1/analytics/ltv
 * Get Lifetime Value metrics
 */
analyticsRouter.get('/ltv', async (c) => {
  const app = c.get('app');
  const productId = c.req.query('product_id');

  const ltv = await calculateLTV(c.env.DB, app.id, productId);

  return c.json({
    product_id: productId || 'all',
    ...ltv,
  });
});

/**
 * GET /v1/analytics/funnel
 * Get subscription funnel metrics
 */
analyticsRouter.get('/funnel', async (c) => {
  const app = c.get('app');
  const period = c.req.query('period') || '30d';

  let periodDays = 30;
  if (period.endsWith('d')) {
    periodDays = parseInt(period.slice(0, -1), 10);
  }

  const endDate = now();
  const startDate = endDate - periodDays * 24 * 60 * 60 * 1000;

  const funnel = await getSubscriptionFunnel(c.env.DB, app.id, startDate, endDate);

  return c.json({
    period: `${periodDays}d`,
    ...funnel,
  });
});

/**
 * GET /v1/analytics/subscribers
 * Get subscriber counts by status
 * Query params:
 *   - exclude_sandbox: If "true", exclude sandbox/test subscriptions
 */
analyticsRouter.get('/subscribers', async (c) => {
  const app = c.get('app');
  const excludeSandbox = c.req.query('exclude_sandbox') === 'true';
  const sandboxFilter = excludeSandbox ? ' AND is_sandbox = 0' : '';

  const result = await c.env.DB.prepare(
    `SELECT
       status,
       platform,
       COUNT(DISTINCT subscriber_id) as count
     FROM subscriptions
     WHERE app_id = ?${sandboxFilter}
     GROUP BY status, platform`
  )
    .bind(app.id)
    .all<{ status: string; platform: string; count: number }>();

  // Aggregate by status
  const byStatus: Record<string, number> = {};
  const byPlatform: Record<string, number> = {};

  for (const row of result.results || []) {
    byStatus[row.status] = (byStatus[row.status] || 0) + row.count;
    byPlatform[row.platform] = (byPlatform[row.platform] || 0) + row.count;
  }

  return c.json({
    exclude_sandbox: excludeSandbox,
    by_status: byStatus,
    by_platform: byPlatform,
    total: Object.values(byStatus).reduce((a, b) => a + b, 0),
  });
});

/**
 * GET /v1/analytics/mrr
 * Get Monthly Recurring Revenue details
 * Query params:
 *   - exclude_sandbox: If "true", exclude sandbox/test subscriptions
 */
analyticsRouter.get('/mrr', async (c) => {
  const app = c.get('app');
  const excludeSandbox = c.req.query('exclude_sandbox') === 'true';
  const sandboxFilter = excludeSandbox ? ' AND is_sandbox = 0' : '';

  // Get MRR by product
  const result = await c.env.DB.prepare(
    `SELECT
       product_id,
       platform,
       SUM(price_amount) as mrr,
       COUNT(*) as subscribers
     FROM subscriptions
     WHERE app_id = ?
       AND status = 'active'
       AND price_amount IS NOT NULL${sandboxFilter}
     GROUP BY product_id, platform`
  )
    .bind(app.id)
    .all<{
      product_id: string;
      platform: string;
      mrr: number;
      subscribers: number;
    }>();

  const products = (result.results || []).map((row) => ({
    product_id: row.product_id,
    platform: row.platform,
    mrr: (row.mrr || 0) / 100,
    subscribers: row.subscribers,
  }));

  const totalMRR = products.reduce((sum, p) => sum + p.mrr, 0);

  return c.json({
    exclude_sandbox: excludeSandbox,
    total_mrr: totalMRR,
    currency: 'USD', // Would need to track actual currencies
    products,
  });
});

/**
 * GET /v1/analytics/events
 * Get analytics events
 */
analyticsRouter.get('/events', async (c) => {
  const app = c.get('app');
  const eventType = c.req.query('event_type');
  const limit = parseInt(c.req.query('limit') || '100', 10);
  const offset = parseInt(c.req.query('offset') || '0', 10);

  let query = `
    SELECT ae.*, s.app_user_id
    FROM analytics_events ae
    LEFT JOIN subscribers s ON s.id = ae.subscriber_id
    WHERE ae.app_id = ?
  `;
  const params: (string | number)[] = [app.id];

  if (eventType) {
    query += ' AND ae.event_type = ?';
    params.push(eventType);
  }

  query += ' ORDER BY ae.event_date DESC LIMIT ? OFFSET ?';
  params.push(limit, offset);

  const result = await c.env.DB.prepare(query).bind(...params).all();

  const events = (result.results || []).map((e) => ({
    id: e.id,
    event_type: e.event_type,
    event_date: toISOString(e.event_date as number),
    app_user_id: e.app_user_id,
    product_id: e.product_id,
    platform: e.platform,
    revenue: e.revenue_amount
      ? {
          amount: (e.revenue_amount as number) / 100,
          currency: e.revenue_currency,
        }
      : null,
  }));

  return c.json({ events, limit, offset });
});

/**
 * GET /v1/analytics/churn
 * Get churn analysis
 * Query params:
 *   - exclude_sandbox: If "true", exclude sandbox/test subscriptions
 */
analyticsRouter.get('/churn', async (c) => {
  const app = c.get('app');
  const period = c.req.query('period') || '30d';
  const excludeSandbox = c.req.query('exclude_sandbox') === 'true';
  const sandboxFilter = excludeSandbox ? ' AND is_sandbox = 0' : '';

  let periodDays = 30;
  if (period.endsWith('d')) {
    periodDays = parseInt(period.slice(0, -1), 10);
  }

  const endDate = now();
  const startDate = endDate - periodDays * 24 * 60 * 60 * 1000;

  // Get churned by reason (join with subscriptions for sandbox filter)
  const sandboxJoin = excludeSandbox
    ? ' JOIN subscriptions s ON s.subscriber_id = ae.subscriber_id AND s.is_sandbox = 0'
    : '';
  const result = await c.env.DB.prepare(
    `SELECT
       ae.event_type,
       COUNT(*) as count
     FROM analytics_events ae${sandboxJoin}
     WHERE ae.app_id = ?
       AND ae.event_type IN ('cancellation', 'expiration', 'refund')
       AND ae.event_date >= ?
       AND ae.event_date <= ?
     GROUP BY ae.event_type`
  )
    .bind(app.id, startDate, endDate)
    .all<{ event_type: string; count: number }>();

  const byReason: Record<string, number> = {};
  let totalChurned = 0;

  for (const row of result.results || []) {
    byReason[row.event_type] = row.count;
    totalChurned += row.count;
  }

  // Get active count for rate calculation
  const activeResult = await c.env.DB.prepare(
    `SELECT COUNT(DISTINCT subscriber_id) as count
     FROM subscriptions
     WHERE app_id = ? AND status = 'active'${sandboxFilter}`
  )
    .bind(app.id)
    .first<{ count: number }>();

  const activeCount = activeResult?.count || 0;
  const churnRate = activeCount + totalChurned > 0
    ? (totalChurned / (activeCount + totalChurned)) * 100
    : 0;

  return c.json({
    period: `${periodDays}d`,
    exclude_sandbox: excludeSandbox,
    total_churned: totalChurned,
    churn_rate: Math.round(churnRate * 100) / 100,
    by_reason: byReason,
    active_subscribers: activeCount,
  });
});

// =====================================================
// CSV EXPORT ENDPOINTS
// =====================================================

/**
 * GET /v1/analytics/export/subscribers
 * Export subscribers as CSV
 */
analyticsRouter.get('/export/subscribers', async (c) => {
  const app = c.get('app');
  const status = c.req.query('status');
  const platform = c.req.query('platform');
  const limit = Math.min(parseInt(c.req.query('limit') || '10000'), 50000);

  let query = `
    SELECT
      s.app_user_id,
      s.first_seen_at,
      s.last_seen_at,
      sub.product_id,
      sub.platform,
      sub.status,
      sub.purchase_date,
      sub.expires_at,
      sub.is_trial,
      sub.is_sandbox,
      sub.will_renew,
      sub.price_amount,
      sub.price_currency
    FROM subscribers s
    LEFT JOIN subscriptions sub ON sub.subscriber_id = s.id
    WHERE s.app_id = ?
  `;
  const params: (string | number)[] = [app.id];

  if (status) {
    query += ' AND sub.status = ?';
    params.push(status);
  }

  if (platform) {
    query += ' AND sub.platform = ?';
    params.push(platform);
  }

  query += ' ORDER BY s.created_at DESC LIMIT ?';
  params.push(limit);

  const result = await c.env.DB.prepare(query).bind(...params).all();

  // Build CSV
  const headers = [
    'app_user_id',
    'first_seen_at',
    'last_seen_at',
    'product_id',
    'platform',
    'status',
    'purchase_date',
    'expires_at',
    'is_trial',
    'is_sandbox',
    'will_renew',
    'price_amount',
    'price_currency',
  ];

  const rows = (result.results || []).map((row: any) => [
    row.app_user_id || '',
    row.first_seen_at ? toISOString(row.first_seen_at) : '',
    row.last_seen_at ? toISOString(row.last_seen_at) : '',
    row.product_id || '',
    row.platform || '',
    row.status || '',
    row.purchase_date ? toISOString(row.purchase_date) : '',
    row.expires_at ? toISOString(row.expires_at) : '',
    row.is_trial ? 'true' : 'false',
    row.is_sandbox ? 'true' : 'false',
    row.will_renew ? 'true' : 'false',
    row.price_amount ? (row.price_amount / 100).toFixed(2) : '',
    row.price_currency || '',
  ]);

  const csv = [headers.join(','), ...rows.map((r) => r.map(escapeCSV).join(','))].join('\n');

  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': `attachment; filename="subscribers_${Date.now()}.csv"`,
    },
  });
});

/**
 * GET /v1/analytics/export/transactions
 * Export transactions as CSV
 */
analyticsRouter.get('/export/transactions', async (c) => {
  const app = c.get('app');
  const startParam = c.req.query('start');
  const endParam = c.req.query('end');
  const platform = c.req.query('platform');
  const limit = Math.min(parseInt(c.req.query('limit') || '10000'), 50000);

  const endDate = endParam ? new Date(endParam).getTime() : now();
  const startDate = startParam
    ? new Date(startParam).getTime()
    : endDate - 90 * 24 * 60 * 60 * 1000;

  let query = `
    SELECT
      t.transaction_id,
      t.original_transaction_id,
      t.product_id,
      t.platform,
      t.type,
      t.purchase_date,
      t.expires_date,
      t.revenue_amount,
      t.revenue_currency,
      t.is_refunded,
      t.refund_date,
      s.app_user_id
    FROM transactions t
    LEFT JOIN subscriptions sub ON sub.id = t.subscription_id
    LEFT JOIN subscribers s ON s.id = sub.subscriber_id
    WHERE t.app_id = ?
      AND t.purchase_date >= ?
      AND t.purchase_date <= ?
  `;
  const params: (string | number)[] = [app.id, startDate, endDate];

  if (platform) {
    query += ' AND t.platform = ?';
    params.push(platform);
  }

  query += ' ORDER BY t.purchase_date DESC LIMIT ?';
  params.push(limit);

  const result = await c.env.DB.prepare(query).bind(...params).all();

  const headers = [
    'transaction_id',
    'original_transaction_id',
    'app_user_id',
    'product_id',
    'platform',
    'type',
    'purchase_date',
    'expires_date',
    'revenue_amount',
    'revenue_currency',
    'is_refunded',
    'refund_date',
  ];

  const rows = (result.results || []).map((row: any) => [
    row.transaction_id || '',
    row.original_transaction_id || '',
    row.app_user_id || '',
    row.product_id || '',
    row.platform || '',
    row.type || '',
    row.purchase_date ? toISOString(row.purchase_date) : '',
    row.expires_date ? toISOString(row.expires_date) : '',
    row.revenue_amount ? (row.revenue_amount / 100).toFixed(2) : '',
    row.revenue_currency || '',
    row.is_refunded ? 'true' : 'false',
    row.refund_date ? toISOString(row.refund_date) : '',
  ]);

  const csv = [headers.join(','), ...rows.map((r) => r.map(escapeCSV).join(','))].join('\n');

  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': `attachment; filename="transactions_${Date.now()}.csv"`,
    },
  });
});

/**
 * GET /v1/analytics/export/revenue
 * Export revenue data as CSV
 */
analyticsRouter.get('/export/revenue', async (c) => {
  const app = c.get('app');
  const startParam = c.req.query('start');
  const endParam = c.req.query('end');
  const granularity = (c.req.query('granularity') || 'day') as 'day' | 'week' | 'month';
  const excludeSandbox = c.req.query('exclude_sandbox') === 'true';

  const endDate = endParam ? new Date(endParam).getTime() : now();
  const startDate = startParam
    ? new Date(startParam).getTime()
    : endDate - 365 * 24 * 60 * 60 * 1000;

  const data = await getRevenueTimeSeries(c.env.DB, app.id, startDate, endDate, granularity, excludeSandbox);

  const headers = ['date', 'platform', 'revenue', 'transactions'];

  const rows = data.map((row) => [
    row.date,
    row.platform || '',
    (row.revenue / 100).toFixed(2),
    row.count.toString(),
  ]);

  const csv = [headers.join(','), ...rows.map((r) => r.map((v) => escapeCSV(v)).join(','))].join('\n');

  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': `attachment; filename="revenue_${Date.now()}.csv"`,
    },
  });
});

/**
 * GET /v1/analytics/export/events
 * Export analytics events as CSV
 */
analyticsRouter.get('/export/events', async (c) => {
  const app = c.get('app');
  const startParam = c.req.query('start');
  const endParam = c.req.query('end');
  const eventType = c.req.query('event_type');
  const limit = Math.min(parseInt(c.req.query('limit') || '10000'), 50000);

  const endDate = endParam ? new Date(endParam).getTime() : now();
  const startDate = startParam
    ? new Date(startParam).getTime()
    : endDate - 90 * 24 * 60 * 60 * 1000;

  let query = `
    SELECT
      ae.id,
      ae.event_type,
      ae.event_date,
      ae.product_id,
      ae.platform,
      ae.revenue_amount,
      ae.revenue_currency,
      s.app_user_id
    FROM analytics_events ae
    LEFT JOIN subscribers s ON s.id = ae.subscriber_id
    WHERE ae.app_id = ?
      AND ae.event_date >= ?
      AND ae.event_date <= ?
  `;
  const params: (string | number)[] = [app.id, startDate, endDate];

  if (eventType) {
    query += ' AND ae.event_type = ?';
    params.push(eventType);
  }

  query += ' ORDER BY ae.event_date DESC LIMIT ?';
  params.push(limit);

  const result = await c.env.DB.prepare(query).bind(...params).all();

  const headers = [
    'event_id',
    'event_type',
    'event_date',
    'app_user_id',
    'product_id',
    'platform',
    'revenue_amount',
    'revenue_currency',
  ];

  const rows = (result.results || []).map((row: any) => [
    row.id || '',
    row.event_type || '',
    row.event_date ? toISOString(row.event_date) : '',
    row.app_user_id || '',
    row.product_id || '',
    row.platform || '',
    row.revenue_amount ? (row.revenue_amount / 100).toFixed(2) : '',
    row.revenue_currency || '',
  ]);

  const csv = [headers.join(','), ...rows.map((r) => r.map(escapeCSV).join(','))].join('\n');

  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': `attachment; filename="events_${Date.now()}.csv"`,
    },
  });
});

/**
 * GET /v1/analytics/export/mrr
 * Export MRR history as CSV
 */
analyticsRouter.get('/export/mrr', async (c) => {
  const app = c.get('app');

  // Get MRR breakdown by product and platform
  const result = await c.env.DB.prepare(
    `SELECT
       product_id,
       platform,
       price_currency,
       SUM(price_amount) as mrr,
       COUNT(*) as subscribers
     FROM subscriptions
     WHERE app_id = ?
       AND status = 'active'
       AND price_amount IS NOT NULL
     GROUP BY product_id, platform, price_currency
     ORDER BY mrr DESC`
  )
    .bind(app.id)
    .all();

  const headers = ['product_id', 'platform', 'currency', 'mrr', 'subscribers'];

  const rows = (result.results || []).map((row: any) => [
    row.product_id || '',
    row.platform || '',
    row.price_currency || 'USD',
    ((row.mrr || 0) / 100).toFixed(2),
    row.subscribers.toString(),
  ]);

  const csv = [headers.join(','), ...rows.map((r) => r.map(escapeCSV).join(','))].join('\n');

  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': `attachment; filename="mrr_${Date.now()}.csv"`,
    },
  });
});

// Helper function to escape CSV values
function escapeCSV(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n') || value.includes('\r')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}
