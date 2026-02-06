/**
 * Analytics Service
 * Aggregates and calculates subscription metrics
 */

import type { Platform, AnalyticsOverview } from '../types';
import {
  getActiveSubscribersCount,
  getActiveTrialsCount,
  getMRR,
  getRevenueByPlatform,
  getChurnRate,
} from '../db/queries';
import { now } from '../utils/time';

/**
 * Get analytics overview for an app
 */
export async function getAnalyticsOverview(
  db: D1Database,
  appId: string,
  periodDays: number = 30,
  excludeSandbox: boolean = false
): Promise<AnalyticsOverview> {
  const endDate = now();
  const startDate = endDate - periodDays * 24 * 60 * 60 * 1000;

  // Run all queries in parallel
  const [
    activeSubscribers,
    activeTrials,
    mrr,
    revenueByPlatform,
    churnRate,
    newSubscribers,
    conversions,
    refunds,
  ] = await Promise.all([
    getActiveSubscribersCount(db, appId, excludeSandbox),
    getActiveTrialsCount(db, appId, excludeSandbox),
    getMRR(db, appId, excludeSandbox),
    getRevenueByPlatform(db, appId, startDate, endDate, excludeSandbox),
    getChurnRate(db, appId, periodDays, excludeSandbox),
    getNewSubscribersCount(db, appId, startDate, endDate, excludeSandbox),
    getConversionsCount(db, appId, startDate, endDate),
    getRefundsCount(db, appId, startDate, endDate, excludeSandbox),
  ]);

  return {
    mrr,
    active_subscribers: activeSubscribers,
    active_trials: activeTrials,
    churn_rate: Math.round(churnRate * 100) / 100,
    new_subscribers: newSubscribers,
    conversions,
    refunds,
    revenue_by_platform: revenueByPlatform,
  };
}

/**
 * Get count of new subscribers in period
 */
async function getNewSubscribersCount(
  db: D1Database,
  appId: string,
  startDate: number,
  endDate: number,
  excludeSandbox: boolean = false
): Promise<number> {
  const sandboxFilter = excludeSandbox ? ' AND is_sandbox = 0' : '';
  const result = await db
    .prepare(
      `SELECT COUNT(DISTINCT subscriber_id) as count
       FROM subscriptions
       WHERE app_id = ?
         AND created_at >= ?
         AND created_at <= ?${sandboxFilter}`
    )
    .bind(appId, startDate, endDate)
    .first<{ count: number }>();

  return result?.count || 0;
}

/**
 * Get count of trial conversions in period
 */
async function getConversionsCount(
  db: D1Database,
  appId: string,
  startDate: number,
  endDate: number
): Promise<number> {
  const result = await db
    .prepare(
      `SELECT COUNT(*) as count
       FROM analytics_events
       WHERE app_id = ?
         AND event_type = 'trial_converted'
         AND event_date >= ?
         AND event_date <= ?`
    )
    .bind(appId, startDate, endDate)
    .first<{ count: number }>();

  return result?.count || 0;
}

/**
 * Get count of refunds in period
 */
async function getRefundsCount(
  db: D1Database,
  appId: string,
  startDate: number,
  endDate: number,
  excludeSandbox: boolean = false
): Promise<number> {
  const sandboxJoin = excludeSandbox
    ? ' JOIN subscriptions s ON s.id = t.subscription_id AND s.is_sandbox = 0'
    : '';
  const result = await db
    .prepare(
      `SELECT COUNT(*) as count
       FROM transactions t${sandboxJoin}
       WHERE t.app_id = ?
         AND t.is_refunded = 1
         AND t.refund_date >= ?
         AND t.refund_date <= ?`
    )
    .bind(appId, startDate, endDate)
    .first<{ count: number }>();

  return result?.count || 0;
}

/**
 * Get revenue time series
 */
export async function getRevenueTimeSeries(
  db: D1Database,
  appId: string,
  startDate: number,
  endDate: number,
  _granularity: 'day' | 'week' | 'month' = 'day',
  excludeSandbox: boolean = false
): Promise<Array<{ date: string; revenue: number; platform?: Platform; count: number }>> {
  const sandboxJoin = excludeSandbox
    ? ' JOIN subscriptions s ON s.id = t.subscription_id AND s.is_sandbox = 0'
    : '';
  const result = await db
    .prepare(
      `SELECT
         DATE(t.purchase_date / 1000, 'unixepoch') as date,
         t.platform,
         SUM(t.revenue_amount) as revenue,
         COUNT(*) as count
       FROM transactions t${sandboxJoin}
       WHERE t.app_id = ?
         AND t.purchase_date >= ?
         AND t.purchase_date <= ?
         AND t.is_refunded = 0
       GROUP BY date, t.platform
       ORDER BY date`
    )
    .bind(appId, startDate, endDate)
    .all<{ date: string; platform: Platform; revenue: number; count: number }>();

  // Aggregate by granularity if needed
  const data = (result.results || []).map((row) => ({
    date: row.date,
    revenue: (row.revenue || 0) / 100,
    platform: row.platform,
    count: row.count || 0,
  }));

  return data;
}

/**
 * Get subscriber cohort analysis
 */
export async function getCohortAnalysis(
  db: D1Database,
  appId: string,
  startDate: number,
  endDate: number
): Promise<{
  cohorts: Array<{
    cohort_month: string;
    subscribers: number;
    retention: number[];
  }>;
}> {
  // Get cohorts by month of first subscription
  const cohorts = await db
    .prepare(
      `SELECT
         strftime('%Y-%m', purchase_date / 1000, 'unixepoch') as cohort_month,
         COUNT(DISTINCT subscriber_id) as subscribers
       FROM subscriptions
       WHERE app_id = ?
         AND purchase_date >= ?
         AND purchase_date <= ?
       GROUP BY cohort_month
       ORDER BY cohort_month`
    )
    .bind(appId, startDate, endDate)
    .all<{ cohort_month: string; subscribers: number }>();

  // For each cohort, calculate retention by month
  const cohortData = await Promise.all(
    (cohorts.results || []).map(async (cohort) => {
      const retention = await calculateCohortRetention(
        db,
        appId,
        cohort.cohort_month,
        6 // 6 months of retention data
      );

      return {
        cohort_month: cohort.cohort_month,
        subscribers: cohort.subscribers,
        retention,
      };
    })
  );

  return { cohorts: cohortData };
}

/**
 * Calculate retention for a cohort
 */
async function calculateCohortRetention(
  db: D1Database,
  appId: string,
  cohortMonth: string,
  months: number
): Promise<number[]> {
  const retention: number[] = [];

  // Get cohort subscribers
  const cohortSubscribers = await db
    .prepare(
      `SELECT DISTINCT subscriber_id
       FROM subscriptions
       WHERE app_id = ?
         AND strftime('%Y-%m', purchase_date / 1000, 'unixepoch') = ?`
    )
    .bind(appId, cohortMonth)
    .all<{ subscriber_id: string }>();

  const totalSubscribers = cohortSubscribers.results?.length || 0;
  if (totalSubscribers === 0) return [];

  // For each subsequent month, check how many are still active
  for (let i = 0; i < months; i++) {
    // Calculate the month to check
    const [year, month] = cohortMonth.split('-').map(Number);
    const checkDate = new Date(year, month - 1 + i + 1, 1); // First day of next month after offset i
    const checkTimestamp = checkDate.getTime();

    const activeInMonth = await db
      .prepare(
        `SELECT COUNT(DISTINCT subscriber_id) as count
         FROM subscriptions
         WHERE app_id = ?
           AND subscriber_id IN (${cohortSubscribers.results?.map(() => '?').join(',')})
           AND status = 'active'
           AND expires_at >= ?`
      )
      .bind(
        appId,
        ...(cohortSubscribers.results?.map((s) => s.subscriber_id) || []),
        checkTimestamp
      )
      .first<{ count: number }>();

    const retentionRate = ((activeInMonth?.count || 0) / totalSubscribers) * 100;
    retention.push(Math.round(retentionRate * 10) / 10);
  }

  return retention;
}

/**
 * Calculate Lifetime Value (LTV)
 */
export async function calculateLTV(
  db: D1Database,
  appId: string,
  productId?: string
): Promise<{
  average_ltv: number;
  median_ltv: number;
  by_platform: Record<Platform, number>;
}> {
  // Get total revenue per subscriber
  let query = `
    SELECT
      s.subscriber_id,
      s.platform,
      SUM(t.revenue_amount) as total_revenue
    FROM subscriptions s
    JOIN transactions t ON t.subscription_id = s.id
    WHERE s.app_id = ?
      AND t.is_refunded = 0
  `;
  const params: (string | number)[] = [appId];

  if (productId) {
    query += ' AND s.product_id = ?';
    params.push(productId);
  }

  query += ' GROUP BY s.subscriber_id, s.platform';

  const result = await db.prepare(query).bind(...params).all<{
    subscriber_id: string;
    platform: Platform;
    total_revenue: number;
  }>();

  const revenues = (result.results || []).map((r) => (r.total_revenue || 0) / 100);

  if (revenues.length === 0) {
    return {
      average_ltv: 0,
      median_ltv: 0,
      by_platform: { ios: 0, android: 0, stripe: 0 },
    };
  }

  // Calculate average
  const average_ltv = revenues.reduce((a, b) => a + b, 0) / revenues.length;

  // Calculate median
  const sorted = [...revenues].sort((a, b) => a - b);
  const median_ltv =
    sorted.length % 2 === 0
      ? (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2
      : sorted[Math.floor(sorted.length / 2)];

  // Calculate by platform
  const byPlatform: Record<Platform, number[]> = { ios: [], android: [], stripe: [] };
  for (const row of result.results || []) {
    byPlatform[row.platform].push((row.total_revenue || 0) / 100);
  }

  const platformLTV: Record<Platform, number> = {
    ios:
      byPlatform.ios.length > 0
        ? byPlatform.ios.reduce((a, b) => a + b, 0) / byPlatform.ios.length
        : 0,
    android:
      byPlatform.android.length > 0
        ? byPlatform.android.reduce((a, b) => a + b, 0) / byPlatform.android.length
        : 0,
    stripe:
      byPlatform.stripe.length > 0
        ? byPlatform.stripe.reduce((a, b) => a + b, 0) / byPlatform.stripe.length
        : 0,
  };

  return {
    average_ltv: Math.round(average_ltv * 100) / 100,
    median_ltv: Math.round(median_ltv * 100) / 100,
    by_platform: platformLTV,
  };
}

/**
 * Get subscription funnel metrics
 */
export async function getSubscriptionFunnel(
  db: D1Database,
  appId: string,
  startDate: number,
  endDate: number
): Promise<{
  impressions?: number; // Would come from client analytics
  trials_started: number;
  trials_converted: number;
  subscriptions_active: number;
  subscriptions_churned: number;
  conversion_rate: number;
  churn_rate: number;
}> {
  // Get trial starts
  const trialsStarted = await db
    .prepare(
      `SELECT COUNT(*) as count
       FROM analytics_events
       WHERE app_id = ?
         AND event_type = 'trial_started'
         AND event_date >= ?
         AND event_date <= ?`
    )
    .bind(appId, startDate, endDate)
    .first<{ count: number }>();

  // Get trial conversions
  const trialsConverted = await db
    .prepare(
      `SELECT COUNT(*) as count
       FROM analytics_events
       WHERE app_id = ?
         AND event_type = 'trial_converted'
         AND event_date >= ?
         AND event_date <= ?`
    )
    .bind(appId, startDate, endDate)
    .first<{ count: number }>();

  // Get active subscriptions
  const activeSubscriptions = await getActiveSubscribersCount(db, appId);

  // Get churned subscriptions
  const churned = await db
    .prepare(
      `SELECT COUNT(*) as count
       FROM analytics_events
       WHERE app_id = ?
         AND event_type IN ('cancellation', 'expiration')
         AND event_date >= ?
         AND event_date <= ?`
    )
    .bind(appId, startDate, endDate)
    .first<{ count: number }>();

  const trials = trialsStarted?.count || 0;
  const converted = trialsConverted?.count || 0;
  const churnedCount = churned?.count || 0;

  return {
    trials_started: trials,
    trials_converted: converted,
    subscriptions_active: activeSubscriptions,
    subscriptions_churned: churnedCount,
    conversion_rate: trials > 0 ? Math.round((converted / trials) * 10000) / 100 : 0,
    churn_rate:
      activeSubscriptions + churnedCount > 0
        ? Math.round((churnedCount / (activeSubscriptions + churnedCount)) * 10000) / 100
        : 0,
  };
}
