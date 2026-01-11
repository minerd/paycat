# PayCat SDKs

PayCat provides official SDKs for all major platforms to handle in-app purchases and subscription management.

## Available SDKs

| Platform | Package | Status |
|----------|---------|--------|
| iOS/macOS | [paycat-ios](./ios) | Ready |
| Android | [paycat-android](./android) | Ready |
| Web/JavaScript | [paycat-web](./web) | Ready |
| Flutter | [paycat_flutter](./flutter) | Ready |
| React Native | [react-native-paycat](./react-native) | Ready |

## Quick Start

### iOS (Swift)

```swift
import PayCat

// Configure
try await PayCat.configure(apiKey: "pk_live_xxxxx")

// Check entitlement
let isPremium = try await PayCat.shared.hasEntitlement("premium")

// Make a purchase
let products = try await PayCat.shared.products(productIDs: ["com.app.premium_monthly"])
if let product = products.first {
    let info = try await PayCat.shared.purchase(product)
}
```

### Android (Kotlin)

```kotlin
import com.paycat.sdk.PayCat

// Configure
PayCat.configure(context, "pk_live_xxxxx")

// Check entitlement
lifecycleScope.launch {
    val isPremium = PayCat.shared.hasEntitlement("premium")
}

// Make a purchase
PayCat.shared.purchase(activity, product)
```

### Web (JavaScript/TypeScript)

```typescript
import PayCat from '@paycat/web';

// Configure
PayCat.configure({ apiKey: 'pk_live_xxxxx' });

// Check entitlement
const isPremium = await PayCat.shared.hasEntitlement('premium');

// Sync Stripe subscription
await PayCat.shared.syncStripeSubscription('sub_xxxxx');
```

### Flutter

```dart
import 'package:paycat_flutter/paycat_flutter.dart';

// Configure
await PayCat.configure(apiKey: 'pk_live_xxxxx');

// Check entitlement
final isPremium = await PayCat.instance.hasEntitlement('premium');

// Make a purchase
final products = await PayCat.instance.getProducts({'com.app.premium_monthly'});
final info = await PayCat.instance.purchase(products.first);
```

### React Native

```typescript
import PayCat, { useEntitlement } from 'react-native-paycat';

// Configure
await PayCat.configure({ apiKey: 'pk_live_xxxxx' });

// Use hook
function PremiumFeature() {
  const { isActive, loading } = useEntitlement('premium');

  if (loading) return <Loading />;
  if (!isActive) return <Paywall />;

  return <PremiumContent />;
}
```

## Common Features

All SDKs provide:

- **Subscription Management**: Track active subscriptions across platforms
- **Entitlement System**: Check feature access with simple API
- **User Management**: Anonymous and identified users
- **Offline Support**: Cached subscriber info for offline access
- **Real-time Updates**: Stream/callback updates on subscription changes

## API Reference

### Core Methods

| Method | Description |
|--------|-------------|
| `configure(apiKey)` | Initialize SDK with API key |
| `getSubscriberInfo()` | Get current subscriber info |
| `hasEntitlement(id)` | Check if entitlement is active |
| `identify(userID)` | Set user ID (login) |
| `logOut()` | Switch to anonymous user |
| `purchase(product)` | Make a purchase |
| `restorePurchases()` | Restore previous purchases |

### SubscriberInfo Object

```typescript
interface SubscriberInfo {
  originalAppUserID: string;
  firstSeen: Date;
  subscriptions: Record<string, Subscription>;
  entitlements: Record<string, Entitlement>;
}

interface Subscription {
  platform: 'ios' | 'android' | 'stripe';
  productID: string;
  status: 'active' | 'expired' | 'cancelled' | 'grace_period' | 'paused';
  purchaseDate: Date;
  expiresDate: Date | null;
  isSandbox: boolean;
  isTrialPeriod: boolean;
  willRenew: boolean;
}

interface Entitlement {
  isActive: boolean;
  productIdentifier: string;
  expiresDate: Date | null;
}
```

## Installation

### iOS (Swift Package Manager)

```swift
// Package.swift
dependencies: [
    .package(url: "https://github.com/minerd/paycat.git", from: "1.0.0")
]
```

### Android (Gradle)

```kotlin
// build.gradle.kts
dependencies {
    implementation("com.paycat:sdk:1.0.0")
}
```

### Web (npm)

```bash
npm install @paycat/web
```

### Flutter

```yaml
# pubspec.yaml
dependencies:
  paycat_flutter: ^1.0.0
```

### React Native

```bash
npm install react-native-paycat react-native-iap @react-native-async-storage/async-storage
```

## Server-Side Integration

For server-side verification and webhooks, see the [API Documentation](../docs/api.md).

## Support

- GitHub Issues: https://github.com/minerd/paycat/issues
- Documentation: https://paycat.dev/docs
