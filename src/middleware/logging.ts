/**
 * Request logging middleware
 */

import { Context, Next } from 'hono';
import type { Env } from '../types';

interface LogEntry {
  timestamp: string;
  method: string;
  path: string;
  status: number;
  duration: number;
  appId?: string;
  userAgent?: string;
  error?: string;
}

/**
 * Logging middleware
 * Logs request details and timing
 */
export async function loggingMiddleware(
  c: Context<{ Bindings: Env }>,
  next: Next
) {
  const start = Date.now();
  const method = c.req.method;
  const path = c.req.path;

  let error: string | undefined;

  try {
    await next();
  } catch (err) {
    error = err instanceof Error ? err.message : 'Unknown error';
    throw err;
  } finally {
    const duration = Date.now() - start;
    const status = c.res.status;

    const logEntry: LogEntry = {
      timestamp: new Date().toISOString(),
      method,
      path,
      status,
      duration,
      userAgent: c.req.header('User-Agent'),
    };

    // Add app ID if authenticated
    try {
      const app = c.get('app');
      if (app) {
        logEntry.appId = app.id;
      }
    } catch {
      // App not set, skip
    }

    if (error) {
      logEntry.error = error;
    }

    // Log based on status
    if (status >= 500) {
      console.error(JSON.stringify(logEntry));
    } else if (status >= 400) {
      console.warn(JSON.stringify(logEntry));
    } else {
      console.log(JSON.stringify(logEntry));
    }
  }
}

/**
 * Get client IP from Cloudflare headers
 */
export function getClientIP(c: Context): string {
  return (
    c.req.header('CF-Connecting-IP') ||
    c.req.header('X-Forwarded-For')?.split(',')[0] ||
    'unknown'
  );
}

/**
 * Get country from Cloudflare headers
 */
export function getCountry(c: Context): string | undefined {
  return c.req.header('CF-IPCountry');
}
