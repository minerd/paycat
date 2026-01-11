# PayCat React Native SDK

React Native SDK for PayCat subscription management on iOS and Android.

## Requirements

- React Native 0.70+
- iOS 11.0+ / Android SDK 21+

## Installation

```bash
npm install react-native-paycat react-native-iap @react-native-async-storage/async-storage
# or
yarn add react-native-paycat react-native-iap @react-native-async-storage/async-storage
```

### iOS Setup

```bash
cd ios && pod install
```

Add to `ios/YourApp/Info.plist`:

```xml
<key>SKAdNetworkItems</key>
<array>
  <!-- Add your SKAdNetwork IDs -->
</array>
```

### Android Setup

Add to `android/app/build.gradle`:

```groovy
dependencies {
    implementation 'com.android.billingclient:billing:6.1.0'
}
```

## Quick Start

### 1. Configure SDK

```typescript
import PayCat from 'react-native-paycat';

// In your app initialization
await PayCat.configure({
  apiKey: 'pk_live_xxxxx',
  // Optional
  appUserID: 'user_12345',
});
```

### 2. Check Entitlements

```typescript
// Check specific entitlement
const isPremium = await PayCat.shared.hasEntitlement('premium');

// Check any active subscription
const hasActive = await PayCat.shared.hasActiveSubscription();

// Get all active entitlements
const activeEntitlements = await PayCat.shared.getActiveEntitlements();
```

### 3. Display Products

```typescript
const products = await PayCat.shared.getProducts([
  'com.app.premium_monthly',
  'com.app.premium_yearly',
]);

products.forEach(product => {
  console.log(`${product.title}: ${product.price}`);
});
```

### 4. Make a Purchase

```typescript
import { PayCatError } from 'react-native-paycat';

try {
  const info = await PayCat.shared.purchase('com.app.premium_monthly');
  // Purchase successful!
} catch (error) {
  if (error instanceof PayCatError) {
    if (error.code === 'purchase_cancelled') {
      // User cancelled
    } else {
      console.error('Purchase failed:', error.message);
    }
  }
}
```

### 5. Restore Purchases

```typescript
const info = await PayCat.shared.restorePurchases();
```

## React Hooks

The SDK provides convenient React hooks for common operations.

### useSubscriberInfo

```tsx
import { useSubscriberInfo } from 'react-native-paycat';

function MyComponent() {
  const { subscriberInfo, loading, error, refresh } = useSubscriberInfo();

  if (loading) return <ActivityIndicator />;
  if (error) return <Text>Error: {error.message}</Text>;

  return (
    <View>
      <Text>User: {subscriberInfo?.originalAppUserID}</Text>
      <Button title="Refresh" onPress={refresh} />
    </View>
  );
}
```

### useEntitlement

```tsx
import { useEntitlement } from 'react-native-paycat';

function PremiumFeature() {
  const { isActive, loading, error } = useEntitlement('premium');

  if (loading) return <ActivityIndicator />;
  if (!isActive) return <PaywallScreen />;

  return <PremiumContent />;
}
```

### useHasActiveSubscription

```tsx
import { useHasActiveSubscription } from 'react-native-paycat';

function SubscriptionGate({ children }) {
  const { hasActive, loading } = useHasActiveSubscription();

  if (loading) return <ActivityIndicator />;
  if (!hasActive) return <PaywallScreen />;

  return children;
}
```

### useProducts

```tsx
import { useProducts } from 'react-native-paycat';

function ProductList() {
  const { products, loading, error, refresh } = useProducts([
    'com.app.premium_monthly',
    'com.app.premium_yearly',
  ]);

  if (loading) return <ActivityIndicator />;

  return (
    <FlatList
      data={products}
      renderItem={({ item }) => (
        <ProductCard product={item} />
      )}
    />
  );
}
```

### usePurchase

```tsx
import { usePurchase } from 'react-native-paycat';

function BuyButton({ productId }) {
  const { purchase, restore, loading, error } = usePurchase();

  return (
    <View>
      <Button
        title="Buy"
        onPress={() => purchase(productId)}
        disabled={loading}
      />
      <Button
        title="Restore"
        onPress={restore}
        disabled={loading}
      />
      {error && <Text>Error: {error.message}</Text>}
    </View>
  );
}
```

## User Management

### Anonymous Users

By default, PayCat creates an anonymous user ID stored in AsyncStorage.

### Identified Users

When a user logs in:

```typescript
const info = await PayCat.shared.identify('user_12345');
```

When they log out:

```typescript
const info = await PayCat.shared.logOut();
```

## Event Handling

```typescript
// Subscribe to updates
const unsubscribe = PayCat.shared.on('subscriberInfoUpdated', (event) => {
  console.log('Subscriber info updated:', event.data);
});

// Purchase events
PayCat.shared.on('purchaseCompleted', (event) => {
  console.log('Purchase completed!');
});

PayCat.shared.on('purchaseFailed', (event) => {
  console.error('Purchase failed:', event.data);
});

PayCat.shared.on('restoreCompleted', () => {
  console.log('Restore completed!');
});

// Unsubscribe
unsubscribe();
```

## Web Integration (Stripe)

For web purchases that need to sync to mobile:

```typescript
// Sync a Stripe subscription
const info = await PayCat.shared.syncStripeSubscription('sub_xxxxx');
```

## Error Handling

```typescript
import { PayCatError } from 'react-native-paycat';

try {
  await PayCat.shared.purchase(productId);
} catch (error) {
  if (error instanceof PayCatError) {
    switch (error.code) {
      case 'not_configured':
        // SDK not configured
        break;
      case 'purchase_cancelled':
        // User cancelled
        break;
      case 'purchase_failed':
        // Purchase failed
        break;
      case 'iap_unavailable':
        // Native IAP not available
        break;
      case 'restore_failed':
        // Restore failed
        break;
      case 'sync_failed':
        // Sync failed
        break;
      default:
        console.error(`PayCat error: ${error.code} - ${error.message}`);
    }
  }
}
```

## TypeScript Support

Full TypeScript support with exported types:

```typescript
import PayCat, {
  PayCatConfig,
  SubscriberInfo,
  Subscription,
  Entitlement,
  ProductDetails,
  Platform,
  SubscriptionStatus,
  PayCatError,
  PayCatEventType,
  PayCatEvent,
} from 'react-native-paycat';
```

## API Reference

### PayCat

| Method | Returns | Description |
|--------|---------|-------------|
| `configure(config)` | `Promise<PayCat>` | Initialize SDK |
| `shared` | `PayCat` | Get instance |
| `isConfigured` | `boolean` | Check if configured |
| `currentAppUserID` | `string` | Current user ID |
| `currentSubscriberInfo` | `SubscriberInfo \| null` | Cached info |
| `getSubscriberInfo(force?)` | `Promise<SubscriberInfo>` | Get info |
| `hasEntitlement(id)` | `Promise<boolean>` | Check entitlement |
| `hasActiveSubscription()` | `Promise<boolean>` | Has any active |
| `getActiveEntitlements()` | `Promise<string[]>` | Get active IDs |
| `getProducts(ids)` | `Promise<ProductDetails[]>` | Get products |
| `purchase(productId)` | `Promise<SubscriberInfo>` | Make purchase |
| `restorePurchases()` | `Promise<SubscriberInfo>` | Restore purchases |
| `syncStripeSubscription(id)` | `Promise<SubscriberInfo>` | Sync Stripe |
| `identify(userID)` | `Promise<SubscriberInfo>` | Set user ID |
| `logOut()` | `Promise<SubscriberInfo>` | Switch to anonymous |
| `on(event, callback)` | `() => void` | Add listener |
| `off(event, callback)` | `void` | Remove listener |

### React Hooks

| Hook | Returns | Description |
|------|---------|-------------|
| `useSubscriberInfo()` | `{ subscriberInfo, loading, error, refresh }` | Subscribe to info |
| `useEntitlement(id)` | `{ isActive, loading, error }` | Check entitlement |
| `useHasActiveSubscription()` | `{ hasActive, loading, error }` | Check any active |
| `useProducts(ids)` | `{ products, loading, error, refresh }` | Get products |
| `usePurchase()` | `{ purchase, restore, loading, error }` | Purchase operations |
| `useAppUserID()` | `string \| null` | Get current user ID |

## License

MIT License
