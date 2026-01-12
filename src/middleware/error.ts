/**
 * Error handling middleware and utilities
 */

import { Context, Next } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { Env } from '../types';

// Custom error codes
export type ErrorCode =
  | 'bad_request'
  | 'unauthorized'
  | 'forbidden'
  | 'not_found'
  | 'validation_error'
  | 'platform_error'
  | 'receipt_invalid'
  | 'subscription_not_found'
  | 'subscriber_not_found'
  | 'configuration_error'
  | 'rate_limited'
  | 'internal_error';

export interface ApiError {
  code: ErrorCode;
  message: string;
  details?: Record<string, unknown>;
}

/**
 * Custom API error class
 */
export class MRRCatError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
    public readonly status: number = 400,
    public readonly details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'MRRCatError';
  }

  toJSON(): { error: ApiError } {
    return {
      error: {
        code: this.code,
        message: this.message,
        ...(this.details && { details: this.details }),
      },
    };
  }
}

/**
 * Error handler middleware
 */
export async function errorMiddleware(
  c: Context<{ Bindings: Env }>,
  next: Next
): Promise<Response | void> {
  try {
    await next();
  } catch (err) {
    // Check if it's a MRRCatError by name (safer than instanceof for bundled code)
    if (err instanceof Error && err.name === 'MRRCatError' && 'code' in err && 'status' in err && 'toJSON' in err) {
      const payCatErr = err as MRRCatError;
      const status = payCatErr.status as 200 | 400 | 401 | 403 | 404 | 429 | 500 | 502;
      return c.json(payCatErr.toJSON(), status);
    }

    // Handle Hono HTTPException
    if (err instanceof HTTPException) {
      return c.json(
        {
          error: {
            code: 'internal_error',
            message: err.message,
          },
        },
        err.status
      );
    }

    // Log unexpected errors
    console.error('Unexpected error:', err);

    // Return generic error
    return c.json(
      {
        error: {
          code: 'internal_error',
          message: 'An unexpected error occurred',
        },
      },
      500
    );
  }
}

// Convenience error creators
export const Errors = {
  badRequest: (message: string, details?: Record<string, unknown>) =>
    new MRRCatError('bad_request', message, 400, details),

  unauthorized: (message = 'Unauthorized') =>
    new MRRCatError('unauthorized', message, 401),

  forbidden: (message = 'Forbidden') =>
    new MRRCatError('forbidden', message, 403),

  notFound: (resource: string) =>
    new MRRCatError('not_found', `${resource} not found`, 404),

  validationError: (message: string, details?: Record<string, unknown>) =>
    new MRRCatError('validation_error', message, 400, details),

  platformError: (platform: string, message: string, details?: Record<string, unknown>) =>
    new MRRCatError('platform_error', `${platform}: ${message}`, 502, details),

  receiptInvalid: (message: string) =>
    new MRRCatError('receipt_invalid', message, 400),

  subscriptionNotFound: () =>
    new MRRCatError('subscription_not_found', 'Subscription not found', 404),

  subscriberNotFound: () =>
    new MRRCatError('subscriber_not_found', 'Subscriber not found', 404),

  configurationError: (message: string) =>
    new MRRCatError('configuration_error', message, 500),

  rateLimited: () =>
    new MRRCatError('rate_limited', 'Rate limit exceeded', 429),

  internal: (message = 'Internal server error') =>
    new MRRCatError('internal_error', message, 500),
};
