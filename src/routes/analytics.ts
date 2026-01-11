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
 */
analyticsRouter.get('/overview', async (c) => {
  const app = c.get('app');
  const period = c.req.query('period') || '30d';

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

  const overview = await getAnalyticsOverview(c.env.DB, app.id, periodDays);

  return c.json({
    period: `${periodDays}d`,
    ...overview,
  });
});

/**
 * GET /v1/analytics/revenue
 * Get revenue time series
 */
analyticsRouter.get('/revenue', async (c) => {
  const app = c.get('app');
  const startParam = c.req.query('start');
  const endParam = c.req.query('end');
  const granularity = (c.req.query('granularity') || 'day') as 'day' | 'week' | 'month';

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
    granularity
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
 */
analyticsRouter.get('/subscribers', async (c) => {
  const app = c.get('app');

  const result = await c.env.DB.prepare(
    `SELECT
       status,
       platform,
       COUNT(DISTINCT subscriber_id) as count
     FROM subscriptions
     WHERE app_id = ?
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
    by_status: byStatus,
    by_platform: byPlatform,
    total: Object.values(byStatus).reduce((a, b) => a + b, 0),
  });
});

/**
 * GET /v1/analytics/mrr
 * Get Monthly Recurring Revenue details
 */
analyticsRouter.get('/mrr', async (c) => {
  const app = c.get('app');

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
       AND price_amount IS NOT NULL
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
 */
analyticsRouter.get('/churn', async (c) => {
  const app = c.get('app');
  const period = c.req.query('period') || '30d';

  let periodDays = 30;
  if (period.endsWith('d')) {
    periodDays = parseInt(period.slice(0, -1), 10);
  }

  const endDate = now();
  const startDate = endDate - periodDays * 24 * 60 * 60 * 1000;

  // Get churned by reason
  const result = await c.env.DB.prepare(
    `SELECT
       event_type,
       COUNT(*) as count
     FROM analytics_events
     WHERE app_id = ?
       AND event_type IN ('cancellation', 'expiration', 'refund')
       AND event_date >= ?
       AND event_date <= ?
     GROUP BY event_type`
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
     WHERE app_id = ? AND status = 'active'`
  )
    .bind(app.id)
    .first<{ count: number }>();

  const activeCount = activeResult?.count || 0;
  const churnRate = activeCount + totalChurned > 0
    ? (totalChurned / (activeCount + totalChurned)) * 100
    : 0;

  return c.json({
    period: `${periodDays}d`,
    total_churned: totalChurned,
    churn_rate: Math.round(churnRate * 100) / 100,
    by_reason: byReason,
    active_subscribers: activeCount,
  });
});
