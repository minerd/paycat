/**
 * Rate Limiting Middleware
 * Uses Cloudflare KV for distributed rate limiting
 */

import { Context, Next } from 'hono';
import type { Env } from '../types';
import { Errors } from './error';

interface RateLimitConfig {
  windowMs: number;      // Time window in milliseconds
  maxRequests: number;   // Max requests per window
  keyPrefix?: string;    // Prefix for KV keys
}

const DEFAULT_CONFIG: RateLimitConfig = {
  windowMs: 60 * 1000,  // 1 minute
  maxRequests: 100,     // 100 requests per minute
  keyPrefix: 'ratelimit',
};

// Different limits for different endpoints
const ENDPOINT_LIMITS: Record<string, RateLimitConfig> = {
  '/v1/receipts': {
    windowMs: 60 * 1000,
    maxRequests: 30,  // Receipt verification is expensive
    keyPrefix: 'rl_receipts',
  },
  '/admin/login': {
    windowMs: 15 * 60 * 1000,  // 15 minutes
    maxRequests: 10,           // Prevent brute force
    keyPrefix: 'rl_login',
  },
  '/admin/setup': {
    windowMs: 60 * 60 * 1000,  // 1 hour
    maxRequests: 5,            // Very limited
    keyPrefix: 'rl_setup',
  },
};

/**
 * Get client identifier for rate limiting
 */
function getClientKey(c: Context<{ Bindings: Env }>): string {
  // Try to get API key first (for authenticated requests)
  const apiKey = c.req.header('X-API-Key');
  if (apiKey) {
    return `api:${apiKey.slice(0, 16)}`;
  }

  // Fall back to IP address
  const ip = c.req.header('CF-Connecting-IP') ||
             c.req.header('X-Forwarded-For')?.split(',')[0] ||
             'unknown';
  return `ip:${ip}`;
}

/**
 * Get rate limit config for the current path
 */
function getConfigForPath(path: string): RateLimitConfig {
  for (const [pattern, config] of Object.entries(ENDPOINT_LIMITS)) {
    if (path.startsWith(pattern)) {
      return config;
    }
  }
  return DEFAULT_CONFIG;
}

/**
 * Rate limit middleware
 */
export async function rateLimitMiddleware(
  c: Context<{ Bindings: Env }>,
  next: Next
): Promise<Response | void> {
  const path = new URL(c.req.url).pathname;
  const config = getConfigForPath(path);
  const clientKey = getClientKey(c);

  // Create a unique key for this client + endpoint combo
  const now = Date.now();
  const windowStart = Math.floor(now / config.windowMs) * config.windowMs;
  const kvKey = `${config.keyPrefix}:${clientKey}:${windowStart}`;

  try {
    // Get current count from KV
    const currentCountStr = await c.env.CACHE.get(kvKey);
    const currentCount = currentCountStr ? parseInt(currentCountStr, 10) : 0;

    // Check if over limit
    if (currentCount >= config.maxRequests) {
      const resetTime = windowStart + config.windowMs;
      const retryAfter = Math.ceil((resetTime - now) / 1000);

      c.header('X-RateLimit-Limit', config.maxRequests.toString());
      c.header('X-RateLimit-Remaining', '0');
      c.header('X-RateLimit-Reset', Math.ceil(resetTime / 1000).toString());
      c.header('Retry-After', retryAfter.toString());

      throw Errors.rateLimited();
    }

    // Increment counter
    const newCount = currentCount + 1;
    const ttl = Math.ceil(config.windowMs / 1000);
    await c.env.CACHE.put(kvKey, newCount.toString(), { expirationTtl: ttl });

    // Set rate limit headers
    c.header('X-RateLimit-Limit', config.maxRequests.toString());
    c.header('X-RateLimit-Remaining', (config.maxRequests - newCount).toString());
    c.header('X-RateLimit-Reset', Math.ceil((windowStart + config.windowMs) / 1000).toString());

    return next();
  } catch (err) {
    // If KV fails, allow the request but log it
    if (err instanceof Error && err.name !== 'PayCatError') {
      console.error('Rate limit KV error:', err);
      return next();
    }
    throw err;
  }
}

/**
 * Strict rate limit for sensitive endpoints
 * Blocks instead of allowing on KV failure
 */
export async function strictRateLimitMiddleware(
  c: Context<{ Bindings: Env }>,
  next: Next
): Promise<Response | void> {
  const path = new URL(c.req.url).pathname;
  const config = getConfigForPath(path);
  const clientKey = getClientKey(c);

  const now = Date.now();
  const windowStart = Math.floor(now / config.windowMs) * config.windowMs;
  const kvKey = `${config.keyPrefix}:${clientKey}:${windowStart}`;

  // Get current count from KV
  const currentCountStr = await c.env.CACHE.get(kvKey);
  const currentCount = currentCountStr ? parseInt(currentCountStr, 10) : 0;

  // Check if over limit
  if (currentCount >= config.maxRequests) {
    const resetTime = windowStart + config.windowMs;
    const retryAfter = Math.ceil((resetTime - now) / 1000);

    c.header('X-RateLimit-Limit', config.maxRequests.toString());
    c.header('X-RateLimit-Remaining', '0');
    c.header('X-RateLimit-Reset', Math.ceil(resetTime / 1000).toString());
    c.header('Retry-After', retryAfter.toString());

    throw Errors.rateLimited();
  }

  // Increment counter
  const newCount = currentCount + 1;
  const ttl = Math.ceil(config.windowMs / 1000);
  await c.env.CACHE.put(kvKey, newCount.toString(), { expirationTtl: ttl });

  // Set rate limit headers
  c.header('X-RateLimit-Limit', config.maxRequests.toString());
  c.header('X-RateLimit-Remaining', (config.maxRequests - newCount).toString());
  c.header('X-RateLimit-Reset', Math.ceil((windowStart + config.windowMs) / 1000).toString());

  return next();
}
