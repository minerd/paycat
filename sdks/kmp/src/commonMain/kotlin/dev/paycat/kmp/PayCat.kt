package dev.paycat.kmp

import dev.paycat.kmp.models.*
import dev.paycat.kmp.network.PayCatAPI
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/**
 * PayCat SDK - Main entry point
 * Kotlin Multiplatform implementation
 */
class PayCat private constructor() {

    private var api: PayCatAPI? = null
    private var configuration: PayCatConfiguration? = null
    private var currentAppUserId: String? = null

    private val _subscriberInfo = MutableStateFlow<SubscriberInfo?>(null)
    val subscriberInfo: StateFlow<SubscriberInfo?> = _subscriberInfo.asStateFlow()

    private val _offerings = MutableStateFlow<Offerings?>(null)
    val offerings: StateFlow<Offerings?> = _offerings.asStateFlow()

    companion object {
        private var instance: PayCat? = null

        /**
         * Get singleton instance
         */
        fun getInstance(): PayCat {
            if (instance == null) {
                instance = PayCat()
            }
            return instance!!
        }

        /**
         * Shared instance (alias for getInstance)
         */
        val shared: PayCat
            get() = getInstance()
    }

    /**
     * Check if SDK is configured
     */
    val isConfigured: Boolean
        get() = configuration != null

    /**
     * Check if user is logged in
     */
    val isLoggedIn: Boolean
        get() = currentAppUserId != null

    /**
     * Get current app user ID
     */
    val appUserId: String?
        get() = currentAppUserId

    /**
     * Configure the SDK
     */
    fun configure(config: PayCatConfiguration) {
        configuration = config
        api = PayCatAPI(
            apiKey = config.apiKey,
            useSandbox = config.useSandbox,
            debugEnabled = config.debugLogsEnabled
        )

        // Auto-login if appUserId provided
        config.appUserId?.let {
            currentAppUserId = it
        }

        log("PayCat configured")
    }

    /**
     * Log in user
     */
    suspend fun login(appUserId: String): SubscriberInfo {
        ensureConfigured()

        currentAppUserId = appUserId
        val subscriber = api!!.getSubscriber(appUserId)
        _subscriberInfo.value = subscriber

        log("User logged in: $appUserId")
        return subscriber
    }

    /**
     * Log out user
     */
    fun logout() {
        currentAppUserId = null
        _subscriberInfo.value = null
        _offerings.value = null
        log("User logged out")
    }

    /**
     * Get subscriber info
     */
    suspend fun getSubscriberInfo(): SubscriberInfo {
        ensureConfigured()
        ensureLoggedIn()

        val subscriber = api!!.getSubscriber(currentAppUserId!!)
        _subscriberInfo.value = subscriber
        return subscriber
    }

    /**
     * Get offerings
     */
    suspend fun getOfferings(): Offerings {
        ensureConfigured()

        val offerings = api!!.getOfferings()
        _offerings.value = offerings
        return offerings
    }

    /**
     * Check if user has active entitlement
     */
    suspend fun hasEntitlement(identifier: String): Boolean {
        val subscriber = getSubscriberInfo()
        return subscriber.entitlements[identifier]?.isActive == true
    }

    /**
     * Get entitlement details
     */
    suspend fun getEntitlement(identifier: String): Entitlement? {
        val subscriber = getSubscriberInfo()
        return subscriber.entitlements[identifier]
    }

    /**
     * Set user attributes
     */
    suspend fun setAttributes(attributes: Map<String, String?>) {
        ensureConfigured()
        ensureLoggedIn()

        api!!.setAttributes(currentAppUserId!!, attributes)
        log("Attributes set: ${attributes.keys}")
    }

    /**
     * Set single attribute
     */
    suspend fun setAttribute(key: String, value: String?) {
        setAttributes(mapOf(key to value))
    }

    /**
     * Get paywall template
     */
    suspend fun getPaywall(identifier: String? = null, locale: String = "en"): PaywallTemplate {
        ensureConfigured()
        return api!!.getPaywall(identifier ?: "default", locale)
    }

    /**
     * Track custom event
     */
    suspend fun trackEvent(eventName: String, properties: Map<String, Any>? = null) {
        ensureConfigured()
        api!!.trackEvent(currentAppUserId, eventName, properties)
        log("Event tracked: $eventName")
    }

    /**
     * Restore purchases
     * Platform-specific implementations should override this
     */
    suspend fun restorePurchases(): SubscriberInfo {
        return getSubscriberInfo()
    }

    /**
     * Verify iOS receipt
     */
    suspend fun verifyiOSReceipt(transactionId: String): SubscriberInfo {
        ensureConfigured()
        ensureLoggedIn()

        val subscriber = api!!.verifyReceipt(
            appUserId = currentAppUserId!!,
            platform = "ios",
            transactionId = transactionId
        )
        _subscriberInfo.value = subscriber
        return subscriber
    }

    /**
     * Verify Android purchase
     */
    suspend fun verifyAndroidPurchase(
        productId: String,
        purchaseToken: String
    ): SubscriberInfo {
        ensureConfigured()
        ensureLoggedIn()

        val subscriber = api!!.verifyReceipt(
            appUserId = currentAppUserId!!,
            platform = "android",
            productId = productId,
            purchaseToken = purchaseToken
        )
        _subscriberInfo.value = subscriber
        return subscriber
    }

    // Internal helpers

    private fun ensureConfigured() {
        if (!isConfigured) {
            throw PayCatError.NotConfigured()
        }
    }

    private fun ensureLoggedIn() {
        if (!isLoggedIn) {
            throw PayCatError.NotLoggedIn()
        }
    }

    private fun log(message: String) {
        if (configuration?.debugLogsEnabled == true) {
            println("[PayCat] $message")
        }
    }
}

/**
 * Convenience function to get PayCat instance
 */
fun paycat(): PayCat = PayCat.shared
