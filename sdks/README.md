# MRRCat SDKs

MRRCat provides official SDKs for all major platforms to handle in-app purchases and subscription management.

## Available SDKs

| Platform | Package | Status |
|----------|---------|--------|
| iOS/macOS | [mrrcat-ios](./ios) | Ready |
| Android | [mrrcat-android](./android) | Ready |
| Web/JavaScript | [mrrcat-web](./web) | Ready |
| Flutter | [mrrcat_flutter](./flutter) | Ready |
| React Native | [react-native-mrrcat](./react-native) | Ready |

## Quick Start

### iOS (Swift)

```swift
import MRRCat

// Configure
try await MRRCat.configure(apiKey: "pk_live_xxxxx")

// Check entitlement
let isPremium = try await MRRCat.shared.hasEntitlement("premium")

// Make a purchase
let products = try await MRRCat.shared.products(productIDs: ["com.app.premium_monthly"])
if let product = products.first {
    let info = try await MRRCat.shared.purchase(product)
}
```

### Android (Kotlin)

```kotlin
import com.mrrcat.sdk.MRRCat

// Configure
MRRCat.configure(context, "pk_live_xxxxx")

// Check entitlement
lifecycleScope.launch {
    val isPremium = MRRCat.shared.hasEntitlement("premium")
}

// Make a purchase
MRRCat.shared.purchase(activity, product)
```

### Web (JavaScript/TypeScript)

```typescript
import MRRCat from '@mrrcat/web';

// Configure
MRRCat.configure({ apiKey: 'pk_live_xxxxx' });

// Check entitlement
const isPremium = await MRRCat.shared.hasEntitlement('premium');

// Sync Stripe subscription
await MRRCat.shared.syncStripeSubscription('sub_xxxxx');
```

### Flutter

```dart
import 'package:mrrcat_flutter/mrrcat_flutter.dart';

// Configure
await MRRCat.configure(apiKey: 'pk_live_xxxxx');

// Check entitlement
final isPremium = await MRRCat.instance.hasEntitlement('premium');

// Make a purchase
final products = await MRRCat.instance.getProducts({'com.app.premium_monthly'});
final info = await MRRCat.instance.purchase(products.first);
```

### React Native

```typescript
import MRRCat, { useEntitlement } from 'react-native-mrrcat';

// Configure
await MRRCat.configure({ apiKey: 'pk_live_xxxxx' });

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
    .package(url: "https://github.com/minerd/mrrcat.git", from: "1.0.0")
]
```

### Android (Gradle)

```kotlin
// build.gradle.kts
dependencies {
    implementation("com.mrrcat:sdk:1.0.0")
}
```

### Web (npm)

```bash
npm install @mrrcat/web
```

### Flutter

```yaml
# pubspec.yaml
dependencies:
  mrrcat_flutter: ^1.0.0
```

### React Native

```bash
npm install react-native-mrrcat react-native-iap @react-native-async-storage/async-storage
```

## Server-Side Integration

For server-side verification and webhooks, see the [API Documentation](../docs/api.md).

## Support

- GitHub Issues: https://github.com/minerd/mrrcat/issues
- Documentation: https://mrrcat.dev/docs
