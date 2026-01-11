package com.paycat.sdk

/**
 * PayCat SDK Exceptions
 */
sealed class PayCatException(
    override val message: String,
    override val cause: Throwable? = null
) : Exception(message, cause) {

    /**
     * PayCat is not configured
     */
    class NotConfigured : PayCatException(
        "PayCat is not configured. Call PayCat.configure() first."
    )

    /**
     * Billing client is not connected
     */
    class NotConnected : PayCatException(
        "Billing client is not connected. Please try again."
    )

    /**
     * Network error
     */
    class NetworkError(
        cause: Throwable? = null
    ) : PayCatException("Network request failed", cause)

    /**
     * HTTP error
     */
    class HttpError(
        val statusCode: Int
    ) : PayCatException("HTTP error: $statusCode")

    /**
     * API error
     */
    class ApiError(
        val code: String,
        override val message: String
    ) : PayCatException("API error [$code]: $message")

    /**
     * Billing error
     */
    class BillingError(
        override val message: String
    ) : PayCatException(message)

    /**
     * Product not found
     */
    class ProductNotFound(
        val productId: String
    ) : PayCatException("Product not found: $productId")

    /**
     * Purchase was cancelled by user
     */
    class PurchaseCancelled : PayCatException("Purchase was cancelled")

    /**
     * Purchase is pending
     */
    class PurchasePending : PayCatException("Purchase is pending approval")

    /**
     * Unknown error
     */
    class Unknown(
        cause: Throwable? = null
    ) : PayCatException("An unknown error occurred", cause)
}
