# MRRCat Web SDK

TypeScript/JavaScript SDK for MRRCat subscription management on web applications.

## Requirements

- Modern browser with ES2020 support
- Node.js 16+ (for SSR)

## Installation

```bash
npm install @mrrcat/web
# or
yarn add @mrrcat/web
# or
pnpm add @mrrcat/web
```

## Quick Start

### 1. Configure SDK

```typescript
import MRRCat from '@mrrcat/web';

MRRCat.configure({
  apiKey: 'pk_live_xxxxx',
  // Optional: custom user ID
  appUserID: 'user_12345',
});
```

### 2. Check Entitlements

```typescript
// Check specific entitlement
const isPremium = await MRRCat.shared.hasEntitlement('premium');

// Get all subscriber info
const info = await MRRCat.shared.getSubscriberInfo();
console.log(info.entitlements);
```

### 3. Sync Stripe Subscription

After a successful Stripe Checkout or subscription creation:

```typescript
// After Stripe webhook confirms subscription
const info = await MRRCat.shared.syncStripeSubscription('sub_xxxxx');
```

### 4. Manage Billing

```typescript
// Get Stripe Customer Portal URL
const manageURL = MRRCat.shared.getManagementURL();
window.location.href = manageURL;
```

## User Management

### Anonymous Users

By default, MRRCat creates an anonymous user ID stored in localStorage.

### Identified Users

When a user logs in:

```typescript
const info = await MRRCat.shared.identify('user_12345');
```

When they log out:

```typescript
const info = await MRRCat.shared.logOut();
```

## Event Handling

```typescript
// Subscribe to updates
MRRCat.shared.on('subscriberInfoUpdated', (event) => {
  const info = event.data;
  updateUI(info);
});

// Handle errors
MRRCat.shared.on('error', (event) => {
  console.error('MRRCat error:', event.data);
});

// Unsubscribe
MRRCat.shared.off('subscriberInfoUpdated', callback);
```

## React Integration

```tsx
import MRRCat, { SubscriberInfo } from '@mrrcat/web';
import { useEffect, useState } from 'react';

function useMRRCat() {
  const [info, setInfo] = useState<SubscriberInfo | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    MRRCat.shared.getSubscriberInfo()
      .then(setInfo)
      .finally(() => setLoading(false));

    MRRCat.shared.on('subscriberInfoUpdated', (event) => {
      setInfo(event.data as SubscriberInfo);
    });
  }, []);

  return { info, loading };
}

function PremiumGate({ children }: { children: React.ReactNode }) {
  const { info, loading } = useMRRCat();

  if (loading) return <Loading />;
  if (!info?.entitlements.premium?.isActive) return <Paywall />;

  return <>{children}</>;
}
```

## Vue Integration

```vue
<script setup lang="ts">
import MRRCat, { SubscriberInfo } from '@mrrcat/web';
import { ref, onMounted } from 'vue';

const info = ref<SubscriberInfo | null>(null);
const loading = ref(true);

onMounted(async () => {
  info.value = await MRRCat.shared.getSubscriberInfo();
  loading.value = false;

  MRRCat.shared.on('subscriberInfoUpdated', (event) => {
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
    appUserID: MRRCat.shared.currentAppUserID,
  }),
});
const { sessionUrl } = await response.json();

// 2. Redirect to Stripe Checkout
window.location.href = sessionUrl;

// 3. After success, sync subscription (on success page)
const subscriptionId = new URLSearchParams(location.search).get('subscription_id');
if (subscriptionId) {
  await MRRCat.shared.syncStripeSubscription(subscriptionId);
}
```

## Error Handling

```typescript
import { MRRCatError } from '@mrrcat/web';

try {
  await MRRCat.shared.getSubscriberInfo();
} catch (error) {
  if (error instanceof MRRCatError) {
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
        console.error(`MRRCat error: ${error.code} - ${error.message}`);
    }
  }
}
```

## TypeScript Support

Full TypeScript support with exported types:

```typescript
import MRRCat, {
  MRRCatConfig,
  SubscriberInfo,
  Subscription,
  Entitlement,
  Platform,
  SubscriptionStatus,
  MRRCatError,
} from '@mrrcat/web';
```

## API Reference

### MRRCat

| Method | Returns | Description |
|--------|---------|-------------|
| `configure(config)` | `MRRCat` | Initialize SDK |
| `shared` | `MRRCat` | Get shared instance |
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
