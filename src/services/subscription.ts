/**
 * Subscription Management Service
 * Handles verification and status management across all platforms
 */

import type { Platform, Subscription, SubscriptionStatus } from '../types';
import { createAppleClient } from './apple/client';
import { mapAppleSubscriptionStatus } from './apple/types';
import { createGoogleClient } from './google/client';
import { mapGoogleSubscriptionState } from './google/types';
import { createStripeClient } from './stripe/client';
import { mapStripeSubscriptionStatus } from './stripe/types';
import {
  getSubscriptionByOriginalTransactionId,
  getSubscriptionByPurchaseToken,
  getSubscriptionByStripeId,
  createSubscription,
  updateSubscription,
  createTransaction,
  getOrCreateSubscriber,
} from '../db/queries';
import { Errors } from '../middleware/error';
import { now } from '../utils/time';

export interface VerifyReceiptOptions {
  appId: string;
  appUserId: string;
  platform: Platform;
  transactionId?: string;
  purchaseToken?: string;
  stripeSubscriptionId?: string;
  appleConfig?: string;
  googleConfig?: string;
  stripeConfig?: string;
}

export interface VerificationResult {
  subscription: Subscription;
  isNew: boolean;
  transaction?: {
    id: string;
    type: string;
  };
}

/**
 * Verify and sync subscription from receipt/token
 */
export async function verifyAndSyncSubscription(
  db: D1Database,
  options: VerifyReceiptOptions
): Promise<VerificationResult> {
  switch (options.platform) {
    case 'ios':
      return verifyAppleSubscription(db, options);
    case 'android':
      return verifyGoogleSubscription(db, options);
    case 'stripe':
      return verifyStripeSubscription(db, options);
    default:
      throw Errors.badRequest(`Unsupported platform: ${options.platform}`);
  }
}

/**
 * Verify Apple App Store subscription
 */
async function verifyAppleSubscription(
  db: D1Database,
  options: VerifyReceiptOptions
): Promise<VerificationResult> {
  if (!options.transactionId) {
    throw Errors.badRequest('transaction_id is required for iOS');
  }

  if (!options.appleConfig) {
    throw Errors.configurationError('Apple configuration not found');
  }

  const client = createAppleClient(options.appleConfig);

  // Get transaction info from Apple
  const transactionInfo = await client.getTransactionInfo(options.transactionId);

  // Get all subscription statuses
  const statusResponse = await client.getAllSubscriptionStatuses(
    options.transactionId
  );

  // Find the relevant subscription
  let latestStatus: number = 2; // Default to expired
  let renewalInfo;

  for (const group of statusResponse.groups) {
    for (const sub of group.subscriptions) {
      if (sub.transaction.originalTransactionId === transactionInfo.originalTransactionId) {
        latestStatus = sub.status;
        renewalInfo = sub.renewalInfo;
        break;
      }
    }
  }

  // Check if subscription exists
  let subscription = await getSubscriptionByOriginalTransactionId(
    db,
    options.appId,
    transactionInfo.originalTransactionId
  );

  const subscriber = await getOrCreateSubscriber(db, options.appId, options.appUserId);

  const status = mapAppleSubscriptionStatus(latestStatus as 1 | 2 | 3 | 4 | 5);
  const isNew = !subscription;

  if (!subscription) {
    // Create new subscription
    subscription = await createSubscription(db, {
      subscriberId: subscriber.id,
      appId: options.appId,
      platform: 'ios',
      productId: transactionInfo.productId,
      originalTransactionId: transactionInfo.originalTransactionId,
      status,
      purchaseDate: transactionInfo.originalPurchaseDate,
      expiresAt: transactionInfo.expiresDate,
      isTrial: transactionInfo.offerType === 1,
      isSandbox: transactionInfo.environment === 'Sandbox',
      willRenew: renewalInfo?.autoRenewStatus === 1,
      priceAmount: transactionInfo.price,
      priceCurrency: transactionInfo.currency,
    });
  } else {
    // Update existing subscription
    await updateSubscription(db, subscription.id, {
      status,
      expiresAt: transactionInfo.expiresDate || null,
      willRenew: renewalInfo?.autoRenewStatus === 1,
      gracePeriodExpiresAt: renewalInfo?.gracePeriodExpiresDate || null,
    });

    subscription = {
      ...subscription,
      status,
      expires_at: transactionInfo.expiresDate || null,
      will_renew: renewalInfo?.autoRenewStatus === 1,
      grace_period_expires_at: renewalInfo?.gracePeriodExpiresDate || null,
      updated_at: now(),
    };
  }

  // Log transaction
  const transaction = await createTransaction(db, {
    subscriptionId: subscription.id,
    appId: options.appId,
    transactionId: transactionInfo.transactionId,
    originalTransactionId: transactionInfo.originalTransactionId,
    productId: transactionInfo.productId,
    platform: 'ios',
    type: isNew ? 'initial_purchase' : 'renewal',
    purchaseDate: transactionInfo.purchaseDate,
    expiresDate: transactionInfo.expiresDate,
    revenueAmount: transactionInfo.price,
    revenueCurrency: transactionInfo.currency,
    rawData: JSON.stringify(transactionInfo),
  });

  return {
    subscription,
    isNew,
    transaction: { id: transaction.id, type: transaction.type },
  };
}

/**
 * Verify Google Play subscription
 */
async function verifyGoogleSubscription(
  db: D1Database,
  options: VerifyReceiptOptions
): Promise<VerificationResult> {
  if (!options.purchaseToken) {
    throw Errors.badRequest('purchase_token is required for Android');
  }

  if (!options.googleConfig) {
    throw Errors.configurationError('Google configuration not found');
  }

  const client = createGoogleClient(options.googleConfig);

  // Get subscription info from Google
  const purchaseInfo = await client.getSubscriptionV2(options.purchaseToken);

  // Get the first line item (main subscription)
  const lineItem = purchaseInfo.lineItems[0];
  if (!lineItem) {
    throw Errors.receiptInvalid('No subscription items found');
  }

  // Check if subscription exists
  let subscription = await getSubscriptionByPurchaseToken(
    db,
    options.appId,
    options.purchaseToken
  );

  const subscriber = await getOrCreateSubscriber(db, options.appId, options.appUserId);

  const status = mapGoogleSubscriptionState(purchaseInfo.subscriptionState);
  const expiresAt = new Date(lineItem.expiryTime).getTime();
  const purchaseDate = new Date(purchaseInfo.startTime).getTime();
  const isNew = !subscription;

  if (!subscription) {
    // Create new subscription
    subscription = await createSubscription(db, {
      subscriberId: subscriber.id,
      appId: options.appId,
      platform: 'android',
      productId: lineItem.productId,
      purchaseToken: options.purchaseToken,
      status,
      purchaseDate,
      expiresAt,
      isTrial: false, // Would need to check offer type
      isSandbox: !!purchaseInfo.testPurchase,
      willRenew: lineItem.autoRenewingPlan?.autoRenewEnabled ?? false,
    });
  } else {
    // Update existing subscription
    await updateSubscription(db, subscription.id, {
      status,
      expiresAt,
      willRenew: lineItem.autoRenewingPlan?.autoRenewEnabled ?? false,
    });

    subscription = {
      ...subscription,
      status,
      expires_at: expiresAt,
      will_renew: lineItem.autoRenewingPlan?.autoRenewEnabled ?? false,
      updated_at: now(),
    };
  }

  // Log transaction
  const transaction = await createTransaction(db, {
    subscriptionId: subscription.id,
    appId: options.appId,
    transactionId: purchaseInfo.latestOrderId,
    productId: lineItem.productId,
    platform: 'android',
    type: isNew ? 'initial_purchase' : 'renewal',
    purchaseDate,
    expiresDate: expiresAt,
    rawData: JSON.stringify(purchaseInfo),
  });

  return {
    subscription,
    isNew,
    transaction: { id: transaction.id, type: transaction.type },
  };
}

/**
 * Verify Stripe subscription
 */
async function verifyStripeSubscription(
  db: D1Database,
  options: VerifyReceiptOptions
): Promise<VerificationResult> {
  if (!options.stripeSubscriptionId) {
    throw Errors.badRequest('subscription_id is required for Stripe');
  }

  if (!options.stripeConfig) {
    throw Errors.configurationError('Stripe configuration not found');
  }

  const client = createStripeClient(options.stripeConfig);

  // Get subscription info from Stripe
  const stripeSubscription = await client.getSubscription(
    options.stripeSubscriptionId
  );

  // Get the first item (main subscription)
  const item = stripeSubscription.items.data[0];
  if (!item) {
    throw Errors.receiptInvalid('No subscription items found');
  }

  // Check if subscription exists
  let subscription = await getSubscriptionByStripeId(
    db,
    options.appId,
    options.stripeSubscriptionId
  );

  const subscriber = await getOrCreateSubscriber(db, options.appId, options.appUserId);

  const status = mapStripeSubscriptionStatus(stripeSubscription.status);
  const purchaseDate = stripeSubscription.created * 1000;
  const expiresAt = stripeSubscription.current_period_end * 1000;
  const isNew = !subscription;

  if (!subscription) {
    // Create new subscription
    subscription = await createSubscription(db, {
      subscriberId: subscriber.id,
      appId: options.appId,
      platform: 'stripe',
      productId: typeof item.price.product === 'string'
        ? item.price.product
        : item.price.id,
      stripeSubscriptionId: options.stripeSubscriptionId,
      status,
      purchaseDate,
      expiresAt,
      isTrial: stripeSubscription.status === 'trialing',
      isSandbox: !stripeSubscription.livemode,
      willRenew: !stripeSubscription.cancel_at_period_end,
      priceAmount: item.price.unit_amount || undefined,
      priceCurrency: item.price.currency,
    });
  } else {
    // Update existing subscription
    await updateSubscription(db, subscription.id, {
      status,
      expiresAt,
      willRenew: !stripeSubscription.cancel_at_period_end,
      cancelledAt: stripeSubscription.canceled_at
        ? stripeSubscription.canceled_at * 1000
        : null,
    });

    subscription = {
      ...subscription,
      status,
      expires_at: expiresAt,
      will_renew: !stripeSubscription.cancel_at_period_end,
      cancelled_at: stripeSubscription.canceled_at
        ? stripeSubscription.canceled_at * 1000
        : null,
      updated_at: now(),
    };
  }

  // Log transaction
  const transaction = await createTransaction(db, {
    subscriptionId: subscription.id,
    appId: options.appId,
    transactionId: stripeSubscription.latest_invoice || stripeSubscription.id,
    productId: typeof item.price.product === 'string'
      ? item.price.product
      : item.price.id,
    platform: 'stripe',
    type: isNew ? 'initial_purchase' : 'renewal',
    purchaseDate,
    expiresDate: expiresAt,
    revenueAmount: item.price.unit_amount || undefined,
    revenueCurrency: item.price.currency,
    rawData: JSON.stringify(stripeSubscription),
  });

  return {
    subscription,
    isNew,
    transaction: { id: transaction.id, type: transaction.type },
  };
}

/**
 * Calculate subscription status based on dates
 */
export function calculateSubscriptionStatus(
  expiresAt: number | null,
  gracePeriodExpiresAt: number | null,
  cancelledAt: number | null,
  willRenew: boolean
): SubscriptionStatus {
  const currentTime = now();

  // Check if cancelled
  if (cancelledAt && !willRenew) {
    if (expiresAt && currentTime > expiresAt) {
      return 'expired';
    }
    return 'cancelled';
  }

  // Check if in grace period
  if (gracePeriodExpiresAt && expiresAt) {
    if (currentTime > expiresAt && currentTime <= gracePeriodExpiresAt) {
      return 'grace_period';
    }
  }

  // Check if expired
  if (expiresAt && currentTime > expiresAt) {
    return 'expired';
  }

  return 'active';
}
