/**
 * Apple App Store Server API JWT Generation
 * Uses ES256 (ECDSA P-256 SHA-256) algorithm
 */

import { createJWT, importES256PrivateKey } from '../../utils/crypto';
import { nowSeconds } from '../../utils/time';
import type { AppleConfig } from './types';

// JWT cache
let cachedToken: { token: string; expiresAt: number } | null = null;

/**
 * Create JWT for App Store Server API authentication
 */
export async function createAppleJWT(config: AppleConfig): Promise<string> {
  const now = nowSeconds();

  // Return cached token if valid (with 5 minute buffer)
  if (cachedToken && cachedToken.expiresAt > now + 300) {
    return cachedToken.token;
  }

  const header = {
    alg: 'ES256',
    kid: config.keyId,
    typ: 'JWT',
  };

  const expiresAt = now + 3600; // 1 hour

  const payload = {
    iss: config.issuerId,
    iat: now,
    exp: expiresAt,
    aud: 'appstoreconnect-v1',
    bid: config.bundleId,
  };

  // Import private key
  const privateKey = await importES256PrivateKey(config.privateKey);

  // Create JWT
  const token = await createJWT(header, payload, privateKey, 'ES256');

  // Cache token
  cachedToken = { token, expiresAt };

  return token;
}

/**
 * Clear JWT cache (useful for testing or key rotation)
 */
export function clearAppleJWTCache(): void {
  cachedToken = null;
}

/**
 * Parse Apple's signed data (JWS format)
 * Returns decoded payload without verification (verification should be done separately)
 */
export function decodeAppleSignedData<T>(signedData: string): T {
  const [, payloadB64] = signedData.split('.');

  if (!payloadB64) {
    throw new Error('Invalid signed data format');
  }

  // Decode base64url
  let base64 = payloadB64.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4) {
    base64 += '=';
  }

  const json = atob(base64);
  return JSON.parse(json) as T;
}
