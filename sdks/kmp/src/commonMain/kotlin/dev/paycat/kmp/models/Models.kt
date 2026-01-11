package dev.paycat.kmp.models

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/**
 * Configuration options for PayCat SDK
 */
data class PayCatConfiguration(
    val apiKey: String,
    val appUserId: String? = null,
    val observerMode: Boolean = false,
    val debugLogsEnabled: Boolean = false,
    val useSandbox: Boolean = false
)

/**
 * Subscriber information
 */
@Serializable
data class SubscriberInfo(
    @SerialName("original_app_user_id") val originalAppUserId: String,
    @SerialName("first_seen") val firstSeen: String,
    @SerialName("last_seen") val lastSeen: String? = null,
    val entitlements: Map<String, Entitlement> = emptyMap(),
    val subscriptions: Map<String, Subscription> = emptyMap(),
    @SerialName("non_subscription_purchases") val nonSubscriptionPurchases: Map<String, NonSubscription> = emptyMap(),
    val attributes: Map<String, String> = emptyMap()
)

/**
 * Entitlement info
 */
@Serializable
data class Entitlement(
    val identifier: String,
    @SerialName("is_active") val isActive: Boolean,
    @SerialName("will_renew") val willRenew: Boolean = false,
    @SerialName("product_identifier") val productIdentifier: String,
    @SerialName("expires_date") val expiresDate: String? = null,
    @SerialName("purchase_date") val purchaseDate: String,
    @SerialName("is_sandbox") val isSandbox: Boolean = false,
    val store: Store = Store.UNKNOWN
)

/**
 * Subscription info
 */
@Serializable
data class Subscription(
    @SerialName("product_identifier") val productIdentifier: String,
    @SerialName("purchase_date") val purchaseDate: String,
    @SerialName("expires_date") val expiresDate: String? = null,
    val store: Store = Store.UNKNOWN,
    @SerialName("is_sandbox") val isSandbox: Boolean = false,
    @SerialName("will_renew") val willRenew: Boolean = true,
    @SerialName("is_active") val isActive: Boolean = true,
    @SerialName("is_trial") val isTrial: Boolean = false,
    @SerialName("is_intro_offer") val isIntroOffer: Boolean = false,
    @SerialName("period_type") val periodType: PeriodType = PeriodType.NORMAL
)

/**
 * Non-subscription purchase
 */
@Serializable
data class NonSubscription(
    @SerialName("product_identifier") val productIdentifier: String,
    @SerialName("purchase_date") val purchaseDate: String,
    val store: Store = Store.UNKNOWN,
    @SerialName("is_sandbox") val isSandbox: Boolean = false
)

/**
 * Offerings container
 */
@Serializable
data class Offerings(
    val current: Offering? = null,
    val all: Map<String, Offering> = emptyMap()
)

/**
 * Single offering
 */
@Serializable
data class Offering(
    val identifier: String,
    @SerialName("server_description") val serverDescription: String = "",
    val metadata: Map<String, String> = emptyMap(),
    @SerialName("available_packages") val availablePackages: List<Package> = emptyList()
) {
    val lifetime: Package? get() = availablePackages.find { it.packageType == PackageType.LIFETIME }
    val annual: Package? get() = availablePackages.find { it.packageType == PackageType.ANNUAL }
    val sixMonth: Package? get() = availablePackages.find { it.packageType == PackageType.SIX_MONTH }
    val threeMonth: Package? get() = availablePackages.find { it.packageType == PackageType.THREE_MONTH }
    val twoMonth: Package? get() = availablePackages.find { it.packageType == PackageType.TWO_MONTH }
    val monthly: Package? get() = availablePackages.find { it.packageType == PackageType.MONTHLY }
    val weekly: Package? get() = availablePackages.find { it.packageType == PackageType.WEEKLY }
}

/**
 * Package within an offering
 */
@Serializable
data class Package(
    val identifier: String,
    @SerialName("package_type") val packageType: PackageType = PackageType.CUSTOM,
    val product: Product,
    @SerialName("offering_identifier") val offeringIdentifier: String
)

/**
 * Store product
 */
@Serializable
data class Product(
    val identifier: String,
    val description: String = "",
    val title: String = "",
    val price: Double = 0.0,
    @SerialName("price_string") val priceString: String = "",
    @SerialName("currency_code") val currencyCode: String = "USD",
    @SerialName("introductory_price") val introductoryPrice: IntroductoryPrice? = null,
    @SerialName("subscription_period") val subscriptionPeriod: String? = null
)

/**
 * Introductory price info
 */
@Serializable
data class IntroductoryPrice(
    val price: Double,
    @SerialName("price_string") val priceString: String,
    val cycles: Int = 1,
    val period: String,
    @SerialName("period_unit") val periodUnit: PeriodUnit = PeriodUnit.MONTH,
    @SerialName("period_number_of_units") val periodNumberOfUnits: Int = 1
)

/**
 * Purchase result
 */
@Serializable
data class PurchaseResult(
    val subscriber: SubscriberInfo,
    @SerialName("product_identifier") val productIdentifier: String,
    @SerialName("transaction_identifier") val transactionIdentifier: String
)

/**
 * Paywall template
 */
@Serializable
data class PaywallTemplate(
    val id: String,
    val identifier: String,
    val name: String,
    @SerialName("template_type") val templateType: String,
    val config: Map<String, String> = emptyMap(),
    val offering: Offering? = null
)

/**
 * Store type
 */
@Serializable
enum class Store {
    @SerialName("app_store") APP_STORE,
    @SerialName("play_store") PLAY_STORE,
    @SerialName("stripe") STRIPE,
    @SerialName("amazon") AMAZON,
    @SerialName("paddle") PADDLE,
    @SerialName("unknown") UNKNOWN
}

/**
 * Period type
 */
@Serializable
enum class PeriodType {
    @SerialName("normal") NORMAL,
    @SerialName("intro") INTRO,
    @SerialName("trial") TRIAL
}

/**
 * Package type
 */
@Serializable
enum class PackageType {
    @SerialName("unknown") UNKNOWN,
    @SerialName("custom") CUSTOM,
    @SerialName("lifetime") LIFETIME,
    @SerialName("annual") ANNUAL,
    @SerialName("six_month") SIX_MONTH,
    @SerialName("three_month") THREE_MONTH,
    @SerialName("two_month") TWO_MONTH,
    @SerialName("monthly") MONTHLY,
    @SerialName("weekly") WEEKLY
}

/**
 * Period unit
 */
@Serializable
enum class PeriodUnit {
    @SerialName("day") DAY,
    @SerialName("week") WEEK,
    @SerialName("month") MONTH,
    @SerialName("year") YEAR
}

/**
 * PayCat error
 */
sealed class PayCatError : Exception() {
    data class NotConfigured(override val message: String = "PayCat not configured") : PayCatError()
    data class NotLoggedIn(override val message: String = "No user logged in") : PayCatError()
    data class NetworkError(override val message: String, val cause: Throwable? = null) : PayCatError()
    data class PurchaseError(override val message: String, val code: String? = null) : PayCatError()
    data class ServerError(override val message: String, val statusCode: Int) : PayCatError()
    data class Unknown(override val message: String) : PayCatError()
}
