# PayCat iOS SDK

Swift SDK for PayCat subscription management on iOS, macOS, tvOS, and watchOS.

## Requirements

- iOS 14.0+ / macOS 11.0+ / tvOS 14.0+ / watchOS 7.0+
- Swift 5.5+
- Xcode 13.0+

## Installation

### Swift Package Manager

Add PayCat to your `Package.swift`:

```swift
dependencies: [
    .package(url: "https://github.com/minerd/paycat.git", from: "1.0.0")
]
```

Or in Xcode: File > Add Packages > Enter repository URL.

## Quick Start

### 1. Configure SDK

Configure PayCat as early as possible, typically in your App's init:

```swift
import PayCat

@main
struct MyApp: App {
    init() {
        Task {
            do {
                try await PayCat.configure(apiKey: "pk_live_xxxxx")
            } catch {
                print("PayCat configuration failed: \(error)")
            }
        }
    }
}
```

### 2. Check Entitlements

```swift
// Check specific entitlement
let isPremium = try await PayCat.shared.hasEntitlement("premium")

// Get all active entitlements
let info = try await PayCat.shared.getSubscriberInfo()
let activeEntitlements = info.activeEntitlements
```

### 3. Display Products

```swift
let productIDs: Set<String> = ["com.app.premium_monthly", "com.app.premium_yearly"]
let products = try await PayCat.shared.products(productIDs: productIDs)

for product in products {
    print("\(product.displayName): \(product.displayPrice)")
}
```

### 4. Make a Purchase

```swift
do {
    let info = try await PayCat.shared.purchase(product)
    if info.hasActiveEntitlement {
        // Purchase successful!
    }
} catch PayCatError.purchaseCancelled {
    // User cancelled
} catch {
    print("Purchase failed: \(error)")
}
```

### 5. Restore Purchases

```swift
let info = try await PayCat.shared.restorePurchases()
```

## User Management

### Anonymous Users

By default, PayCat creates an anonymous user ID. This is stored securely and persists across app launches.

### Identified Users

When a user logs in to your app:

```swift
let info = try await PayCat.shared.identify(appUserID: "user_12345")
```

When they log out:

```swift
let info = try await PayCat.shared.logOut()
```

## Observing Updates

Subscribe to real-time subscriber info updates:

```swift
for await info in PayCat.shared.subscriberInfoStream {
    updateUI(with: info)
}
```

Or use the publisher:

```swift
PayCat.shared.subscriberInfoPublisher
    .sink { info in
        updateUI(with: info)
    }
    .store(in: &cancellables)
```

## SwiftUI Integration

```swift
struct ContentView: View {
    @State private var isPremium = false

    var body: some View {
        Group {
            if isPremium {
                PremiumContent()
            } else {
                PaywallView()
            }
        }
        .task {
            do {
                isPremium = try await PayCat.shared.hasEntitlement("premium")
            } catch {
                // Handle error
            }
        }
    }
}
```

## Error Handling

```swift
do {
    let info = try await PayCat.shared.purchase(product)
} catch PayCatError.notConfigured {
    // SDK not configured
} catch PayCatError.purchaseCancelled {
    // User cancelled purchase
} catch PayCatError.verificationFailed {
    // StoreKit verification failed
} catch PayCatError.productNotFound(let productID) {
    // Product not available
} catch PayCatError.apiError(let code, let message) {
    // API error occurred
} catch {
    // Unknown error
}
```

## Sandbox Testing

The SDK automatically detects sandbox mode. Test purchases work the same way as production purchases.

## API Reference

### PayCat

| Method | Description |
|--------|-------------|
| `configure(apiKey:appUserID:baseURL:)` | Initialize SDK |
| `getSubscriberInfo(forceRefresh:)` | Get subscriber info |
| `hasEntitlement(_:)` | Check entitlement status |
| `products(productIDs:)` | Get available products |
| `purchase(_:)` | Purchase a product |
| `restorePurchases()` | Restore purchases |
| `identify(appUserID:)` | Set user ID |
| `logOut()` | Switch to anonymous user |

### SubscriberInfo

| Property | Type | Description |
|----------|------|-------------|
| `originalAppUserID` | `String` | User identifier |
| `firstSeen` | `Date` | First seen date |
| `subscriptions` | `[String: Subscription]` | Active subscriptions |
| `entitlements` | `[String: Entitlement]` | Entitlements |
| `hasActiveEntitlement` | `Bool` | Has any active entitlement |
| `activeEntitlements` | `[String]` | Active entitlement IDs |

## License

MIT License
