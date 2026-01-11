/**
 * Admin Authentication Middleware
 * Uses a separate admin secret for dashboard access
 */

import { Context, Next } from 'hono';
import type { Env } from '../types';

/**
 * Admin authentication middleware
 * Checks for X-Admin-Key header or admin session
 */
export async function adminAuthMiddleware(
  c: Context<{ Bindings: Env }>,
  next: Next
): Promise<Response | void> {
  const adminKey = c.req.header('X-Admin-Key');
  const authHeader = c.req.header('Authorization');

  // Check admin key header
  if (adminKey) {
    const isValid = await validateAdminKey(c.env.DB, adminKey);
    if (isValid) {
      return next();
    }
  }

  // Check Bearer token (for frontend sessions)
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice(7);
    const session = await validateAdminSession(c.env.DB, token);
    if (session) {
      c.set('adminUser', session);
      return next();
    }
  }

  return c.json(
    {
      error: {
        code: 'unauthorized',
        message: 'Admin authentication required',
      },
    },
    401
  );
}

/**
 * Validate admin API key
 */
async function validateAdminKey(db: D1Database, key: string): Promise<boolean> {
  const result = await db
    .prepare('SELECT id FROM admin_users WHERE api_key = ? AND active = 1')
    .bind(key)
    .first();
  return !!result;
}

/**
 * Validate admin session token
 */
async function validateAdminSession(
  db: D1Database,
  token: string
): Promise<{ id: string; email: string } | null> {
  const result = await db
    .prepare(
      `SELECT au.id, au.email
       FROM admin_sessions s
       JOIN admin_users au ON au.id = s.admin_user_id
       WHERE s.token = ? AND s.expires_at > ? AND au.active = 1`
    )
    .bind(token, Date.now())
    .first<{ id: string; email: string }>();
  return result || null;
}

/**
 * Create admin session after login
 */
export async function createAdminSession(
  db: D1Database,
  adminUserId: string
): Promise<string> {
  const token = crypto.randomUUID() + '-' + crypto.randomUUID();
  const expiresAt = Date.now() + 24 * 60 * 60 * 1000; // 24 hours

  await db
    .prepare(
      'INSERT INTO admin_sessions (id, admin_user_id, token, expires_at, created_at) VALUES (?, ?, ?, ?, ?)'
    )
    .bind(crypto.randomUUID(), adminUserId, token, expiresAt, Date.now())
    .run();

  return token;
}

/**
 * Verify admin password
 */
export async function verifyAdminPassword(
  db: D1Database,
  email: string,
  password: string
): Promise<{ id: string; email: string } | null> {
  const user = await db
    .prepare('SELECT id, email, password_hash FROM admin_users WHERE email = ? AND active = 1')
    .bind(email)
    .first<{ id: string; email: string; password_hash: string }>();

  if (!user) return null;

  // Simple password comparison (in production, use bcrypt or similar)
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');

  if (hashHex === user.password_hash) {
    return { id: user.id, email: user.email };
  }

  return null;
}

/**
 * Hash password for storage
 */
export async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}
