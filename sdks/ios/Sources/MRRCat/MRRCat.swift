import Foundation
import StoreKit

/// MRRCat SDK for iOS
/// Unified subscription management across platforms
@available(iOS 14.0, macOS 11.0, tvOS 14.0, watchOS 7.0, *)
public final class MRRCat: @unchecked Sendable {

    // MARK: - Singleton

    /// Shared instance of MRRCat
    public static let shared = MRRCat()

    // MARK: - Properties

    private var apiKey: String?
    private var appUserID: String?
    private var baseURL: String = ""
    private var isConfigured: Bool = false
    private var cachedSubscriberInfo: SubscriberInfo?
    private var cacheExpiry: Date?
    private let cacheDuration: TimeInterval = 300 // 5 minutes

    /// Delegate for receiving updates
    public weak var delegate: MRRCatDelegate?

    /// Current subscriber info (cached)
    public var subscriberInfo: SubscriberInfo? {
        return cachedSubscriberInfo
    }

    /// Current app user ID
    public var currentAppUserID: String? {
        return appUserID
    }

    // MARK: - Configuration

    private init() {}

    /// Configure MRRCat with your API key
    /// - Parameters:
    ///   - apiKey: Your MRRCat API key
    ///   - baseURL: Your MRRCat API URL (e.g., "https://mrrcat.yourdomain.com")
    ///   - appUserID: Optional user ID. If nil, an anonymous ID will be generated
    public func configure(
        apiKey: String,
        baseURL: String,
        appUserID: String? = nil
    ) {
        self.apiKey = apiKey
        self.baseURL = baseURL
        self.appUserID = appUserID ?? generateAnonymousID()
        self.isConfigured = true

        // Start listening for StoreKit transactions
        startTransactionListener()

        // Fetch initial subscriber info
        Task {
            try? await refreshSubscriberInfo()
        }
    }

    /// Change the current app user ID (for login/logout)
    /// - Parameter appUserID: New user ID, or nil for anonymous
    public func identify(appUserID: String?) async throws {
        self.appUserID = appUserID ?? generateAnonymousID()
        self.cachedSubscriberInfo = nil
        self.cacheExpiry = nil
        try await refreshSubscriberInfo()
    }

    /// Reset to anonymous user (logout)
    public func logOut() async throws {
        try await identify(appUserID: nil)
    }

    // MARK: - Subscriber Info

    /// Get current subscriber info
    /// - Parameter forceRefresh: Force refresh from server
    /// - Returns: SubscriberInfo
    public func getSubscriberInfo(forceRefresh: Bool = false) async throws -> SubscriberInfo {
        guard isConfigured, let _ = apiKey, let userID = appUserID else {
            throw MRRCatError.notConfigured
        }

        // Return cached if valid
        if !forceRefresh,
           let cached = cachedSubscriberInfo,
           let expiry = cacheExpiry,
           Date() < expiry {
            return cached
        }

        return try await refreshSubscriberInfo()
    }

    /// Check if user has active entitlement
    /// - Parameter identifier: Entitlement identifier (e.g., "premium")
    /// - Returns: True if entitlement is active
    public func hasEntitlement(_ identifier: String) async throws -> Bool {
        let info = try await getSubscriberInfo()
        return info.entitlements[identifier]?.isActive ?? false
    }

    @discardableResult
    private func refreshSubscriberInfo() async throws -> SubscriberInfo {
        guard let userID = appUserID else {
            throw MRRCatError.notConfigured
        }

        let info = try await apiRequest(
            method: "GET",
            path: "/v1/subscribers/\(userID)"
        ) as SubscriberResponse

        let subscriberInfo = SubscriberInfo(from: info.subscriber)
        self.cachedSubscriberInfo = subscriberInfo
        self.cacheExpiry = Date().addingTimeInterval(cacheDuration)

        DispatchQueue.main.async {
            self.delegate?.mrrcat(self, didReceiveUpdated: subscriberInfo)
        }

        return subscriberInfo
    }

    // MARK: - Purchases

    /// Purchase a product
    /// - Parameter productID: StoreKit product identifier
    /// - Returns: Updated SubscriberInfo after purchase
    @available(iOS 15.0, macOS 12.0, tvOS 15.0, watchOS 8.0, *)
    public func purchase(productID: String) async throws -> SubscriberInfo {
        // Get product from StoreKit
        let products = try await Product.products(for: [productID])
        guard let product = products.first else {
            throw MRRCatError.productNotFound(productID)
        }

        return try await purchase(product: product)
    }

    /// Purchase a StoreKit Product
    /// - Parameter product: StoreKit Product
    /// - Returns: Updated SubscriberInfo after purchase
    @available(iOS 15.0, macOS 12.0, tvOS 15.0, watchOS 8.0, *)
    public func purchase(product: Product) async throws -> SubscriberInfo {
        let result = try await product.purchase()

        switch result {
        case .success(let verification):
            switch verification {
            case .verified(let transaction):
                // Sync with MRRCat backend
                try await syncTransaction(transaction)
                await transaction.finish()
                return try await getSubscriberInfo(forceRefresh: true)

            case .unverified(_, let error):
                throw MRRCatError.verificationFailed(error.localizedDescription)
            }

        case .userCancelled:
            throw MRRCatError.purchaseCancelled

        case .pending:
            throw MRRCatError.purchasePending

        @unknown default:
            throw MRRCatError.unknown
        }
    }

    /// Restore purchases
    /// - Returns: Updated SubscriberInfo
    @available(iOS 15.0, macOS 12.0, tvOS 15.0, watchOS 8.0, *)
    public func restorePurchases() async throws -> SubscriberInfo {
        // Sync all current entitlements
        for await result in Transaction.currentEntitlements {
            if case .verified(let transaction) = result {
                try await syncTransaction(transaction)
            }
        }

        return try await getSubscriberInfo(forceRefresh: true)
    }

    /// Sync a transaction with MRRCat backend
    @available(iOS 15.0, macOS 12.0, tvOS 15.0, watchOS 8.0, *)
    private func syncTransaction(_ transaction: Transaction) async throws {
        guard let userID = appUserID else {
            throw MRRCatError.notConfigured
        }

        let body: [String: Any] = [
            "app_user_id": userID,
            "platform": "ios",
            "receipt_data": [
                "transaction_id": String(transaction.id),
                "original_transaction_id": String(transaction.originalID),
                "product_id": transaction.productID
            ]
        ]

        let _: ReceiptResponse = try await apiRequest(
            method: "POST",
            path: "/v1/receipts",
            body: body
        )
    }

    // MARK: - Products

    /// Get available products from StoreKit
    /// - Parameter productIDs: Product identifiers to fetch
    /// - Returns: Array of Products
    @available(iOS 15.0, macOS 12.0, tvOS 15.0, watchOS 8.0, *)
    public func getProducts(productIDs: Set<String>) async throws -> [Product] {
        return try await Product.products(for: productIDs)
    }

    // MARK: - Offerings

    private var cachedOfferings: Offerings?
    private var offeringsCacheExpiry: Date?

    /// Get current offerings
    /// - Parameter forceRefresh: Force refresh from server
    /// - Returns: Offerings configuration
    public func getOfferings(forceRefresh: Bool = false) async throws -> Offerings {
        guard isConfigured, let _ = apiKey else {
            throw MRRCatError.notConfigured
        }

        // Return cached if valid
        if !forceRefresh,
           let cached = cachedOfferings,
           let expiry = offeringsCacheExpiry,
           Date() < expiry {
            return cached
        }

        return try await refreshOfferings()
    }

    /// Get current offering
    /// - Returns: Current offering or nil if none configured
    public func getCurrentOffering() async throws -> Offering? {
        let offerings = try await getOfferings()
        return offerings.current
    }

    /// Get offering by identifier
    /// - Parameter identifier: Offering identifier
    /// - Returns: Offering or nil if not found
    public func getOffering(identifier: String) async throws -> Offering? {
        let offerings = try await getOfferings()
        return offerings.all[identifier]
    }

    @discardableResult
    private func refreshOfferings() async throws -> Offerings {
        var queryParams = ""

        // Add targeting context
        if let userID = appUserID {
            queryParams += "?app_user_id=\(userID)"
        }

        let response = try await apiRequest(
            method: "GET",
            path: "/v1/offerings\(queryParams)"
        ) as OfferingsResponse

        let offerings = Offerings(from: response)
        self.cachedOfferings = offerings
        self.offeringsCacheExpiry = Date().addingTimeInterval(cacheDuration)

        return offerings
    }

    /// Get products for a specific package
    @available(iOS 15.0, macOS 12.0, tvOS 15.0, watchOS 8.0, *)
    public func getProducts(for package: Package) async throws -> [Product] {
        let productIDs = Set(package.products.map { $0.storeProductId })
        return try await Product.products(for: productIDs)
    }

    // MARK: - Transaction Listener

    private var transactionListenerTask: Task<Void, Never>?

    private func startTransactionListener() {
        guard #available(iOS 15.0, macOS 12.0, tvOS 15.0, watchOS 8.0, *) else {
            return
        }

        transactionListenerTask = Task.detached { [weak self] in
            for await result in Transaction.updates {
                guard let self = self else { return }

                if case .verified(let transaction) = result {
                    do {
                        try await self.syncTransaction(transaction)
                        await transaction.finish()
                        let info = try await self.getSubscriberInfo(forceRefresh: true)

                        await MainActor.run {
                            self.delegate?.mrrcat(self, didReceiveUpdated: info)
                        }
                    } catch {
                        await MainActor.run {
                            self.delegate?.mrrcat(self, didReceiveError: error)
                        }
                    }
                }
            }
        }
    }

    // MARK: - Helpers

    private func generateAnonymousID() -> String {
        if let stored = UserDefaults.standard.string(forKey: "mrrcat_anonymous_id") {
            return stored
        }
        let id = "$anon_\(UUID().uuidString.lowercased())"
        UserDefaults.standard.set(id, forKey: "mrrcat_anonymous_id")
        return id
    }

    private func apiRequest<T: Decodable>(
        method: String,
        path: String,
        body: [String: Any]? = nil
    ) async throws -> T {
        guard let apiKey = apiKey else {
            throw MRRCatError.notConfigured
        }

        guard let url = URL(string: baseURL + path) else {
            throw MRRCatError.invalidURL
        }

        var request = URLRequest(url: url)
        request.httpMethod = method
        request.setValue(apiKey, forHTTPHeaderField: "X-API-Key")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("MRRCat-iOS/1.0.0", forHTTPHeaderField: "User-Agent")

        if let body = body {
            request.httpBody = try JSONSerialization.data(withJSONObject: body)
        }

        let (data, response) = try await URLSession.shared.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse else {
            throw MRRCatError.networkError
        }

        guard 200...299 ~= httpResponse.statusCode else {
            if let error = try? JSONDecoder().decode(APIError.self, from: data) {
                throw MRRCatError.apiError(error.error.code, error.error.message)
            }
            throw MRRCatError.httpError(httpResponse.statusCode)
        }

        let decoder = JSONDecoder()
        decoder.keyDecodingStrategy = .convertFromSnakeCase
        return try decoder.decode(T.self, from: data)
    }
}

// MARK: - Delegate Protocol

@available(iOS 14.0, macOS 11.0, tvOS 14.0, watchOS 7.0, *)
public protocol MRRCatDelegate: AnyObject {
    func mrrcat(_ mrrcat: MRRCat, didReceiveUpdated subscriberInfo: SubscriberInfo)
    func mrrcat(_ mrrcat: MRRCat, didReceiveError error: Error)
}

// MARK: - Default Delegate Implementation

@available(iOS 14.0, macOS 11.0, tvOS 14.0, watchOS 7.0, *)
public extension MRRCatDelegate {
    func mrrcat(_ mrrcat: MRRCat, didReceiveError error: Error) {}
}
