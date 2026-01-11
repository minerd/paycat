/**
 * Google OAuth2 Service Account Authentication
 * Uses RS256 (RSA SHA-256) for JWT signing
 */

import { createJWT, importRS256PrivateKey } from '../../utils/crypto';
import { nowSeconds } from '../../utils/time';
import type { GoogleConfig, GoogleOAuthTokenResponse } from './types';

// Token cache
let cachedToken: { token: string; expiresAt: number } | null = null;

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const ANDROID_PUBLISHER_SCOPE = 'https://www.googleapis.com/auth/androidpublisher';

/**
 * Create JWT for Google Service Account authentication
 */
async function createServiceAccountJWT(config: GoogleConfig): Promise<string> {
  const now = nowSeconds();
  const expiresAt = now + 3600; // 1 hour

  const header = {
    alg: 'RS256',
    typ: 'JWT',
  };

  const payload = {
    iss: config.serviceAccountEmail,
    sub: config.serviceAccountEmail,
    aud: GOOGLE_TOKEN_URL,
    iat: now,
    exp: expiresAt,
    scope: ANDROID_PUBLISHER_SCOPE,
  };

  const privateKey = await importRS256PrivateKey(config.serviceAccountPrivateKey);
  return createJWT(header, payload, privateKey, 'RS256');
}

/**
 * Get OAuth2 access token for Google APIs
 */
export async function getGoogleAccessToken(config: GoogleConfig): Promise<string> {
  const now = nowSeconds();

  // Return cached token if valid (with 5 minute buffer)
  if (cachedToken && cachedToken.expiresAt > now + 300) {
    return cachedToken.token;
  }

  // Create JWT assertion
  const assertion = await createServiceAccountJWT(config);

  // Exchange JWT for access token
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to get Google access token: ${error}`);
  }

  const tokenResponse = (await response.json()) as GoogleOAuthTokenResponse;

  // Cache token
  cachedToken = {
    token: tokenResponse.access_token,
    expiresAt: now + tokenResponse.expires_in,
  };

  return tokenResponse.access_token;
}

/**
 * Clear token cache (useful for testing or key rotation)
 */
export function clearGoogleTokenCache(): void {
  cachedToken = null;
}
