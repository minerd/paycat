# PayCat Android SDK

Kotlin SDK for PayCat subscription management on Android.

## Requirements

- Android SDK 21+ (Android 5.0 Lollipop)
- Kotlin 1.8+

## Installation

### Gradle

Add to your app's `build.gradle.kts`:

```kotlin
dependencies {
    implementation("com.paycat:sdk:1.0.0")
}
```

## Quick Start

### 1. Configure SDK

Configure PayCat in your Application class:

```kotlin
import com.paycat.sdk.PayCat

class MyApplication : Application() {
    override fun onCreate() {
        super.onCreate()
        PayCat.configure(this, "pk_live_xxxxx")
    }
}
```

### 2. Check Entitlements

```kotlin
lifecycleScope.launch {
    val isPremium = PayCat.shared.hasEntitlement("premium")
    if (isPremium) {
        // Show premium content
    }
}
```

### 3. Display Products

```kotlin
lifecycleScope.launch {
    val products = PayCat.shared.getProducts(listOf(
        "com.app.premium_monthly",
        "com.app.premium_yearly"
    ))

    products.forEach { product ->
        println("${product.name}: ${product.formattedPrice}")
    }
}
```

### 4. Make a Purchase

```kotlin
try {
    val info = PayCat.shared.purchase(activity, product)
    if (info.hasActiveEntitlement) {
        // Purchase successful!
    }
} catch (e: PayCatException.PurchaseCancelled) {
    // User cancelled
} catch (e: PayCatException) {
    Log.e("PayCat", "Purchase failed: ${e.message}")
}
```

### 5. Restore Purchases

```kotlin
val info = PayCat.shared.restorePurchases()
```

## User Management

### Anonymous Users

By default, PayCat creates an anonymous user ID stored in SharedPreferences.

### Identified Users

When a user logs in:

```kotlin
val info = PayCat.shared.identify("user_12345")
```

When they log out:

```kotlin
val info = PayCat.shared.logOut()
```

## Observing Updates

Use StateFlow for reactive updates:

```kotlin
lifecycleScope.launch {
    PayCat.shared.subscriberInfo.collect { info ->
        info?.let { updateUI(it) }
    }
}
```

Or observe connection state:

```kotlin
PayCat.shared.connectionState.collect { state ->
    when (state) {
        ConnectionState.Connected -> // Ready to purchase
        ConnectionState.Disconnected -> // Not connected
        ConnectionState.Connecting -> // Connecting...
    }
}
```

## Jetpack Compose Integration

```kotlin
@Composable
fun PremiumGate(
    content: @Composable () -> Unit
) {
    val subscriberInfo by PayCat.shared.subscriberInfo.collectAsState()
    val isPremium = subscriberInfo?.entitlements?.get("premium")?.isActive == true

    if (isPremium) {
        content()
    } else {
        PaywallScreen()
    }
}
```

## Error Handling

```kotlin
try {
    val info = PayCat.shared.purchase(activity, product)
} catch (e: PayCatException.NotConfigured) {
    // SDK not configured
} catch (e: PayCatException.PurchaseCancelled) {
    // User cancelled purchase
} catch (e: PayCatException.BillingUnavailable) {
    // Play Store not available
} catch (e: PayCatException.ProductNotFound) {
    // Product not found
} catch (e: PayCatException.ApiError) {
    // API error: ${e.code} - ${e.message}
} catch (e: PayCatException) {
    // Other error
}
```

## ProGuard Rules

If you use ProGuard, add these rules:

```proguard
-keep class com.paycat.sdk.** { *; }
-keepclassmembers class com.paycat.sdk.** { *; }
```

## API Reference

### PayCat

| Method | Description |
|--------|-------------|
| `configure(context, apiKey, appUserID?, baseURL?)` | Initialize SDK |
| `getSubscriberInfo(forceRefresh)` | Get subscriber info |
| `hasEntitlement(identifier)` | Check entitlement |
| `getProducts(productIds)` | Get available products |
| `purchase(activity, product)` | Purchase product |
| `restorePurchases()` | Restore purchases |
| `identify(appUserID)` | Set user ID |
| `logOut()` | Switch to anonymous |

### SubscriberInfo

| Property | Type | Description |
|----------|------|-------------|
| `originalAppUserID` | `String` | User identifier |
| `firstSeen` | `Date` | First seen date |
| `subscriptions` | `Map<String, Subscription>` | Active subscriptions |
| `entitlements` | `Map<String, Entitlement>` | Entitlements |
| `hasActiveEntitlement` | `Boolean` | Has any active |
| `activeEntitlements` | `List<String>` | Active IDs |

## License

MIT License
