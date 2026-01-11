package com.paycat.sdk

import android.app.Activity
import android.content.Context
import com.android.billingclient.api.*
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import java.util.UUID

/**
 * PayCat SDK for Android
 * Unified subscription management across platforms
 */
class PayCat private constructor(
    private val context: Context,
    private val apiKey: String,
    private var appUserID: String,
    private val baseURL: String
) : PurchasesUpdatedListener {

    companion object {
        @Volatile
        private var instance: PayCat? = null

        /**
         * Get the shared PayCat instance
         */
        val shared: PayCat
            get() = instance ?: throw PayCatException.NotConfigured()

        /**
         * Check if PayCat is configured
         */
        val isConfigured: Boolean
            get() = instance != null

        /**
         * Configure PayCat with your API key
         */
        fun configure(
            context: Context,
            apiKey: String,
            appUserID: String? = null,
            baseURL: String = "https://paycat.ongoru.workers.dev"
        ): PayCat {
            return synchronized(this) {
                instance?.let { return it }

                val userID = appUserID ?: getOrCreateAnonymousID(context)
                val paycat = PayCat(context.applicationContext, apiKey, userID, baseURL)
                instance = paycat
                paycat.initialize()
                paycat
            }
        }

        private fun getOrCreateAnonymousID(context: Context): String {
            val prefs = context.getSharedPreferences("paycat", Context.MODE_PRIVATE)
            return prefs.getString("anonymous_id", null) ?: run {
                val id = "\$anon_${UUID.randomUUID()}"
                prefs.edit().putString("anonymous_id", id).apply()
                id
            }
        }
    }

    // Billing Client
    private lateinit var billingClient: BillingClient
    private val scope = CoroutineScope(Dispatchers.Main + SupervisorJob())

    // API Client
    private val apiClient = PayCatApiClient(apiKey, baseURL)

    // State
    private val _subscriberInfo = MutableStateFlow<SubscriberInfo?>(null)
    val subscriberInfo: StateFlow<SubscriberInfo?> = _subscriberInfo.asStateFlow()

    private val _connectionState = MutableStateFlow(ConnectionState.DISCONNECTED)
    val connectionState: StateFlow<ConnectionState> = _connectionState.asStateFlow()

    // Listeners
    private val listeners = mutableListOf<PayCatListener>()

    /**
     * Current app user ID
     */
    val currentAppUserID: String
        get() = appUserID

    private fun initialize() {
        setupBillingClient()
        scope.launch {
            try {
                refreshSubscriberInfo()
            } catch (e: Exception) {
                notifyError(e)
            }
        }
    }

    private fun setupBillingClient() {
        billingClient = BillingClient.newBuilder(context)
            .setListener(this)
            .enablePendingPurchases()
            .build()

        startConnection()
    }

    private fun startConnection() {
        _connectionState.value = ConnectionState.CONNECTING
        billingClient.startConnection(object : BillingClientStateListener {
            override fun onBillingSetupFinished(result: BillingResult) {
                if (result.responseCode == BillingClient.BillingResponseCode.OK) {
                    _connectionState.value = ConnectionState.CONNECTED
                    scope.launch { syncExistingPurchases() }
                } else {
                    _connectionState.value = ConnectionState.DISCONNECTED
                    notifyError(PayCatException.BillingError(result.debugMessage))
                }
            }

            override fun onBillingServiceDisconnected() {
                _connectionState.value = ConnectionState.DISCONNECTED
                // Retry connection
                scope.launch {
                    delay(1000)
                    startConnection()
                }
            }
        })
    }

    // MARK: - Subscriber Info

    /**
     * Get current subscriber info
     */
    suspend fun getSubscriberInfo(forceRefresh: Boolean = false): SubscriberInfo {
        if (!forceRefresh) {
            _subscriberInfo.value?.let { return it }
        }
        return refreshSubscriberInfo()
    }

    /**
     * Check if user has active entitlement
     */
    suspend fun hasEntitlement(identifier: String): Boolean {
        val info = getSubscriberInfo()
        return info.entitlements[identifier]?.isActive ?: false
    }

    private suspend fun refreshSubscriberInfo(): SubscriberInfo {
        val info = apiClient.getSubscriber(appUserID)
        _subscriberInfo.value = info
        notifySubscriberInfoUpdated(info)
        return info
    }

    // MARK: - User Management

    /**
     * Identify user (login)
     */
    suspend fun identify(newAppUserID: String) {
        appUserID = newAppUserID
        _subscriberInfo.value = null
        refreshSubscriberInfo()
    }

    /**
     * Log out and switch to anonymous user
     */
    suspend fun logOut() {
        appUserID = getOrCreateAnonymousID(context)
        _subscriberInfo.value = null
        refreshSubscriberInfo()
    }

    // MARK: - Products

    /**
     * Get available products
     */
    suspend fun getProducts(productIDs: List<String>): List<ProductDetails> {
        ensureConnected()

        val params = QueryProductDetailsParams.newBuilder()
            .setProductList(
                productIDs.map { productId ->
                    QueryProductDetailsParams.Product.newBuilder()
                        .setProductId(productId)
                        .setProductType(BillingClient.ProductType.SUBS)
                        .build()
                }
            )
            .build()

        return suspendCancellableCoroutine { continuation ->
            billingClient.queryProductDetailsAsync(params) { result, productDetailsList ->
                if (result.responseCode == BillingClient.BillingResponseCode.OK) {
                    continuation.resume(productDetailsList ?: emptyList()) {}
                } else {
                    continuation.resumeWith(
                        Result.failure(PayCatException.BillingError(result.debugMessage))
                    )
                }
            }
        }
    }

    // MARK: - Purchases

    /**
     * Launch purchase flow
     */
    suspend fun purchase(
        activity: Activity,
        productDetails: ProductDetails,
        offerToken: String? = null
    ): SubscriberInfo {
        ensureConnected()

        val productDetailsParamsBuilder = BillingFlowParams.ProductDetailsParams.newBuilder()
            .setProductDetails(productDetails)

        // Use provided offer token or first available
        val token = offerToken ?: productDetails.subscriptionOfferDetails?.firstOrNull()?.offerToken
        token?.let { productDetailsParamsBuilder.setOfferToken(it) }

        val billingFlowParams = BillingFlowParams.newBuilder()
            .setProductDetailsParamsList(listOf(productDetailsParamsBuilder.build()))
            .build()

        val result = billingClient.launchBillingFlow(activity, billingFlowParams)
        if (result.responseCode != BillingClient.BillingResponseCode.OK) {
            throw PayCatException.BillingError(result.debugMessage)
        }

        // Wait for purchase result via onPurchasesUpdated
        return suspendCancellableCoroutine { continuation ->
            val listener = object : PayCatListener {
                override fun onSubscriberInfoUpdated(info: SubscriberInfo) {
                    removeListener(this)
                    continuation.resume(info) {}
                }
                override fun onError(error: Throwable) {
                    removeListener(this)
                    continuation.resumeWith(Result.failure(error))
                }
            }
            addListener(listener)
        }
    }

    /**
     * Restore purchases
     */
    suspend fun restorePurchases(): SubscriberInfo {
        syncExistingPurchases()
        return refreshSubscriberInfo()
    }

    override fun onPurchasesUpdated(result: BillingResult, purchases: List<Purchase>?) {
        scope.launch {
            when (result.responseCode) {
                BillingClient.BillingResponseCode.OK -> {
                    purchases?.forEach { purchase ->
                        handlePurchase(purchase)
                    }
                }
                BillingClient.BillingResponseCode.USER_CANCELED -> {
                    notifyError(PayCatException.PurchaseCancelled())
                }
                else -> {
                    notifyError(PayCatException.BillingError(result.debugMessage))
                }
            }
        }
    }

    private suspend fun handlePurchase(purchase: Purchase) {
        if (purchase.purchaseState == Purchase.PurchaseState.PURCHASED) {
            // Sync with PayCat backend
            try {
                apiClient.verifyReceipt(
                    appUserID = appUserID,
                    platform = "android",
                    purchaseToken = purchase.purchaseToken,
                    productId = purchase.products.first()
                )

                // Acknowledge purchase if not already
                if (!purchase.isAcknowledged) {
                    val ackParams = AcknowledgePurchaseParams.newBuilder()
                        .setPurchaseToken(purchase.purchaseToken)
                        .build()
                    billingClient.acknowledgePurchase(ackParams) { }
                }

                refreshSubscriberInfo()
            } catch (e: Exception) {
                notifyError(e)
            }
        }
    }

    private suspend fun syncExistingPurchases() {
        ensureConnected()

        val params = QueryPurchasesParams.newBuilder()
            .setProductType(BillingClient.ProductType.SUBS)
            .build()

        val result = billingClient.queryPurchasesAsync(params)
        result.purchasesList.forEach { purchase ->
            handlePurchase(purchase)
        }
    }

    private suspend fun ensureConnected() {
        if (_connectionState.value != ConnectionState.CONNECTED) {
            var attempts = 0
            while (_connectionState.value != ConnectionState.CONNECTED && attempts < 10) {
                delay(500)
                attempts++
            }
            if (_connectionState.value != ConnectionState.CONNECTED) {
                throw PayCatException.NotConnected()
            }
        }
    }

    // MARK: - Listeners

    fun addListener(listener: PayCatListener) {
        synchronized(listeners) {
            listeners.add(listener)
        }
    }

    fun removeListener(listener: PayCatListener) {
        synchronized(listeners) {
            listeners.remove(listener)
        }
    }

    private fun notifySubscriberInfoUpdated(info: SubscriberInfo) {
        synchronized(listeners) {
            listeners.forEach { it.onSubscriberInfoUpdated(info) }
        }
    }

    private fun notifyError(error: Throwable) {
        synchronized(listeners) {
            listeners.forEach { it.onError(error) }
        }
    }

    /**
     * Connection state
     */
    enum class ConnectionState {
        DISCONNECTED,
        CONNECTING,
        CONNECTED
    }
}

/**
 * PayCat listener interface
 */
interface PayCatListener {
    fun onSubscriberInfoUpdated(info: SubscriberInfo)
    fun onError(error: Throwable)
}
