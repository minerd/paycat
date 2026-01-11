/**
 * Time and date utilities
 */

/**
 * Get current timestamp in milliseconds
 */
export function now(): number {
  return Date.now();
}

/**
 * Get current timestamp in seconds (Unix timestamp)
 */
export function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

/**
 * Convert milliseconds to ISO string
 */
export function toISOString(ms: number): string {
  return new Date(ms).toISOString();
}

/**
 * Convert seconds to ISO string
 */
export function secondsToISOString(seconds: number): string {
  return new Date(seconds * 1000).toISOString();
}

/**
 * Parse ISO string to milliseconds
 */
export function parseISO(isoString: string): number {
  return new Date(isoString).getTime();
}

/**
 * Check if a timestamp (in ms) has expired
 */
export function isExpired(expiresAt: number | null): boolean {
  if (expiresAt === null) return false;
  return Date.now() > expiresAt;
}

/**
 * Check if timestamp is within grace period
 */
export function isInGracePeriod(
  expiresAt: number | null,
  gracePeriodExpiresAt: number | null
): boolean {
  if (expiresAt === null || gracePeriodExpiresAt === null) return false;
  const now = Date.now();
  return now > expiresAt && now <= gracePeriodExpiresAt;
}

/**
 * Add days to a timestamp
 */
export function addDays(timestamp: number, days: number): number {
  return timestamp + days * 24 * 60 * 60 * 1000;
}

/**
 * Get start of day (midnight UTC)
 */
export function startOfDay(timestamp: number): number {
  const date = new Date(timestamp);
  date.setUTCHours(0, 0, 0, 0);
  return date.getTime();
}

/**
 * Get start of month (first day midnight UTC)
 */
export function startOfMonth(timestamp: number): number {
  const date = new Date(timestamp);
  date.setUTCDate(1);
  date.setUTCHours(0, 0, 0, 0);
  return date.getTime();
}

/**
 * Calculate days between two timestamps
 */
export function daysBetween(start: number, end: number): number {
  return Math.floor((end - start) / (24 * 60 * 60 * 1000));
}
