package com.mrrcat.sdk

import android.os.Parcelable
import kotlinx.parcelize.Parcelize
import java.util.Date

/**
 * Subscriber information
 */
@Parcelize
data class SubscriberInfo(
    val originalAppUserID: String,
    val firstSeen: Date,
    val subscriptions: Map<String, Subscription>,
    val entitlements: Map<String, Entitlement>
) : Parcelable {

    /**
     * Check if any entitlement is active
     */
    val hasActiveEntitlement: Boolean
        get() = entitlements.values.any { it.isActive }

    /**
     * Get all active entitlement identifiers
     */
    val activeEntitlements: List<String>
        get() = entitlements.filter { it.value.isActive }.keys.toList()
}

/**
 * Subscription details
 */
@Parcelize
data class Subscription(
    val platform: Platform,
    val productID: String,
    val status: SubscriptionStatus,
    val purchaseDate: Date,
    val expiresDate: Date?,
    val isSandbox: Boolean,
    val isTrialPeriod: Boolean,
    val willRenew: Boolean,
    val gracePeriodExpiresDate: Date?
) : Parcelable {

    /**
     * Check if subscription is currently active
     */
    val isActive: Boolean
        get() = when (status) {
            SubscriptionStatus.ACTIVE, SubscriptionStatus.GRACE_PERIOD -> true
            else -> expiresDate?.let { Date().before(it) } ?: false
        }
}

/**
 * Entitlement details
 */
@Parcelize
data class Entitlement(
    val isActive: Boolean,
    val productIdentifier: String,
    val expiresDate: Date?
) : Parcelable

/**
 * Platform types
 */
enum class Platform {
    IOS,
    ANDROID,
    STRIPE,
    UNKNOWN;

    companion object {
        fun fromString(value: String): Platform {
            return when (value.lowercase()) {
                "ios" -> IOS
                "android" -> ANDROID
                "stripe" -> STRIPE
                else -> UNKNOWN
            }
        }
    }
}

/**
 * Subscription status types
 */
enum class SubscriptionStatus {
    ACTIVE,
    EXPIRED,
    CANCELLED,
    GRACE_PERIOD,
    PAUSED,
    BILLING_RETRY,
    UNKNOWN;

    companion object {
        fun fromString(value: String): SubscriptionStatus {
            return when (value.lowercase()) {
                "active" -> ACTIVE
                "expired" -> EXPIRED
                "cancelled" -> CANCELLED
                "grace_period" -> GRACE_PERIOD
                "paused" -> PAUSED
                "billing_retry" -> BILLING_RETRY
                else -> UNKNOWN
            }
        }
    }
}

// MARK: - API Response Models

internal data class SubscriberResponse(
    val subscriber: SubscriberData
)

internal data class SubscriberData(
    val original_app_user_id: String,
    val first_seen: String,
    val subscriptions: Map<String, SubscriptionData>,
    val entitlements: Map<String, EntitlementData>
)

internal data class SubscriptionData(
    val platform: String,
    val product_id: String,
    val status: String,
    val purchase_date: String,
    val expires_date: String?,
    val is_sandbox: Boolean,
    val is_trial_period: Boolean,
    val will_renew: Boolean,
    val grace_period_expires_date: String?
)

internal data class EntitlementData(
    val is_active: Boolean,
    val product_identifier: String,
    val expires_date: String?
)

internal data class ReceiptRequest(
    val app_user_id: String,
    val platform: String,
    val receipt_data: ReceiptData
)

internal data class ReceiptData(
    val purchase_token: String,
    val product_id: String
)

internal data class ApiErrorResponse(
    val error: ApiErrorDetail
)

internal data class ApiErrorDetail(
    val code: String,
    val message: String
)
