# PayCat Web SDK

TypeScript/JavaScript SDK for PayCat subscription management on web applications.

## Requirements

- Modern browser with ES2020 support
- Node.js 16+ (for SSR)

## Installation

```bash
npm install @paycat/web
# or
yarn add @paycat/web
# or
pnpm add @paycat/web
```

## Quick Start

### 1. Configure SDK

```typescript
import PayCat from '@paycat/web';

PayCat.configure({
  apiKey: 'pk_live_xxxxx',
  // Optional: custom user ID
  appUserID: 'user_12345',
});
```

### 2. Check Entitlements

```typescript
// Check specific entitlement
const isPremium = await PayCat.shared.hasEntitlement('premium');

// Get all subscriber info
const info = await PayCat.shared.getSubscriberInfo();
console.log(info.entitlements);
```

### 3. Sync Stripe Subscription

After a successful Stripe Checkout or subscription creation:

```typescript
// After Stripe webhook confirms subscription
const info = await PayCat.shared.syncStripeSubscription('sub_xxxxx');
```

### 4. Manage Billing

```typescript
// Get Stripe Customer Portal URL
const manageURL = PayCat.shared.getManagementURL();
window.location.href = manageURL;
```

## User Management

### Anonymous Users

By default, PayCat creates an anonymous user ID stored in localStorage.

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
PayCat.shared.on('subscriberInfoUpdated', (event) => {
  const info = event.data;
  updateUI(info);
});

// Handle errors
PayCat.shared.on('error', (event) => {
  console.error('PayCat error:', event.data);
});

// Unsubscribe
PayCat.shared.off('subscriberInfoUpdated', callback);
```

## React Integration

```tsx
import PayCat, { SubscriberInfo } from '@paycat/web';
import { useEffect, useState } from 'react';

function usePayCat() {
  const [info, setInfo] = useState<SubscriberInfo | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    PayCat.shared.getSubscriberInfo()
      .then(setInfo)
      .finally(() => setLoading(false));

    PayCat.shared.on('subscriberInfoUpdated', (event) => {
      setInfo(event.data as SubscriberInfo);
    });
  }, []);

  return { info, loading };
}

function PremiumGate({ children }: { children: React.ReactNode }) {
  const { info, loading } = usePayCat();

  if (loading) return <Loading />;
  if (!info?.entitlements.premium?.isActive) return <Paywall />;

  return <>{children}</>;
}
```

## Vue Integration

```vue
<script setup lang="ts">
import PayCat, { SubscriberInfo } from '@paycat/web';
import { ref, onMounted } from 'vue';

const info = ref<SubscriberInfo | null>(null);
const loading = ref(true);

onMounted(async () => {
  info.value = await PayCat.shared.getSubscriberInfo();
  loading.value = false;

  PayCat.shared.on('subscriberInfoUpdated', (event) => {
    info.value = event.data as SubscriberInfo;
  });
});

const isPremium = computed(() =>
  info.value?.entitlements.premium?.isActive ?? false
);
</script>
```

## Stripe Integration Example

### Checkout Flow

```typescript
// 1. Create Checkout Session on your server
const response = await fetch('/api/create-checkout', {
  method: 'POST',
  body: JSON.stringify({
    priceId: 'price_xxxxx',
    appUserID: PayCat.shared.currentAppUserID,
  }),
});
const { sessionUrl } = await response.json();

// 2. Redirect to Stripe Checkout
window.location.href = sessionUrl;

// 3. After success, sync subscription (on success page)
const subscriptionId = new URLSearchParams(location.search).get('subscription_id');
if (subscriptionId) {
  await PayCat.shared.syncStripeSubscription(subscriptionId);
}
```

## Error Handling

```typescript
import { PayCatError } from '@paycat/web';

try {
  await PayCat.shared.getSubscriberInfo();
} catch (error) {
  if (error instanceof PayCatError) {
    switch (error.code) {
      case 'not_configured':
        // SDK not configured
        break;
      case 'network_error':
        // Network request failed
        break;
      case 'unauthorized':
        // Invalid API key
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
  Platform,
  SubscriptionStatus,
  PayCatError,
} from '@paycat/web';
```

## API Reference

### PayCat

| Method | Returns | Description |
|--------|---------|-------------|
| `configure(config)` | `PayCat` | Initialize SDK |
| `shared` | `PayCat` | Get shared instance |
| `isConfigured` | `boolean` | Check if configured |
| `currentAppUserID` | `string` | Get current user ID |
| `getSubscriberInfo(force?)` | `Promise<SubscriberInfo>` | Get subscriber info |
| `hasEntitlement(id)` | `Promise<boolean>` | Check entitlement |
| `identify(userID)` | `Promise<SubscriberInfo>` | Set user ID |
| `logOut()` | `Promise<SubscriberInfo>` | Switch to anonymous |
| `syncStripeSubscription(id)` | `Promise<SubscriberInfo>` | Sync Stripe sub |
| `getManagementURL()` | `string` | Get billing portal URL |
| `on(event, callback)` | `void` | Add event listener |
| `off(event, callback)` | `void` | Remove event listener |

## License

MIT License
