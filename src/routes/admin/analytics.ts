/**
 * Admin Analytics Routes
 * Wraps existing analytics service functions with admin auth
 */

import { Hono } from 'hono';
import type { Env } from '../../types';
import { adminAuthMiddleware } from '../../middleware/admin-auth';
import {
  getAnalyticsOverview,
  getRevenueTimeSeries,
  getCohortAnalysis,
  calculateLTV,
  getSubscriptionFunnel,
} from '../../services/analytics';

export const adminAnalyticsRouter = new Hono<{ Bindings: Env }>();

adminAnalyticsRouter.use('*', adminAuthMiddleware);

function parsePeriod(period: string): number {
  let days = 30;
  if (period.endsWith('d')) days = parseInt(period.slice(0, -1), 10);
  else if (period.endsWith('w')) days = parseInt(period.slice(0, -1), 10) * 7;
  else if (period.endsWith('m')) days = parseInt(period.slice(0, -1), 10) * 30;
  return isNaN(days) || days < 1 ? 30 : Math.min(days, 365);
}

/**
 * GET /admin/apps/:id/analytics/overview
 */
adminAnalyticsRouter.get('/overview', async (c) => {
  const appId = c.req.param('id')!;
  const period = c.req.query('period') || '30d';
  const excludeSandbox = c.req.query('exclude_sandbox') === 'true';
  const periodDays = parsePeriod(period);

  const overview = await getAnalyticsOverview(c.env.DB, appId, periodDays, excludeSandbox);
  return c.json({ period: `${periodDays}d`, exclude_sandbox: excludeSandbox, ...overview });
});

/**
 * GET /admin/apps/:id/analytics/revenue
 */
adminAnalyticsRouter.get('/revenue', async (c) => {
  const appId = c.req.param('id')!;
  const period = c.req.query('period') || '30d';
  const excludeSandbox = c.req.query('exclude_sandbox') === 'true';
  const periodDays = parsePeriod(period);
  const endDate = Date.now();
  const startDate = endDate - periodDays * 24 * 60 * 60 * 1000;

  const data = await getRevenueTimeSeries(c.env.DB, appId, startDate, endDate, 'day', excludeSandbox);
  return c.json({ data, period: `${periodDays}d` });
});

/**
 * GET /admin/apps/:id/analytics/subscribers
 */
adminAnalyticsRouter.get('/subscribers', async (c) => {
  const appId = c.req.param('id')!;
  const excludeSandbox = c.req.query('exclude_sandbox') === 'true';
  const sandboxFilter = excludeSandbox ? ' AND is_sandbox = 0' : '';

  const result = await c.env.DB.prepare(
    `SELECT status, platform, COUNT(DISTINCT subscriber_id) as count
     FROM subscriptions WHERE app_id = ?${sandboxFilter}
     GROUP BY status, platform`
  ).bind(appId).all<{ status: string; platform: string; count: number }>();

  const byStatus: Record<string, number> = {};
  const byPlatform: Record<string, number> = {};
  for (const row of result.results || []) {
    byStatus[row.status] = (byStatus[row.status] || 0) + row.count;
    byPlatform[row.platform] = (byPlatform[row.platform] || 0) + row.count;
  }

  // Get growth data (new vs churned by day, last 30 days)
  const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const growth = await c.env.DB.prepare(
    `SELECT DATE(event_date / 1000, 'unixepoch') as date, event_type, COUNT(*) as count
     FROM analytics_events WHERE app_id = ? AND event_date >= ?
     AND event_type IN ('initial_purchase', 'trial_started', 'cancellation', 'expiration')
     GROUP BY date, event_type ORDER BY date`
  ).bind(appId, thirtyDaysAgo).all<{ date: string; event_type: string; count: number }>();

  return c.json({ by_status: byStatus, by_platform: byPlatform, growth: growth.results || [] });
});

/**
 * GET /admin/apps/:id/analytics/mrr
 */
adminAnalyticsRouter.get('/mrr', async (c) => {
  const appId = c.req.param('id')!;
  const excludeSandbox = c.req.query('exclude_sandbox') === 'true';
  const sandboxFilter = excludeSandbox ? ' AND is_sandbox = 0' : '';

  const result = await c.env.DB.prepare(
    `SELECT product_id, platform, SUM(price_amount) as mrr, COUNT(*) as subscribers
     FROM subscriptions WHERE app_id = ? AND status = 'active' AND price_amount IS NOT NULL${sandboxFilter}
     GROUP BY product_id, platform`
  ).bind(appId).all<{ product_id: string; platform: string; mrr: number; subscribers: number }>();

  const products = (result.results || []).map((r) => ({
    product_id: r.product_id, platform: r.platform,
    mrr: (r.mrr || 0) / 100, subscribers: r.subscribers,
  }));

  return c.json({ total_mrr: products.reduce((s, p) => s + p.mrr, 0), products });
});

/**
 * GET /admin/apps/:id/analytics/churn
 */
adminAnalyticsRouter.get('/churn', async (c) => {
  const appId = c.req.param('id')!;
  const period = c.req.query('period') || '30d';
  const excludeSandbox = c.req.query('exclude_sandbox') === 'true';
  const periodDays = parsePeriod(period);
  const endDate = Date.now();
  const startDate = endDate - periodDays * 24 * 60 * 60 * 1000;
  const sandboxFilter = excludeSandbox ? ' AND is_sandbox = 0' : '';

  // Churn by reason
  const result = await c.env.DB.prepare(
    `SELECT event_type, COUNT(*) as count FROM analytics_events
     WHERE app_id = ? AND event_type IN ('cancellation', 'expiration', 'refund')
     AND event_date >= ? AND event_date <= ? GROUP BY event_type`
  ).bind(appId, startDate, endDate).all<{ event_type: string; count: number }>();

  // Churn rate over time (weekly)
  const churnOverTime = await c.env.DB.prepare(
    `SELECT DATE(event_date / 1000, 'unixepoch') as date, COUNT(*) as count
     FROM analytics_events WHERE app_id = ?
     AND event_type IN ('cancellation', 'expiration', 'refund')
     AND event_date >= ? AND event_date <= ?
     GROUP BY date ORDER BY date`
  ).bind(appId, startDate, endDate).all<{ date: string; count: number }>();

  const byReason: Record<string, number> = {};
  let total = 0;
  for (const row of result.results || []) {
    byReason[row.event_type] = row.count;
    total += row.count;
  }

  const activeResult = await c.env.DB.prepare(
    `SELECT COUNT(DISTINCT subscriber_id) as count FROM subscriptions
     WHERE app_id = ? AND status = 'active'${sandboxFilter}`
  ).bind(appId).first<{ count: number }>();

  const active = activeResult?.count || 0;
  const rate = active + total > 0 ? (total / (active + total)) * 100 : 0;

  return c.json({
    total_churned: total, churn_rate: Math.round(rate * 100) / 100,
    by_reason: byReason, over_time: churnOverTime.results || [],
    active_subscribers: active,
  });
});

/**
 * GET /admin/apps/:id/analytics/cohort
 */
adminAnalyticsRouter.get('/cohort', async (c) => {
  const appId = c.req.param('id')!;
  const endDate = Date.now();
  const startDate = endDate - 180 * 24 * 60 * 60 * 1000;

  const analysis = await getCohortAnalysis(c.env.DB, appId, startDate, endDate);
  return c.json(analysis);
});

/**
 * GET /admin/apps/:id/analytics/ltv
 */
adminAnalyticsRouter.get('/ltv', async (c) => {
  const appId = c.req.param('id')!;
  const ltv = await calculateLTV(c.env.DB, appId);
  return c.json(ltv);
});

/**
 * GET /admin/apps/:id/analytics/funnel
 */
adminAnalyticsRouter.get('/funnel', async (c) => {
  const appId = c.req.param('id')!;
  const period = c.req.query('period') || '30d';
  const periodDays = parsePeriod(period);
  const endDate = Date.now();
  const startDate = endDate - periodDays * 24 * 60 * 60 * 1000;

  const funnel = await getSubscriptionFunnel(c.env.DB, appId, startDate, endDate);
  return c.json({ period: `${periodDays}d`, ...funnel });
});
