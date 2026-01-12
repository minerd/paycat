# MRRCat Flutter SDK

Flutter SDK for MRRCat subscription management on iOS and Android.

## Requirements

- Flutter 3.10.0+
- Dart SDK 3.0.0+
- iOS 11.0+ / Android SDK 21+

## Installation

Add to your `pubspec.yaml`:

```yaml
dependencies:
  mrrcat_flutter: ^1.0.0
```

Then run:

```bash
flutter pub get
```

## Platform Setup

### iOS

Add to `ios/Runner/Info.plist`:

```xml
<key>SKAdNetworkItems</key>
<array>
  <!-- Add your SKAdNetwork IDs -->
</array>
```

### Android

Add to `android/app/build.gradle`:

```groovy
dependencies {
    implementation 'com.android.billingclient:billing:6.1.0'
}
```

## Quick Start

### 1. Configure SDK

```dart
import 'package:mrrcat_flutter/mrrcat_flutter.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();

  await MRRCat.configure(apiKey: 'pk_live_xxxxx');

  runApp(MyApp());
}
```

### 2. Check Entitlements

```dart
// Check specific entitlement
final isPremium = await MRRCat.instance.hasEntitlement('premium');

// Get subscriber info
final info = await MRRCat.instance.getSubscriberInfo();
print(info.activeEntitlements);
```

### 3. Display Products

```dart
final products = await MRRCat.instance.getProducts({
  'com.app.premium_monthly',
  'com.app.premium_yearly',
});

for (final product in products) {
  print('${product.title}: ${product.price}');
}
```

### 4. Make a Purchase

```dart
try {
  final info = await MRRCat.instance.purchase(product);
  if (info.hasActiveEntitlement) {
    // Purchase successful!
  }
} on MRRCatPurchaseCancelledException {
  // User cancelled
} on MRRCatException catch (e) {
  print('Purchase failed: ${e.message}');
}
```

### 5. Restore Purchases

```dart
final info = await MRRCat.instance.restorePurchases();
```

## User Management

### Anonymous Users

By default, MRRCat creates an anonymous user ID stored in SharedPreferences.

### Identified Users

When a user logs in:

```dart
final info = await MRRCat.instance.identify('user_12345');
```

When they log out:

```dart
final info = await MRRCat.instance.logOut();
```

## Observing Updates

Listen to subscriber info stream:

```dart
MRRCat.instance.subscriberInfoStream.listen((info) {
  setState(() {
    _subscriberInfo = info;
  });
});
```

## Widget Examples

### Premium Gate Widget

```dart
class PremiumGate extends StatelessWidget {
  final Widget child;
  final Widget fallback;

  const PremiumGate({
    required this.child,
    required this.fallback,
  });

  @override
  Widget build(BuildContext context) {
    return StreamBuilder<SubscriberInfo>(
      stream: MRRCat.instance.subscriberInfoStream,
      initialData: MRRCat.instance.subscriberInfo,
      builder: (context, snapshot) {
        final info = snapshot.data;
        if (info?.hasActiveEntitlement ?? false) {
          return child;
        }
        return fallback;
      },
    );
  }
}

// Usage
PremiumGate(
  child: PremiumFeature(),
  fallback: PaywallScreen(),
)
```

### Entitlement Consumer

```dart
class EntitlementConsumer extends StatefulWidget {
  final String entitlementId;
  final Widget Function(bool isActive) builder;

  const EntitlementConsumer({
    required this.entitlementId,
    required this.builder,
  });

  @override
  State<EntitlementConsumer> createState() => _EntitlementConsumerState();
}

class _EntitlementConsumerState extends State<EntitlementConsumer> {
  bool _isActive = false;
  StreamSubscription? _subscription;

  @override
  void initState() {
    super.initState();
    _checkEntitlement();
    _subscription = MRRCat.instance.subscriberInfoStream.listen((_) {
      _checkEntitlement();
    });
  }

  Future<void> _checkEntitlement() async {
    final isActive = await MRRCat.instance.hasEntitlement(widget.entitlementId);
    if (mounted) {
      setState(() => _isActive = isActive);
    }
  }

  @override
  void dispose() {
    _subscription?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => widget.builder(_isActive);
}
```

## Error Handling

```dart
try {
  final info = await MRRCat.instance.purchase(product);
} on MRRCatNotConfiguredException {
  // SDK not configured
} on MRRCatPurchaseCancelledException {
  // User cancelled purchase
} on MRRCatVerificationFailedException catch (e) {
  // Verification failed: ${e.message}
} on MRRCatApiException catch (e) {
  // API error: ${e.code} - ${e.message}
} on MRRCatHttpException catch (e) {
  // HTTP error: ${e.statusCode}
} on MRRCatNetworkException {
  // Network error
} on MRRCatException catch (e) {
  // Other error: ${e.message}
}
```

## Provider Integration

```dart
// Using Provider
class SubscriberInfoProvider extends ChangeNotifier {
  SubscriberInfo? _info;

  SubscriberInfo? get info => _info;
  bool get isPremium => _info?.hasActiveEntitlement ?? false;

  SubscriberInfoProvider() {
    _init();
  }

  Future<void> _init() async {
    _info = await MRRCat.instance.getSubscriberInfo();
    notifyListeners();

    MRRCat.instance.subscriberInfoStream.listen((info) {
      _info = info;
      notifyListeners();
    });
  }

  Future<void> refresh() async {
    _info = await MRRCat.instance.getSubscriberInfo(forceRefresh: true);
    notifyListeners();
  }
}
```

## API Reference

### MRRCat

| Method | Returns | Description |
|--------|---------|-------------|
| `configure({apiKey, appUserID?, baseURL?})` | `Future<MRRCat>` | Initialize SDK |
| `instance` | `MRRCat` | Get instance |
| `isConfigured` | `bool` | Check if configured |
| `appUserID` | `String` | Current user ID |
| `subscriberInfo` | `SubscriberInfo?` | Cached info |
| `subscriberInfoStream` | `Stream<SubscriberInfo>` | Updates stream |
| `getSubscriberInfo({forceRefresh?})` | `Future<SubscriberInfo>` | Get info |
| `hasEntitlement(id)` | `Future<bool>` | Check entitlement |
| `getProducts(ids)` | `Future<List<ProductDetails>>` | Get products |
| `purchase(product)` | `Future<SubscriberInfo>` | Make purchase |
| `restorePurchases()` | `Future<SubscriberInfo>` | Restore purchases |
| `identify(userID)` | `Future<SubscriberInfo>` | Set user ID |
| `logOut()` | `Future<SubscriberInfo>` | Switch to anonymous |
| `dispose()` | `void` | Clean up resources |

## License

MIT License
