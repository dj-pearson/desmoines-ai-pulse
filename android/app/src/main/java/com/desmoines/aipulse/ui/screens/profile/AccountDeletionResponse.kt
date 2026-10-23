package com.desmoines.aipulse.ui.screens.profile

import com.desmoines.aipulse.BuildConfig
import com.desmoines.aipulse.util.PlaySubscriptionLinks
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.contentOrNull

/**
 * What the app tells a user whose store subscription outlives their account.
 *
 * delete-user-account cancels Stripe billing itself, but it cannot touch an App
 * Store or Google Play subscription: Apple and Google own those. It reports them
 * in `store_subscriptions_still_active`, and before AND-OVH-010 Android read
 * only `success` and signed out, so a Play subscriber deleted their account and
 * kept being charged with nothing on screen to say so.
 */
data class StoreSubscriptionNotice(
    val message: String,
    /** Where the user can cancel; null when the server gave no usable link. */
    val manageUrl: String?,
    val manageLabel: String,
    /** True when a Google Play subscription is among those still active. */
    val isGooglePlay: Boolean,
)

/** The decoded result of the `confirm` step. */
data class DeletionConfirmation(
    val succeeded: Boolean,
    val notice: StoreSubscriptionNotice?,
)

object AccountDeletionResponse {

    const val PLAY_NOTICE =
        "Your Google Play subscription is still active. Cancel it in Google Play to stop billing."

    const val OTHER_STORE_NOTICE =
        "Your subscription is billed by the store you bought it from and is not cancelled when you delete your account."

    /** Shown in the confirmation dialog, before anything is deleted. */
    const val CONFIRMATION_TEXT =
        "This will permanently delete your account, favorites, and all associated data. " +
            "This action cannot be undone.\n\n" +
            "Deleting your account doesn't cancel a Google Play subscription. " +
            "Cancel it in Google Play to stop billing."

    private val json = Json { ignoreUnknownKeys = true }

    @Serializable
    private data class ConfirmBody(
        val success: Boolean? = null,
        val complete: Boolean? = null,
        // A list of { platform, manageUrl } today (cancelBillingBeforeErasure.ts).
        // Kept as a raw element so a bare boolean also decodes instead of
        // failing the whole response after the account is already gone.
        @SerialName("store_subscriptions_still_active")
        val storeSubscriptionsStillActive: JsonElement? = null,
    )

    private data class StoreSubscription(val platform: String, val manageUrl: String?)

    fun parse(body: String, packageName: String = BuildConfig.APPLICATION_ID): DeletionConfirmation {
        val decoded = runCatching { json.decodeFromString(ConfirmBody.serializer(), body) }.getOrNull()
            ?: return DeletionConfirmation(succeeded = false, notice = null)
        return DeletionConfirmation(
            succeeded = decoded.success == true,
            notice = noticeFor(decoded.storeSubscriptionsStillActive, packageName),
        )
    }

    private fun noticeFor(element: JsonElement?, packageName: String): StoreSubscriptionNotice? {
        val playUrl = PlaySubscriptionLinks.manageUrl(null, packageName)
        val subscriptions: List<StoreSubscription> = when (element) {
            is JsonArray -> element.mapNotNull { item ->
                when (item) {
                    is JsonObject -> (item["platform"] as? JsonPrimitive)?.contentOrNull?.let { platform ->
                        StoreSubscription(platform, (item["manageUrl"] as? JsonPrimitive)?.contentOrNull)
                    }
                    is JsonPrimitive -> item.contentOrNull?.let { StoreSubscription(it, null) }
                    else -> null
                }
            }
            // A bare `true` names no store. On an Android client the store we
            // cannot rule out is Play, and a warning to someone who is not
            // billed costs far less than silence to someone who is.
            is JsonPrimitive -> if (element.booleanOrNull == true) listOf(StoreSubscription("android", null)) else emptyList()
            else -> emptyList()
        }
        if (subscriptions.isEmpty()) return null

        if (subscriptions.any { isGooglePlay(it.platform) }) {
            return StoreSubscriptionNotice(
                message = PLAY_NOTICE,
                manageUrl = playUrl,
                manageLabel = "Open Google Play",
                isGooglePlay = true,
            )
        }
        return StoreSubscriptionNotice(
            message = OTHER_STORE_NOTICE,
            manageUrl = subscriptions.firstNotNullOfOrNull { it.manageUrl?.takeIf { url -> url.startsWith("https://") } },
            manageLabel = "Manage Subscription",
            isGooglePlay = false,
        )
    }

    private fun isGooglePlay(platform: String): Boolean =
        platform.trim().lowercase().let { it == "android" || it == "google" || it == "google_play" || it == "play" }
}
