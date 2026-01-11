/**
 * Authentication middleware
 * Validates API keys and sets app context
 */

import { Context, Next } from 'hono';
import { getAppByApiKey } from '../db/queries';
import type { Env, App } from '../types';

// Extend Hono context with app
declare module 'hono' {
  interface ContextVariableMap {
    app: App;
  }
}

/**
 * API Key authentication middleware
 * Expects X-API-Key header
 */
export async function authMiddleware(
  c: Context<{ Bindings: Env }>,
  next: Next
): Promise<Response | void> {
  const apiKey = c.req.header('X-API-Key');

  if (!apiKey) {
    return c.json(
      {
        error: {
          code: 'missing_api_key',
          message: 'X-API-Key header is required',
        },
      },
      401
    );
  }

  // Validate API key format
  if (!apiKey.startsWith('pk_live_') && !apiKey.startsWith('pk_test_')) {
    return c.json(
      {
        error: {
          code: 'invalid_api_key',
          message: 'Invalid API key format',
        },
      },
      401
    );
  }

  // Look up app by API key
  const app = await getAppByApiKey(c.env.DB, apiKey);

  if (!app) {
    return c.json(
      {
        error: {
          code: 'invalid_api_key',
          message: 'Invalid API key',
        },
      },
      401
    );
  }

  // Set app in context
  c.set('app', app);

  await next();
}

/**
 * Optional auth middleware for public endpoints
 * Sets app if API key is provided, but doesn't require it
 */
export async function optionalAuthMiddleware(
  c: Context<{ Bindings: Env }>,
  next: Next
) {
  const apiKey = c.req.header('X-API-Key');

  if (apiKey) {
    const app = await getAppByApiKey(c.env.DB, apiKey);
    if (app) {
      c.set('app', app);
    }
  }

  await next();
}

/**
 * Check if request is in sandbox mode
 */
export function isSandbox(c: Context): boolean {
  const apiKey = c.req.header('X-API-Key');
  return apiKey?.startsWith('pk_test_') || false;
}
