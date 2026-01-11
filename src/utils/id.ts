/**
 * UUID and ID generation utilities
 * Uses Web Crypto API for Cloudflare Workers compatibility
 */

/**
 * Generate a UUID v4
 */
export function generateId(): string {
  return crypto.randomUUID();
}

/**
 * Generate a prefixed ID (e.g., sub_xxx, txn_xxx)
 */
export function generatePrefixedId(prefix: string): string {
  const uuid = crypto.randomUUID().replace(/-/g, '');
  return `${prefix}_${uuid}`;
}

/**
 * Generate an API key
 */
export function generateApiKey(prefix: 'pk_live' | 'pk_test' = 'pk_live'): string {
  const randomBytes = new Uint8Array(24);
  crypto.getRandomValues(randomBytes);
  const base64 = btoa(String.fromCharCode(...randomBytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
  return `${prefix}_${base64}`;
}

/**
 * Generate a webhook secret
 */
export function generateWebhookSecret(): string {
  const randomBytes = new Uint8Array(32);
  crypto.getRandomValues(randomBytes);
  return Array.from(randomBytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}
