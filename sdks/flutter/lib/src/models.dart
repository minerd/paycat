/// Subscriber information
class SubscriberInfo {
  final String originalAppUserID;
  final DateTime firstSeen;
  final Map<String, Subscription> subscriptions;
  final Map<String, Entitlement> entitlements;

  SubscriberInfo({
    required this.originalAppUserID,
    required this.firstSeen,
    required this.subscriptions,
    required this.entitlements,
  });

  /// Check if any entitlement is active
  bool get hasActiveEntitlement => entitlements.values.any((e) => e.isActive);

  /// Get all active entitlement identifiers
  List<String> get activeEntitlements =>
      entitlements.entries.where((e) => e.value.isActive).map((e) => e.key).toList();

  factory SubscriberInfo.fromJson(Map<String, dynamic> json) {
    return SubscriberInfo(
      originalAppUserID: json['original_app_user_id'] ?? '',
      firstSeen: DateTime.tryParse(json['first_seen'] ?? '') ?? DateTime.now(),
      subscriptions: (json['subscriptions'] as Map<String, dynamic>? ?? {}).map(
        (key, value) => MapEntry(key, Subscription.fromJson(value)),
      ),
      entitlements: (json['entitlements'] as Map<String, dynamic>? ?? {}).map(
        (key, value) => MapEntry(key, Entitlement.fromJson(value)),
      ),
    );
  }

  Map<String, dynamic> toJson() => {
        'original_app_user_id': originalAppUserID,
        'first_seen': firstSeen.toIso8601String(),
        'subscriptions': subscriptions.map((k, v) => MapEntry(k, v.toJson())),
        'entitlements': entitlements.map((k, v) => MapEntry(k, v.toJson())),
      };
}

/// Subscription details
class Subscription {
  final PayCatPlatform platform;
  final String productID;
  final SubscriptionStatus status;
  final DateTime purchaseDate;
  final DateTime? expiresDate;
  final bool isSandbox;
  final bool isTrialPeriod;
  final bool willRenew;
  final DateTime? gracePeriodExpiresDate;

  Subscription({
    required this.platform,
    required this.productID,
    required this.status,
    required this.purchaseDate,
    this.expiresDate,
    required this.isSandbox,
    required this.isTrialPeriod,
    required this.willRenew,
    this.gracePeriodExpiresDate,
  });

  /// Check if subscription is currently active
  bool get isActive {
    switch (status) {
      case SubscriptionStatus.active:
      case SubscriptionStatus.gracePeriod:
        return true;
      default:
        if (expiresDate != null) {
          return DateTime.now().isBefore(expiresDate!);
        }
        return false;
    }
  }

  factory Subscription.fromJson(Map<String, dynamic> json) {
    return Subscription(
      platform: PayCatPlatform.fromString(json['platform'] ?? ''),
      productID: json['product_id'] ?? '',
      status: SubscriptionStatus.fromString(json['status'] ?? ''),
      purchaseDate: DateTime.tryParse(json['purchase_date'] ?? '') ?? DateTime.now(),
      expiresDate: json['expires_date'] != null ? DateTime.tryParse(json['expires_date']) : null,
      isSandbox: json['is_sandbox'] ?? false,
      isTrialPeriod: json['is_trial_period'] ?? false,
      willRenew: json['will_renew'] ?? false,
      gracePeriodExpiresDate: json['grace_period_expires_date'] != null
          ? DateTime.tryParse(json['grace_period_expires_date'])
          : null,
    );
  }

  Map<String, dynamic> toJson() => {
        'platform': platform.name,
        'product_id': productID,
        'status': status.name,
        'purchase_date': purchaseDate.toIso8601String(),
        'expires_date': expiresDate?.toIso8601String(),
        'is_sandbox': isSandbox,
        'is_trial_period': isTrialPeriod,
        'will_renew': willRenew,
        'grace_period_expires_date': gracePeriodExpiresDate?.toIso8601String(),
      };
}

/// Entitlement details
class Entitlement {
  final bool isActive;
  final String productIdentifier;
  final DateTime? expiresDate;

  Entitlement({
    required this.isActive,
    required this.productIdentifier,
    this.expiresDate,
  });

  factory Entitlement.fromJson(Map<String, dynamic> json) {
    return Entitlement(
      isActive: json['is_active'] ?? false,
      productIdentifier: json['product_identifier'] ?? '',
      expiresDate: json['expires_date'] != null ? DateTime.tryParse(json['expires_date']) : null,
    );
  }

  Map<String, dynamic> toJson() => {
        'is_active': isActive,
        'product_identifier': productIdentifier,
        'expires_date': expiresDate?.toIso8601String(),
      };
}

/// Platform types
enum PayCatPlatform {
  ios,
  android,
  stripe,
  unknown;

  static PayCatPlatform fromString(String value) {
    switch (value.toLowerCase()) {
      case 'ios':
        return PayCatPlatform.ios;
      case 'android':
        return PayCatPlatform.android;
      case 'stripe':
        return PayCatPlatform.stripe;
      default:
        return PayCatPlatform.unknown;
    }
  }
}

/// Subscription status types
enum SubscriptionStatus {
  active,
  expired,
  cancelled,
  gracePeriod,
  paused,
  billingRetry,
  unknown;

  static SubscriptionStatus fromString(String value) {
    switch (value.toLowerCase()) {
      case 'active':
        return SubscriptionStatus.active;
      case 'expired':
        return SubscriptionStatus.expired;
      case 'cancelled':
        return SubscriptionStatus.cancelled;
      case 'grace_period':
        return SubscriptionStatus.gracePeriod;
      case 'paused':
        return SubscriptionStatus.paused;
      case 'billing_retry':
        return SubscriptionStatus.billingRetry;
      default:
        return SubscriptionStatus.unknown;
    }
  }
}

/// Package types
enum PackageType {
  weekly,
  monthly,
  twoMonth,
  threeMonth,
  sixMonth,
  annual,
  lifetime,
  custom;

  static PackageType fromString(String value) {
    switch (value.toLowerCase()) {
      case 'weekly':
        return PackageType.weekly;
      case 'monthly':
        return PackageType.monthly;
      case 'two_month':
        return PackageType.twoMonth;
      case 'three_month':
        return PackageType.threeMonth;
      case 'six_month':
        return PackageType.sixMonth;
      case 'annual':
        return PackageType.annual;
      case 'lifetime':
        return PackageType.lifetime;
      default:
        return PackageType.custom;
    }
  }
}

/// Product types
enum ProductType {
  subscription,
  consumable,
  nonConsumable;

  static ProductType fromString(String value) {
    switch (value.toLowerCase()) {
      case 'subscription':
        return ProductType.subscription;
      case 'consumable':
        return ProductType.consumable;
      case 'non_consumable':
        return ProductType.nonConsumable;
      default:
        return ProductType.subscription;
    }
  }
}

/// Offerings collection
class Offerings {
  final Offering? current;
  final Map<String, Offering> all;

  Offerings({this.current, required this.all});

  factory Offerings.fromJson(Map<String, dynamic> json) {
    final currentOfferingId = json['current_offering_id'] as String?;
    final offeringsList = (json['offerings'] as List<dynamic>? ?? [])
        .map((e) => Offering.fromJson(e))
        .toList();

    final allOfferings = <String, Offering>{};
    Offering? currentOffering;

    for (final offering in offeringsList) {
      allOfferings[offering.identifier] = offering;
      if (offering.identifier == currentOfferingId) {
        currentOffering = offering;
      }
    }

    return Offerings(current: currentOffering, all: allOfferings);
  }
}

/// A single offering
class Offering {
  final String identifier;
  final String? displayName;
  final String? description;
  final bool isCurrent;
  final Map<String, dynamic> metadata;
  final List<Package> availablePackages;

  Offering({
    required this.identifier,
    this.displayName,
    this.description,
    this.isCurrent = false,
    this.metadata = const {},
    this.availablePackages = const [],
  });

  /// Get package by type
  Package? package(PackageType type) {
    return availablePackages.cast<Package?>().firstWhere(
          (p) => p?.packageType == type,
          orElse: () => null,
        );
  }

  /// Monthly package shortcut
  Package? get monthly => package(PackageType.monthly);

  /// Annual package shortcut
  Package? get annual => package(PackageType.annual);

  /// Lifetime package shortcut
  Package? get lifetime => package(PackageType.lifetime);

  /// Weekly package shortcut
  Package? get weekly => package(PackageType.weekly);

  factory Offering.fromJson(Map<String, dynamic> json) {
    return Offering(
      identifier: json['identifier'] ?? '',
      displayName: json['display_name'],
      description: json['description'],
      isCurrent: json['is_current'] ?? false,
      metadata: (json['metadata'] as Map<String, dynamic>?) ?? {},
      availablePackages: (json['available_packages'] as List<dynamic>? ?? [])
          .map((e) => Package.fromJson(e))
          .toList(),
    );
  }
}

/// A package containing products
class Package {
  final String identifier;
  final String? displayName;
  final String? description;
  final PackageType packageType;
  final List<ProductInfo> products;

  Package({
    required this.identifier,
    this.displayName,
    this.description,
    required this.packageType,
    this.products = const [],
  });

  factory Package.fromJson(Map<String, dynamic> json) {
    return Package(
      identifier: json['identifier'] ?? '',
      displayName: json['display_name'],
      description: json['description'],
      packageType: PackageType.fromString(json['package_type'] ?? ''),
      products: (json['products'] as List<dynamic>? ?? [])
          .map((e) => ProductInfo.fromJson(e))
          .toList(),
    );
  }
}

/// Product information from PayCat
class ProductInfo {
  final String storeProductId;
  final PayCatPlatform platform;
  final String? displayName;
  final String? description;
  final ProductType productType;
  final Price? price;
  final String? subscriptionPeriod;
  final String? trialPeriod;
  final Map<String, dynamic> metadata;

  ProductInfo({
    required this.storeProductId,
    required this.platform,
    this.displayName,
    this.description,
    required this.productType,
    this.price,
    this.subscriptionPeriod,
    this.trialPeriod,
    this.metadata = const {},
  });

  factory ProductInfo.fromJson(Map<String, dynamic> json) {
    return ProductInfo(
      storeProductId: json['store_product_id'] ?? json['identifier'] ?? '',
      platform: PayCatPlatform.fromString(json['platform'] ?? ''),
      displayName: json['display_name'],
      description: json['description'],
      productType: ProductType.fromString(json['product_type'] ?? ''),
      price: json['price'] != null ? Price.fromJson(json['price']) : null,
      subscriptionPeriod: json['subscription_period'],
      trialPeriod: json['trial_period'],
      metadata: (json['metadata'] as Map<String, dynamic>?) ?? {},
    );
  }
}

/// Price information
class Price {
  final int amount;
  final String currency;

  Price({required this.amount, required this.currency});

  /// Formatted price string
  String get formatted {
    final value = amount / 100.0;
    return '$currency ${value.toStringAsFixed(2)}';
  }

  factory Price.fromJson(Map<String, dynamic> json) {
    return Price(
      amount: json['amount'] ?? 0,
      currency: json['currency'] ?? 'USD',
    );
  }
}
