package dev.mrrcat.kmp.network

import dev.mrrcat.kmp.models.*
import io.ktor.client.*
import io.ktor.client.call.*
import io.ktor.client.plugins.*
import io.ktor.client.plugins.contentnegotiation.*
import io.ktor.client.plugins.logging.*
import io.ktor.client.request.*
import io.ktor.client.statement.*
import io.ktor.http.*
import io.ktor.serialization.kotlinx.json.*
import kotlinx.serialization.json.Json

/**
 * MRRCat API client
 */
internal class MRRCatAPI(
    private val apiKey: String,
    private val useSandbox: Boolean = false,
    private val debugEnabled: Boolean = false
) {
    private val baseUrl = if (useSandbox) {
        "https://sandbox.api.mrrcat.dev"
    } else {
        "https://api.mrrcat.dev"
    }

    private val json = Json {
        ignoreUnknownKeys = true
        isLenient = true
        encodeDefaults = true
    }

    private val client = HttpClient {
        install(ContentNegotiation) {
            json(json)
        }

        if (debugEnabled) {
            install(Logging) {
                logger = Logger.SIMPLE
                level = LogLevel.ALL
            }
        }

        install(HttpTimeout) {
            requestTimeoutMillis = 30_000
            connectTimeoutMillis = 10_000
        }

        defaultRequest {
            header("X-API-Key", apiKey)
            header("Content-Type", "application/json")
        }
    }

    /**
     * Get subscriber info
     */
    suspend fun getSubscriber(appUserId: String): SubscriberInfo {
        val response = client.get("$baseUrl/v1/subscribers/$appUserId")
        checkResponse(response)

        val result: SubscriberResponse = response.body()
        return result.subscriber
    }

    /**
     * Get offerings
     */
    suspend fun getOfferings(): Offerings {
        val response = client.get("$baseUrl/v1/offerings")
        checkResponse(response)

        val result: OfferingsResponse = response.body()

        val allOfferings = result.offerings.associateBy { it.identifier }
        val currentOffering = result.offerings.find { it.identifier == "default" }
            ?: result.offerings.firstOrNull()

        return Offerings(
            current = currentOffering,
            all = allOfferings
        )
    }

    /**
     * Verify receipt
     */
    suspend fun verifyReceipt(
        appUserId: String,
        platform: String,
        transactionId: String? = null,
        productId: String? = null,
        purchaseToken: String? = null
    ): SubscriberInfo {
        val body = buildMap {
            put("app_user_id", appUserId)
            put("platform", platform)
            put("receipt_data", buildMap {
                transactionId?.let { put("transaction_id", it) }
                productId?.let { put("product_id", it) }
                purchaseToken?.let { put("purchase_token", it) }
            })
        }

        val response = client.post("$baseUrl/v1/receipts") {
            setBody(body)
        }
        checkResponse(response)

        val result: SubscriberResponse = response.body()
        return result.subscriber
    }

    /**
     * Set attributes
     */
    suspend fun setAttributes(appUserId: String, attributes: Map<String, String?>) {
        val response = client.post("$baseUrl/v1/subscribers/$appUserId/attributes") {
            setBody(mapOf("attributes" to attributes))
        }
        checkResponse(response)
    }

    /**
     * Get paywall
     */
    suspend fun getPaywall(identifier: String, locale: String): PaywallTemplate {
        val response = client.get("$baseUrl/v1/paywalls/$identifier") {
            parameter("locale", locale)
        }
        checkResponse(response)

        val result: PaywallResponse = response.body()
        return result.template
    }

    /**
     * Track event
     */
    suspend fun trackEvent(
        appUserId: String?,
        eventName: String,
        properties: Map<String, Any>?
    ) {
        val body = buildMap<String, Any?> {
            put("event_name", eventName)
            appUserId?.let { put("app_user_id", it) }
            properties?.let { put("event_properties", it) }
        }

        val response = client.post("$baseUrl/v1/events") {
            setBody(body)
        }
        checkResponse(response)
    }

    /**
     * Check response for errors
     */
    private suspend fun checkResponse(response: HttpResponse) {
        if (!response.status.isSuccess()) {
            val errorBody = try {
                response.bodyAsText()
            } catch (e: Exception) {
                "Unknown error"
            }

            throw MRRCatError.ServerError(
                message = "API error: $errorBody",
                statusCode = response.status.value
            )
        }
    }
}

// Response types

@kotlinx.serialization.Serializable
internal data class SubscriberResponse(
    val subscriber: SubscriberInfo
)

@kotlinx.serialization.Serializable
internal data class OfferingsResponse(
    val offerings: List<Offering>
)

@kotlinx.serialization.Serializable
internal data class PaywallResponse(
    val template: PaywallTemplate
)
