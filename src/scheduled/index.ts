/**
 * Scheduled Tasks Handler
 * Runs on Cloudflare Cron Triggers
 */

import type { Env } from '../types';
import { processWebhookRetries } from '../services/webhook-dispatcher';

/**
 * Main scheduled handler
 * Called by Cloudflare Cron Trigger
 */
export async function handleScheduled(
  _event: ScheduledEvent,
  env: Env
): Promise<void> {
  const startTime = Date.now();
  console.log(`[Scheduled] Starting cron job at ${new Date().toISOString()}`);

  try {
    // Run all scheduled tasks in parallel
    const results = await Promise.allSettled([
      processWebhookRetries(env.DB),
      expireGracePeriods(env.DB),
      expireTrials(env.DB),
      expireSubscriptions(env.DB),
      cleanupExpiredSessions(env.DB),
    ]);

    // Log results
    const taskNames = [
      'webhookRetries',
      'gracePeriods',
      'trials',
      'subscriptions',
      'sessions',
    ];

    results.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        console.log(`[Scheduled] ${taskNames[index]}: ${JSON.stringify(result.value)}`);
      } else {
        console.error(`[Scheduled] ${taskNames[index]} failed:`, result.reason);
      }
    });

    const duration = Date.now() - startTime;
    console.log(`[Scheduled] Completed in ${duration}ms`);
  } catch (error) {
    console.error('[Scheduled] Fatal error:', error);
    throw error;
  }
}

/**
 * Expire grace periods that have passed
 * Updates subscription status from 'grace_period' to 'expired'
 */
async function expireGracePeriods(db: D1Database): Promise<{ expired: number }> {
  const now = Date.now();

  // Find subscriptions to expire BEFORE updating
  const toExpire = await db
    .prepare(
      `SELECT id, app_id, subscriber_id, product_id, platform
       FROM subscriptions
       WHERE status = 'grace_period'
       AND grace_period_expires_at IS NOT NULL
       AND grace_period_expires_at < ?`
    )
    .bind(now)
    .all<{ id: string; app_id: string; subscriber_id: string; product_id: string; platform: string }>();

  const subs = toExpire.results || [];
  if (subs.length === 0) return { expired: 0 };

  // Update status
  await db
    .prepare(
      `UPDATE subscriptions
       SET status = 'expired', updated_at = ?
       WHERE status = 'grace_period'
       AND grace_period_expires_at IS NOT NULL
       AND grace_period_expires_at < ?`
    )
    .bind(now, now)
    .run();

  // Log analytics events for the pre-fetched subscriptions
  for (const sub of subs) {
    await db
      .prepare(
        `INSERT INTO analytics_events (id, app_id, subscriber_id, event_type, event_date, product_id, platform, created_at)
         VALUES (?, ?, ?, 'grace_period_expired', ?, ?, ?, ?)`
      )
      .bind(
        crypto.randomUUID(),
        sub.app_id,
        sub.subscriber_id,
        now,
        sub.product_id,
        sub.platform,
        now
      )
      .run();
  }

  return { expired: subs.length };
}

/**
 * Expire trials that have ended
 * Updates subscription status and logs conversion or expiration
 */
async function expireTrials(db: D1Database): Promise<{ expired: number; converted: number }> {
  const now = Date.now();

  // Find expired trials
  const expiredTrials = await db
    .prepare(
      `SELECT id, app_id, subscriber_id, product_id, platform, will_renew
       FROM subscriptions
       WHERE is_trial = 1
       AND status = 'active'
       AND expires_at IS NOT NULL
       AND expires_at < ?`
    )
    .bind(now)
    .all<{
      id: string;
      app_id: string;
      subscriber_id: string;
      product_id: string;
      platform: string;
      will_renew: number;
    }>();

  let expired = 0;
  let converted = 0;

  for (const trial of expiredTrials.results || []) {
    if (trial.will_renew) {
      // Trial converted to paid - update is_trial flag
      await db
        .prepare(
          `UPDATE subscriptions SET is_trial = 0, updated_at = ? WHERE id = ?`
        )
        .bind(now, trial.id)
        .run();

      await db
        .prepare(
          `INSERT INTO analytics_events (id, app_id, subscriber_id, event_type, event_date, product_id, platform, created_at)
           VALUES (?, ?, ?, 'trial_converted', ?, ?, ?, ?)`
        )
        .bind(
          crypto.randomUUID(),
          trial.app_id,
          trial.subscriber_id,
          now,
          trial.product_id,
          trial.platform,
          now
        )
        .run();

      converted++;
    } else {
      // Trial expired without conversion
      await db
        .prepare(
          `UPDATE subscriptions SET status = 'expired', is_trial = 0, updated_at = ? WHERE id = ?`
        )
        .bind(now, trial.id)
        .run();

      await db
        .prepare(
          `INSERT INTO analytics_events (id, app_id, subscriber_id, event_type, event_date, product_id, platform, created_at)
           VALUES (?, ?, ?, 'expiration', ?, ?, ?, ?)`
        )
        .bind(
          crypto.randomUUID(),
          trial.app_id,
          trial.subscriber_id,
          now,
          trial.product_id,
          trial.platform,
          now
        )
        .run();

      expired++;
    }
  }

  return { expired, converted };
}

/**
 * Expire subscriptions that have passed their expiration date
 * Only for subscriptions that won't renew
 */
async function expireSubscriptions(db: D1Database): Promise<{ expired: number }> {
  const now = Date.now();

  // Find subscriptions to expire BEFORE updating
  const toExpire = await db
    .prepare(
      `SELECT id, app_id, subscriber_id, product_id, platform
       FROM subscriptions
       WHERE status = 'active'
       AND will_renew = 0
       AND expires_at IS NOT NULL
       AND expires_at < ?`
    )
    .bind(now)
    .all<{ id: string; app_id: string; subscriber_id: string; product_id: string; platform: string }>();

  const subs = toExpire.results || [];
  if (subs.length === 0) return { expired: 0 };

  // Update status
  await db
    .prepare(
      `UPDATE subscriptions
       SET status = 'expired', updated_at = ?
       WHERE status = 'active'
       AND will_renew = 0
       AND expires_at IS NOT NULL
       AND expires_at < ?`
    )
    .bind(now, now)
    .run();

  // Log analytics events for the pre-fetched subscriptions
  for (const sub of subs) {
    await db
      .prepare(
        `INSERT INTO analytics_events (id, app_id, subscriber_id, event_type, event_date, product_id, platform, created_at)
         VALUES (?, ?, ?, 'expiration', ?, ?, ?, ?)`
      )
      .bind(
        crypto.randomUUID(),
        sub.app_id,
        sub.subscriber_id,
        now,
        sub.product_id,
        sub.platform,
        now
      )
      .run();
  }

  return { expired: subs.length };
}

/**
 * Cleanup expired admin sessions
 */
async function cleanupExpiredSessions(db: D1Database): Promise<{ deleted: number }> {
  const now = Date.now();

  const result = await db
    .prepare('DELETE FROM admin_sessions WHERE expires_at < ?')
    .bind(now)
    .run();

  return { deleted: result.meta.changes || 0 };
}
