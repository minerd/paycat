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
 * Verify admin password using PBKDF2
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

  const isValid = await verifyPassword(password, user.password_hash);
  if (isValid) {
    return { id: user.id, email: user.email };
  }

  return null;
}

/**
 * Hash password for storage using PBKDF2
 * Format: iterations:salt:hash (all base64 encoded)
 */
export async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder();
  const iterations = 100000;

  // Generate random salt
  const salt = new Uint8Array(16);
  crypto.getRandomValues(salt);

  // Import password as key
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveBits']
  );

  // Derive key using PBKDF2
  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: salt,
      iterations: iterations,
      hash: 'SHA-256',
    },
    keyMaterial,
    256
  );

  // Encode as base64
  const saltB64 = btoa(String.fromCharCode(...salt));
  const hashB64 = btoa(String.fromCharCode(...new Uint8Array(derivedBits)));

  return `${iterations}:${saltB64}:${hashB64}`;
}

/**
 * Verify password against stored hash
 */
async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  const encoder = new TextEncoder();

  // Check if it's the old SHA-256 format (no colons) for backward compatibility
  if (!storedHash.includes(':')) {
    const data = encoder.encode(password);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
    return hashHex === storedHash;
  }

  // Parse PBKDF2 format
  const parts = storedHash.split(':');
  if (parts.length !== 3) return false;

  const iterations = parseInt(parts[0], 10);
  const salt = Uint8Array.from(atob(parts[1]), (c) => c.charCodeAt(0));
  const storedHashBytes = Uint8Array.from(atob(parts[2]), (c) => c.charCodeAt(0));

  // Import password as key
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveBits']
  );

  // Derive key
  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: salt,
      iterations: iterations,
      hash: 'SHA-256',
    },
    keyMaterial,
    256
  );

  const derivedBytes = new Uint8Array(derivedBits);

  // Constant-time comparison
  if (derivedBytes.length !== storedHashBytes.length) return false;

  let result = 0;
  for (let i = 0; i < derivedBytes.length; i++) {
    result |= derivedBytes[i] ^ storedHashBytes[i];
  }

  return result === 0;
}
