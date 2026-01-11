package com.paycat.sdk

import com.google.gson.Gson
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import java.text.SimpleDateFormat
import java.util.*
import java.util.concurrent.TimeUnit

/**
 * PayCat API Client
 */
internal class PayCatApiClient(
    private val apiKey: String,
    private val baseURL: String
) {
    private val client = OkHttpClient.Builder()
        .connectTimeout(30, TimeUnit.SECONDS)
        .readTimeout(30, TimeUnit.SECONDS)
        .writeTimeout(30, TimeUnit.SECONDS)
        .build()

    private val gson = Gson()
    private val jsonMediaType = "application/json; charset=utf-8".toMediaType()
    private val dateFormat = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US).apply {
        timeZone = TimeZone.getTimeZone("UTC")
    }

    /**
     * Get subscriber info
     */
    suspend fun getSubscriber(appUserID: String): SubscriberInfo = withContext(Dispatchers.IO) {
        val request = Request.Builder()
            .url("$baseURL/v1/subscribers/$appUserID")
            .addHeader("X-API-Key", apiKey)
            .addHeader("User-Agent", "PayCat-Android/1.0.0")
            .get()
            .build()

        val response = client.newCall(request).execute()
        val body = response.body?.string() ?: throw PayCatException.NetworkError()

        if (!response.isSuccessful) {
            handleError(response.code, body)
        }

        val data = gson.fromJson(body, SubscriberResponse::class.java)
        data.subscriber.toSubscriberInfo()
    }

    /**
     * Verify receipt
     */
    suspend fun verifyReceipt(
        appUserID: String,
        platform: String,
        purchaseToken: String,
        productId: String
    ): SubscriberInfo = withContext(Dispatchers.IO) {
        val receiptRequest = ReceiptRequest(
            app_user_id = appUserID,
            platform = platform,
            receipt_data = ReceiptData(
                purchase_token = purchaseToken,
                product_id = productId
            )
        )

        val requestBody = gson.toJson(receiptRequest).toRequestBody(jsonMediaType)

        val request = Request.Builder()
            .url("$baseURL/v1/receipts")
            .addHeader("X-API-Key", apiKey)
            .addHeader("User-Agent", "PayCat-Android/1.0.0")
            .post(requestBody)
            .build()

        val response = client.newCall(request).execute()
        val body = response.body?.string() ?: throw PayCatException.NetworkError()

        if (!response.isSuccessful) {
            handleError(response.code, body)
        }

        val data = gson.fromJson(body, SubscriberResponse::class.java)
        data.subscriber.toSubscriberInfo()
    }

    private fun handleError(code: Int, body: String): Nothing {
        try {
            val error = gson.fromJson(body, ApiErrorResponse::class.java)
            throw PayCatException.ApiError(error.error.code, error.error.message)
        } catch (e: Exception) {
            if (e is PayCatException) throw e
            throw PayCatException.HttpError(code)
        }
    }

    private fun SubscriberData.toSubscriberInfo(): SubscriberInfo {
        return SubscriberInfo(
            originalAppUserID = original_app_user_id,
            firstSeen = parseDate(first_seen),
            subscriptions = subscriptions.mapValues { it.value.toSubscription() },
            entitlements = entitlements.mapValues { it.value.toEntitlement() }
        )
    }

    private fun SubscriptionData.toSubscription(): Subscription {
        return Subscription(
            platform = Platform.fromString(platform),
            productID = product_id,
            status = SubscriptionStatus.fromString(status),
            purchaseDate = parseDate(purchase_date),
            expiresDate = expires_date?.let { parseDate(it) },
            isSandbox = is_sandbox,
            isTrialPeriod = is_trial_period,
            willRenew = will_renew,
            gracePeriodExpiresDate = grace_period_expires_date?.let { parseDate(it) }
        )
    }

    private fun EntitlementData.toEntitlement(): Entitlement {
        return Entitlement(
            isActive = is_active,
            productIdentifier = product_identifier,
            expiresDate = expires_date?.let { parseDate(it) }
        )
    }

    private fun parseDate(dateString: String): Date {
        return try {
            dateFormat.parse(dateString) ?: Date()
        } catch (e: Exception) {
            Date()
        }
    }
}
