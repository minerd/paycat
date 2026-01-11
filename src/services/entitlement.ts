/**
 * Entitlement Calculation Service
 * Determines user access based on active subscriptions
 */

import type {
  Subscription,
  EntitlementInfo,
  SubscriptionInfo,
  Platform,
} from '../types';
import {
  getSubscriptionsBySubscriberId,
  getEntitlementDefinitions,
  getProductEntitlements,
} from '../db/queries';
import { toISOString, isExpired, isInGracePeriod } from '../utils/time';

export interface CalculatedEntitlements {
  subscriptions: Record<string, SubscriptionInfo>;
  entitlements: Record<string, EntitlementInfo>;
}

/**
 * Calculate entitlements for a subscriber
 */
export async function calculateEntitlements(
  db: D1Database,
  subscriberId: string,
  appId: string
): Promise<CalculatedEntitlements> {
  // Get all subscriptions for the subscriber
  const subscriptions = await getSubscriptionsBySubscriberId(db, subscriberId);

  // Get entitlement definitions and product mappings
  const entitlementDefs = await getEntitlementDefinitions(db, appId);
  const productMappings = await getProductEntitlements(db, appId);

  // Build subscriptions response
  const subscriptionInfos: Record<string, SubscriptionInfo> = {};

  for (const sub of subscriptions) {
    subscriptionInfos[sub.product_id] = {
      platform: sub.platform,
      product_id: sub.product_id,
      status: sub.status,
      purchase_date: toISOString(sub.purchase_date),
      expires_date: sub.expires_at ? toISOString(sub.expires_at) : null,
      is_sandbox: sub.is_sandbox,
      is_trial_period: sub.is_trial,
      will_renew: sub.will_renew,
      grace_period_expires_date: sub.grace_period_expires_at
        ? toISOString(sub.grace_period_expires_at)
        : null,
    };
  }

  // Calculate entitlements based on active subscriptions
  const entitlements: Record<string, EntitlementInfo> = {};

  // Create lookup for product → entitlement mapping
  const productToEntitlement = new Map<string, string[]>();
  for (const mapping of productMappings) {
    const key = `${mapping.product_id}:${mapping.platform}`;
    if (!productToEntitlement.has(key)) {
      productToEntitlement.set(key, []);
    }
    productToEntitlement.get(key)!.push(mapping.entitlement_id);
  }

  // Create entitlement ID to identifier lookup
  const entitlementIdToIdentifier = new Map<string, string>();
  for (const def of entitlementDefs) {
    entitlementIdToIdentifier.set(def.id, def.identifier);
  }

  // Process each subscription to determine entitlements
  for (const sub of subscriptions) {
    const isActive = isSubscriptionActive(sub);
    const key = `${sub.product_id}:${sub.platform}`;

    const entitlementIds = productToEntitlement.get(key) || [];

    for (const entitlementId of entitlementIds) {
      const identifier = entitlementIdToIdentifier.get(entitlementId);
      if (!identifier) continue;

      // Get or create entitlement entry
      if (!entitlements[identifier]) {
        entitlements[identifier] = {
          is_active: false,
          product_identifier: sub.product_id,
          expires_date: null,
        };
      }

      // Update if this subscription grants access
      if (isActive) {
        const existingEntitlement = entitlements[identifier];

        // If already active, prefer the one with later expiry
        if (existingEntitlement.is_active) {
          const existingExpiry = existingEntitlement.expires_date
            ? new Date(existingEntitlement.expires_date).getTime()
            : 0;
          const newExpiry = sub.expires_at || 0;

          if (newExpiry > existingExpiry) {
            entitlements[identifier] = {
              is_active: true,
              product_identifier: sub.product_id,
              expires_date: sub.expires_at ? toISOString(sub.expires_at) : null,
            };
          }
        } else {
          entitlements[identifier] = {
            is_active: true,
            product_identifier: sub.product_id,
            expires_date: sub.expires_at ? toISOString(sub.expires_at) : null,
          };
        }
      }
    }
  }

  // If no product mappings exist, create default entitlements from active subscriptions
  if (productMappings.length === 0) {
    for (const sub of subscriptions) {
      if (isSubscriptionActive(sub)) {
        // Use product_id as entitlement identifier
        entitlements[sub.product_id] = {
          is_active: true,
          product_identifier: sub.product_id,
          expires_date: sub.expires_at ? toISOString(sub.expires_at) : null,
        };
      }
    }
  }

  return {
    subscriptions: subscriptionInfos,
    entitlements,
  };
}

/**
 * Check if a subscription is currently active
 */
export function isSubscriptionActive(subscription: Subscription): boolean {
  // Check status
  if (
    subscription.status === 'expired' ||
    subscription.status === 'cancelled'
  ) {
    return false;
  }

  // Active, grace_period, billing_retry, paused are considered "active" for entitlements
  // (paused subscriptions typically still grant access)
  if (subscription.status === 'active' || subscription.status === 'grace_period') {
    // Verify expiry date
    if (subscription.expires_at) {
      // In grace period
      if (isInGracePeriod(subscription.expires_at, subscription.grace_period_expires_at)) {
        return true;
      }
      // Not expired
      if (!isExpired(subscription.expires_at)) {
        return true;
      }
      return false;
    }
    // No expiry date (lifetime or special)
    return true;
  }

  // Billing retry still grants access
  if (subscription.status === 'billing_retry') {
    if (subscription.grace_period_expires_at) {
      return !isExpired(subscription.grace_period_expires_at);
    }
    // Default: still active during billing retry
    return true;
  }

  // Paused subscription - check if grace period applies
  if (subscription.status === 'paused') {
    // Paused subscriptions typically don't grant access
    return false;
  }

  return false;
}

/**
 * Check if user has specific entitlement
 */
export async function hasEntitlement(
  db: D1Database,
  subscriberId: string,
  appId: string,
  entitlementIdentifier: string
): Promise<boolean> {
  const { entitlements } = await calculateEntitlements(db, subscriberId, appId);
  return entitlements[entitlementIdentifier]?.is_active ?? false;
}

/**
 * Get the most valuable active subscription
 * (useful for determining primary subscription)
 */
export function getMostValuableSubscription(
  subscriptions: Subscription[]
): Subscription | null {
  const activeSubscriptions = subscriptions.filter(isSubscriptionActive);

  if (activeSubscriptions.length === 0) {
    return null;
  }

  // Sort by: 1) price (desc), 2) expiry date (desc), 3) platform priority
  const platformPriority: Record<Platform, number> = {
    ios: 3,
    android: 2,
    stripe: 1,
  };

  activeSubscriptions.sort((a, b) => {
    // By price (higher first)
    const priceA = a.price_amount || 0;
    const priceB = b.price_amount || 0;
    if (priceB !== priceA) return priceB - priceA;

    // By expiry date (later first)
    const expiryA = a.expires_at || 0;
    const expiryB = b.expires_at || 0;
    if (expiryB !== expiryA) return expiryB - expiryA;

    // By platform priority
    return platformPriority[b.platform] - platformPriority[a.platform];
  });

  return activeSubscriptions[0];
}

/**
 * Merge entitlements from multiple sources
 */
export function mergeEntitlements(
  ...entitlementMaps: Record<string, EntitlementInfo>[]
): Record<string, EntitlementInfo> {
  const merged: Record<string, EntitlementInfo> = {};

  for (const entitlements of entitlementMaps) {
    for (const [key, value] of Object.entries(entitlements)) {
      if (!merged[key]) {
        merged[key] = value;
      } else if (value.is_active) {
        // Active takes precedence
        if (!merged[key].is_active) {
          merged[key] = value;
        } else {
          // Both active, prefer later expiry
          const existingExpiry = merged[key].expires_date
            ? new Date(merged[key].expires_date!).getTime()
            : 0;
          const newExpiry = value.expires_date
            ? new Date(value.expires_date).getTime()
            : 0;

          if (newExpiry > existingExpiry) {
            merged[key] = value;
          }
        }
      }
    }
  }

  return merged;
}
