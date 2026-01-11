/**
 * PayCat React Hooks
 */

import { useState, useEffect, useCallback } from 'react';
import PayCat, { SubscriberInfo, PayCatError, ProductDetails } from './index';

/**
 * Hook to get and subscribe to subscriber info updates
 */
export function useSubscriberInfo(): {
  subscriberInfo: SubscriberInfo | null;
  loading: boolean;
  error: PayCatError | null;
  refresh: () => Promise<void>;
} {
  const [subscriberInfo, setSubscriberInfo] = useState<SubscriberInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<PayCatError | null>(null);

  const refresh = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const info = await PayCat.shared.getSubscriberInfo(true);
      setSubscriberInfo(info);
    } catch (e) {
      setError(e as PayCatError);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Initial fetch
    refresh();

    // Subscribe to updates
    const unsubscribe = PayCat.shared.on('subscriberInfoUpdated', (event) => {
      setSubscriberInfo(event.data as SubscriberInfo);
    });

    return () => {
      unsubscribe();
    };
  }, [refresh]);

  return { subscriberInfo, loading, error, refresh };
}

/**
 * Hook to check entitlement status
 */
export function useEntitlement(identifier: string): {
  isActive: boolean;
  loading: boolean;
  error: PayCatError | null;
} {
  const { subscriberInfo, loading, error } = useSubscriberInfo();

  const isActive = subscriberInfo?.entitlements[identifier]?.isActive ?? false;

  return { isActive, loading, error };
}

/**
 * Hook to check if user has any active subscription
 */
export function useHasActiveSubscription(): {
  hasActive: boolean;
  loading: boolean;
  error: PayCatError | null;
} {
  const { subscriberInfo, loading, error } = useSubscriberInfo();

  const hasActive = subscriberInfo
    ? Object.values(subscriberInfo.entitlements).some(e => e.isActive)
    : false;

  return { hasActive, loading, error };
}

/**
 * Hook to get products
 */
export function useProducts(productIds: string[]): {
  products: ProductDetails[];
  loading: boolean;
  error: PayCatError | null;
  refresh: () => Promise<void>;
} {
  const [products, setProducts] = useState<ProductDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<PayCatError | null>(null);

  const refresh = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const fetchedProducts = await PayCat.shared.getProducts(productIds);
      setProducts(fetchedProducts);
    } catch (e) {
      setError(e as PayCatError);
    } finally {
      setLoading(false);
    }
  }, [productIds.join(',')]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { products, loading, error, refresh };
}

/**
 * Hook for purchase operations
 */
export function usePurchase(): {
  purchase: (productId: string) => Promise<SubscriberInfo>;
  restore: () => Promise<SubscriberInfo>;
  loading: boolean;
  error: PayCatError | null;
} {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<PayCatError | null>(null);

  const purchase = useCallback(async (productId: string): Promise<SubscriberInfo> => {
    try {
      setLoading(true);
      setError(null);
      return await PayCat.shared.purchase(productId);
    } catch (e) {
      setError(e as PayCatError);
      throw e;
    } finally {
      setLoading(false);
    }
  }, []);

  const restore = useCallback(async (): Promise<SubscriberInfo> => {
    try {
      setLoading(true);
      setError(null);
      return await PayCat.shared.restorePurchases();
    } catch (e) {
      setError(e as PayCatError);
      throw e;
    } finally {
      setLoading(false);
    }
  }, []);

  return { purchase, restore, loading, error };
}

/**
 * Hook to get current app user ID
 */
export function useAppUserID(): string | null {
  const [appUserID, setAppUserID] = useState<string | null>(null);

  useEffect(() => {
    if (PayCat.isConfigured) {
      setAppUserID(PayCat.shared.currentAppUserID);
    }
  }, []);

  return appUserID;
}
