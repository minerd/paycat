/**
 * Cryptographic utilities using Web Crypto API
 * Compatible with Cloudflare Workers
 */

/**
 * Base64 URL encode (no padding)
 */
export function base64UrlEncode(data: ArrayBuffer | Uint8Array | string): string {
  let bytes: Uint8Array;
  if (typeof data === 'string') {
    bytes = new TextEncoder().encode(data);
  } else if (data instanceof ArrayBuffer) {
    bytes = new Uint8Array(data);
  } else {
    bytes = data;
  }

  const base64 = btoa(String.fromCharCode(...bytes));
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

/**
 * Base64 URL decode
 */
export function base64UrlDecode(str: string): Uint8Array {
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4) {
    base64 += '=';
  }
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

/**
 * Import PKCS8 private key for ES256 signing
 */
export async function importES256PrivateKey(pem: string): Promise<CryptoKey> {
  // Remove PEM headers and decode
  const pemContents = pem
    .replace(/-----BEGIN PRIVATE KEY-----/g, '')
    .replace(/-----END PRIVATE KEY-----/g, '')
    .replace(/\s/g, '');

  const binaryDer = base64UrlDecode(pemContents.replace(/\+/g, '-').replace(/\//g, '_'));

  return crypto.subtle.importKey(
    'pkcs8',
    binaryDer,
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign']
  );
}

/**
 * Import RS256 private key (for Google Service Account)
 */
export async function importRS256PrivateKey(pem: string): Promise<CryptoKey> {
  const pemContents = pem
    .replace(/-----BEGIN PRIVATE KEY-----/g, '')
    .replace(/-----END PRIVATE KEY-----/g, '')
    .replace(/-----BEGIN RSA PRIVATE KEY-----/g, '')
    .replace(/-----END RSA PRIVATE KEY-----/g, '')
    .replace(/\s/g, '');

  const binaryString = atob(pemContents);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }

  return crypto.subtle.importKey(
    'pkcs8',
    bytes,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  );
}

/**
 * Sign data with ES256 (ECDSA P-256 SHA-256)
 */
export async function signES256(data: string, privateKey: CryptoKey): Promise<string> {
  const encoder = new TextEncoder();
  const signature = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    privateKey,
    encoder.encode(data)
  );

  // Convert from DER to raw format (r || s)
  const signatureBytes = new Uint8Array(signature);
  const rawSignature = derToRaw(signatureBytes);

  return base64UrlEncode(rawSignature);
}

/**
 * Sign data with RS256 (RSA SHA-256)
 */
export async function signRS256(data: string, privateKey: CryptoKey): Promise<string> {
  const encoder = new TextEncoder();
  const signature = await crypto.subtle.sign(
    { name: 'RSASSA-PKCS1-v1_5' },
    privateKey,
    encoder.encode(data)
  );

  return base64UrlEncode(signature);
}

/**
 * Convert DER encoded ECDSA signature to raw format
 */
function derToRaw(der: Uint8Array): Uint8Array {
  // DER format: 0x30 [total-length] 0x02 [r-length] [r] 0x02 [s-length] [s]
  if (der[0] !== 0x30) {
    // Already in raw format
    return der;
  }

  let offset = 2;

  // Parse r
  if (der[offset] !== 0x02) throw new Error('Invalid DER signature');
  offset++;
  const rLength = der[offset];
  offset++;
  let r = der.slice(offset, offset + rLength);
  offset += rLength;

  // Parse s
  if (der[offset] !== 0x02) throw new Error('Invalid DER signature');
  offset++;
  const sLength = der[offset];
  offset++;
  let s = der.slice(offset, offset + sLength);

  // Normalize r and s to 32 bytes each
  if (r.length > 32) r = r.slice(r.length - 32);
  if (s.length > 32) s = s.slice(s.length - 32);

  const rawSignature = new Uint8Array(64);
  rawSignature.set(r, 32 - r.length);
  rawSignature.set(s, 64 - s.length);

  return rawSignature;
}

/**
 * Create HMAC-SHA256 signature
 */
export async function hmacSha256(
  key: string | Uint8Array,
  data: string
): Promise<string> {
  const encoder = new TextEncoder();
  const keyData = typeof key === 'string' ? encoder.encode(key) : key;

  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const signature = await crypto.subtle.sign(
    'HMAC',
    cryptoKey,
    encoder.encode(data)
  );

  return Array.from(new Uint8Array(signature))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Verify HMAC-SHA256 signature
 */
export async function verifyHmacSha256(
  key: string | Uint8Array,
  data: string,
  signature: string
): Promise<boolean> {
  const computed = await hmacSha256(key, data);

  // Constant-time comparison
  if (computed.length !== signature.length) return false;

  let result = 0;
  for (let i = 0; i < computed.length; i++) {
    result |= computed.charCodeAt(i) ^ signature.charCodeAt(i);
  }

  return result === 0;
}

/**
 * SHA256 hash
 */
export async function sha256(data: string): Promise<string> {
  const encoder = new TextEncoder();
  const hash = await crypto.subtle.digest('SHA-256', encoder.encode(data));

  return Array.from(new Uint8Array(hash))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Create a JWT
 */
export async function createJWT(
  header: Record<string, unknown>,
  payload: Record<string, unknown>,
  privateKey: CryptoKey,
  algorithm: 'ES256' | 'RS256'
): Promise<string> {
  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signingInput = `${encodedHeader}.${encodedPayload}`;

  let signature: string;
  if (algorithm === 'ES256') {
    signature = await signES256(signingInput, privateKey);
  } else {
    signature = await signRS256(signingInput, privateKey);
  }

  return `${signingInput}.${signature}`;
}

/**
 * Decode JWT without verification (for reading claims)
 */
export function decodeJWT<T = Record<string, unknown>>(token: string): {
  header: Record<string, unknown>;
  payload: T;
} {
  const [headerB64, payloadB64] = token.split('.');

  const headerJson = new TextDecoder().decode(base64UrlDecode(headerB64));
  const payloadJson = new TextDecoder().decode(base64UrlDecode(payloadB64));

  return {
    header: JSON.parse(headerJson),
    payload: JSON.parse(payloadJson) as T,
  };
}
