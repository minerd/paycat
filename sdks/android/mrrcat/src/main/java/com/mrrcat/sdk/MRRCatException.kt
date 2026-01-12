package com.mrrcat.sdk

/**
 * MRRCat SDK Exceptions
 */
sealed class MRRCatException(
    override val message: String,
    override val cause: Throwable? = null
) : Exception(message, cause) {

    /**
     * MRRCat is not configured
     */
    class NotConfigured : MRRCatException(
        "MRRCat is not configured. Call MRRCat.configure() first."
    )

    /**
     * Billing client is not connected
     */
    class NotConnected : MRRCatException(
        "Billing client is not connected. Please try again."
    )

    /**
     * Network error
     */
    class NetworkError(
        cause: Throwable? = null
    ) : MRRCatException("Network request failed", cause)

    /**
     * HTTP error
     */
    class HttpError(
        val statusCode: Int
    ) : MRRCatException("HTTP error: $statusCode")

    /**
     * API error
     */
    class ApiError(
        val code: String,
        override val message: String
    ) : MRRCatException("API error [$code]: $message")

    /**
     * Billing error
     */
    class BillingError(
        override val message: String
    ) : MRRCatException(message)

    /**
     * Product not found
     */
    class ProductNotFound(
        val productId: String
    ) : MRRCatException("Product not found: $productId")

    /**
     * Purchase was cancelled by user
     */
    class PurchaseCancelled : MRRCatException("Purchase was cancelled")

    /**
     * Purchase is pending
     */
    class PurchasePending : MRRCatException("Purchase is pending approval")

    /**
     * Unknown error
     */
    class Unknown(
        cause: Throwable? = null
    ) : MRRCatException("An unknown error occurred", cause)
}
