import Foundation

// MARK: - Subscriber Info

@available(iOS 14.0, macOS 11.0, tvOS 14.0, watchOS 7.0, *)
public struct SubscriberInfo: Codable, Sendable {
    /// Original app user ID
    public let originalAppUserID: String

    /// First seen date
    public let firstSeen: Date

    /// Active subscriptions keyed by product ID
    public let subscriptions: [String: Subscription]

    /// Active entitlements keyed by identifier
    public let entitlements: [String: Entitlement]

    /// Check if any entitlement is active
    public var hasActiveEntitlement: Bool {
        return entitlements.values.contains { $0.isActive }
    }

    /// Get all active entitlement identifiers
    public var activeEntitlements: [String] {
        return entitlements.filter { $0.value.isActive }.map { $0.key }
    }

    init(from response: SubscriberData) {
        self.originalAppUserID = response.originalAppUserId
        self.firstSeen = ISO8601DateFormatter().date(from: response.firstSeen) ?? Date()

        var subs: [String: Subscription] = [:]
        for (key, value) in response.subscriptions {
            subs[key] = Subscription(from: value)
        }
        self.subscriptions = subs

        var ents: [String: Entitlement] = [:]
        for (key, value) in response.entitlements {
            ents[key] = Entitlement(from: value)
        }
        self.entitlements = ents
    }
}

// MARK: - Subscription

@available(iOS 14.0, macOS 11.0, tvOS 14.0, watchOS 7.0, *)
public struct Subscription: Codable, Sendable {
    public let platform: Platform
    public let productID: String
    public let status: SubscriptionStatus
    public let purchaseDate: Date
    public let expiresDate: Date?
    public let isSandbox: Bool
    public let isTrialPeriod: Bool
    public let willRenew: Bool
    public let gracePeriodExpiresDate: Date?

    /// Check if subscription is currently active
    public var isActive: Bool {
        switch status {
        case .active, .gracePeriod:
            return true
        default:
            if let expires = expiresDate {
                return Date() < expires
            }
            return false
        }
    }

    init(from response: SubscriptionData) {
        self.platform = Platform(rawValue: response.platform) ?? .unknown
        self.productID = response.productId
        self.status = SubscriptionStatus(rawValue: response.status) ?? .unknown
        self.purchaseDate = ISO8601DateFormatter().date(from: response.purchaseDate) ?? Date()
        self.expiresDate = response.expiresDate.flatMap { ISO8601DateFormatter().date(from: $0) }
        self.isSandbox = response.isSandbox
        self.isTrialPeriod = response.isTrialPeriod
        self.willRenew = response.willRenew
        self.gracePeriodExpiresDate = response.gracePeriodExpiresDate.flatMap { ISO8601DateFormatter().date(from: $0) }
    }
}

// MARK: - Entitlement

@available(iOS 14.0, macOS 11.0, tvOS 14.0, watchOS 7.0, *)
public struct Entitlement: Codable, Sendable {
    public let isActive: Bool
    public let productIdentifier: String
    public let expiresDate: Date?

    init(from response: EntitlementData) {
        self.isActive = response.isActive
        self.productIdentifier = response.productIdentifier
        self.expiresDate = response.expiresDate.flatMap { ISO8601DateFormatter().date(from: $0) }
    }
}

// MARK: - Enums

public enum Platform: String, Codable, Sendable {
    case ios
    case android
    case stripe
    case unknown
}

public enum SubscriptionStatus: String, Codable, Sendable {
    case active
    case expired
    case cancelled
    case gracePeriod = "grace_period"
    case paused
    case billingRetry = "billing_retry"
    case unknown
}

// MARK: - API Response Models

struct SubscriberResponse: Codable {
    let subscriber: SubscriberData
}

struct SubscriberData: Codable {
    let originalAppUserId: String
    let firstSeen: String
    let subscriptions: [String: SubscriptionData]
    let entitlements: [String: EntitlementData]
}

struct SubscriptionData: Codable {
    let platform: String
    let productId: String
    let status: String
    let purchaseDate: String
    let expiresDate: String?
    let isSandbox: Bool
    let isTrialPeriod: Bool
    let willRenew: Bool
    let gracePeriodExpiresDate: String?
}

struct EntitlementData: Codable {
    let isActive: Bool
    let productIdentifier: String
    let expiresDate: String?
}

struct ReceiptResponse: Codable {
    let subscriber: SubscriberData
}

struct APIError: Codable {
    let error: APIErrorDetail
}

struct APIErrorDetail: Codable {
    let code: String
    let message: String
}

// MARK: - Offerings

/// Collection of offerings configured in PayCat dashboard
@available(iOS 14.0, macOS 11.0, tvOS 14.0, watchOS 7.0, *)
public struct Offerings: Sendable {
    /// Current offering for this user/context
    public let current: Offering?

    /// All available offerings keyed by identifier
    public let all: [String: Offering]

    init(from response: OfferingsResponse) {
        var allOfferings: [String: Offering] = [:]
        var currentOffering: Offering?

        for offeringData in response.offerings {
            let offering = Offering(from: offeringData)
            allOfferings[offering.identifier] = offering

            if offeringData.identifier == response.currentOfferingId {
                currentOffering = offering
            }
        }

        self.all = allOfferings
        self.current = currentOffering
    }
}

/// A single offering containing packages
@available(iOS 14.0, macOS 11.0, tvOS 14.0, watchOS 7.0, *)
public struct Offering: Sendable {
    /// Unique identifier for this offering
    public let identifier: String

    /// Display name (optional)
    public let displayName: String?

    /// Description (optional)
    public let description: String?

    /// Whether this is the current offering
    public let isCurrent: Bool

    /// Custom metadata
    public let metadata: [String: String]

    /// Available packages in this offering
    public let availablePackages: [Package]

    /// Get package by type
    public func package(for type: PackageType) -> Package? {
        return availablePackages.first { $0.packageType == type }
    }

    /// Monthly package shortcut
    public var monthly: Package? { package(for: .monthly) }

    /// Annual package shortcut
    public var annual: Package? { package(for: .annual) }

    /// Lifetime package shortcut
    public var lifetime: Package? { package(for: .lifetime) }

    /// Weekly package shortcut
    public var weekly: Package? { package(for: .weekly) }

    init(from data: OfferingData) {
        self.identifier = data.identifier
        self.displayName = data.displayName
        self.description = data.description
        self.isCurrent = data.isCurrent ?? false
        self.metadata = data.metadata ?? [:]
        self.availablePackages = data.availablePackages.map { Package(from: $0) }
    }
}

/// A package containing products
@available(iOS 14.0, macOS 11.0, tvOS 14.0, watchOS 7.0, *)
public struct Package: Sendable {
    /// Unique identifier for this package
    public let identifier: String

    /// Display name (optional)
    public let displayName: String?

    /// Description (optional)
    public let description: String?

    /// Package type (monthly, annual, etc.)
    public let packageType: PackageType

    /// Products in this package
    public let products: [ProductInfo]

    init(from data: PackageData) {
        self.identifier = data.identifier
        self.displayName = data.displayName
        self.description = data.description
        self.packageType = PackageType(rawValue: data.packageType) ?? .custom
        self.products = data.products.map { ProductInfo(from: $0) }
    }
}

/// Product information from PayCat
@available(iOS 14.0, macOS 11.0, tvOS 14.0, watchOS 7.0, *)
public struct ProductInfo: Sendable {
    /// Store product ID (e.g., "com.app.premium_monthly")
    public let storeProductId: String

    /// Platform this product is for
    public let platform: Platform

    /// Display name (optional)
    public let displayName: String?

    /// Description (optional)
    public let description: String?

    /// Product type
    public let productType: ProductType

    /// Default price (for display before StoreKit fetch)
    public let price: Price?

    /// Subscription period (ISO 8601 duration)
    public let subscriptionPeriod: String?

    /// Trial period (ISO 8601 duration)
    public let trialPeriod: String?

    /// Custom metadata
    public let metadata: [String: String]

    init(from data: ProductData) {
        self.storeProductId = data.storeProductId
        self.platform = Platform(rawValue: data.platform) ?? .unknown
        self.displayName = data.displayName
        self.description = data.description
        self.productType = ProductType(rawValue: data.productType) ?? .subscription
        self.price = data.price.map { Price(amount: $0.amount, currency: $0.currency) }
        self.subscriptionPeriod = data.subscriptionPeriod
        self.trialPeriod = data.trialPeriod
        self.metadata = data.metadata ?? [:]
    }
}

/// Price information
public struct Price: Sendable {
    /// Amount in cents
    public let amount: Int

    /// Currency code (e.g., "USD")
    public let currency: String

    /// Formatted price string
    public var formatted: String {
        let formatter = NumberFormatter()
        formatter.numberStyle = .currency
        formatter.currencyCode = currency
        return formatter.string(from: NSNumber(value: Double(amount) / 100.0)) ?? "\(currency) \(Double(amount) / 100.0)"
    }
}

/// Package type enum
public enum PackageType: String, Codable, Sendable {
    case weekly
    case monthly
    case twoMonth = "two_month"
    case threeMonth = "three_month"
    case sixMonth = "six_month"
    case annual
    case lifetime
    case custom
}

/// Product type enum
public enum ProductType: String, Codable, Sendable {
    case subscription
    case consumable
    case nonConsumable = "non_consumable"
}

// MARK: - Offerings API Response Models

struct OfferingsResponse: Codable {
    let currentOfferingId: String?
    let offerings: [OfferingData]
}

struct OfferingData: Codable {
    let identifier: String
    let displayName: String?
    let description: String?
    let isCurrent: Bool?
    let metadata: [String: String]?
    let availablePackages: [PackageData]
}

struct PackageData: Codable {
    let identifier: String
    let displayName: String?
    let description: String?
    let packageType: String
    let products: [ProductData]
}

struct ProductData: Codable {
    let storeProductId: String
    let platform: String
    let displayName: String?
    let description: String?
    let productType: String
    let price: PriceData?
    let subscriptionPeriod: String?
    let trialPeriod: String?
    let metadata: [String: String]?
}

struct PriceData: Codable {
    let amount: Int
    let currency: String
}
