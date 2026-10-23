package com.desmoines.aipulse.data.remote

import com.android.billingclient.api.BillingClient
import com.android.billingclient.api.BillingFlowParams.ProductDetailsParams.SubscriptionProductReplacementParams.ReplacementMode
import com.desmoines.aipulse.data.model.SubscriptionTier

/**
 * The decisions behind a Play purchase launch, pulled out of [BillingService]
 * so a plain JUnit test can reach them (AND-OVH-009). BillingService needs an
 * Android Context and a live BillingClient; none of the rules below do.
 */

/** The Google Play subscription the device currently holds, as Play reports it. */
data class PlaySubscription(
    val productId: String,
    val purchaseToken: String,
    val tier: SubscriptionTier,
)

/**
 * How a tap on a tier turns into a Play billing flow.
 *
 * Before this existed every tap was [New], so an Insider choosing VIP bought a
 * second subscription that ran alongside the first and was billed for both.
 * [Upgrade] and [Downgrade] carry the old purchase token so Play replaces the
 * existing subscription instead.
 */
sealed interface PurchasePlan {
    /** No Play subscription to replace: an ordinary first purchase. */
    data object New : PurchasePlan

    /**
     * Higher tier. Takes effect now; Play charges the prorated difference for
     * the rest of the current period and keeps the renewal date.
     */
    data class Upgrade(val oldPurchaseToken: String) : PurchasePlan {
        val replacementMode: Int get() = ReplacementMode.CHARGE_PRORATED_PRICE
    }

    /**
     * Lower tier. The current plan runs to the end of the period it was paid
     * for, and the new one starts at renewal, so nobody pays for VIP and gets
     * Insider mid-month.
     */
    data class Downgrade(val oldPurchaseToken: String) : PurchasePlan {
        val replacementMode: Int get() = ReplacementMode.DEFERRED
    }

    /** Nothing to buy: the tier is already held, or the target is Free. */
    data object NoOp : PurchasePlan
}

internal fun tierRank(tier: SubscriptionTier): Int = when (tier) {
    SubscriptionTier.VIP -> 2
    SubscriptionTier.INSIDER -> 1
    SubscriptionTier.FREE -> 0
}

/**
 * Decides the purchase mode.
 *
 * [currentTier] must be the tier of the Google Play subscription only, not
 * the cross-platform tier: a web or App Store subscriber has no Play token to
 * replace, and Play would reject one from somewhere else.
 *
 * Free is never a purchase target. Leaving a paid tier is a cancellation, and
 * that happens in Play's subscription page.
 */
fun planPurchase(
    currentTier: SubscriptionTier,
    currentPurchaseToken: String?,
    targetTier: SubscriptionTier,
): PurchasePlan {
    if (targetTier == currentTier || targetTier == SubscriptionTier.FREE) return PurchasePlan.NoOp
    val token = currentPurchaseToken?.takeIf { it.isNotBlank() }
    if (currentTier == SubscriptionTier.FREE || token == null) return PurchasePlan.New
    return if (tierRank(targetTier) > tierRank(currentTier)) {
        PurchasePlan.Upgrade(token)
    } else {
        PurchasePlan.Downgrade(token)
    }
}

/**
 * Picks the offer to sell from a product's offers.
 *
 * With a [basePlanId] the first offer on that base plan wins. Without one, or
 * when Play returns no offer on it, the first offer wins, which is what the
 * app always did. Falling back rather than failing keeps a typo in Config from
 * taking the paywall down; the price shown comes from the same choice, so the
 * user still sees what Play will charge.
 */
fun <T> chooseOffer(offers: List<T>, basePlanId: String?, basePlanOf: (T) -> String): T? {
    if (offers.isEmpty()) return null
    if (basePlanId.isNullOrBlank()) return offers.first()
    return offers.firstOrNull { basePlanOf(it) == basePlanId } ?: offers.first()
}

/**
 * What to tell the user when `launchBillingFlow` itself returns non-OK.
 *
 * Play reports these synchronously and never calls onPurchasesUpdated for
 * them, so before AND-OVH-009 the spinner stayed up until the five-minute
 * watchdog. Null means say nothing: the user backed out.
 */
fun launchFailureMessage(responseCode: Int): String? = when (responseCode) {
    BillingClient.BillingResponseCode.OK,
    BillingClient.BillingResponseCode.USER_CANCELED -> null
    BillingClient.BillingResponseCode.ITEM_ALREADY_OWNED ->
        "You already have this plan on Google Play."
    BillingClient.BillingResponseCode.ITEM_UNAVAILABLE ->
        "That plan isn't available from Google Play right now. Please try again later."
    BillingClient.BillingResponseCode.BILLING_UNAVAILABLE,
    BillingClient.BillingResponseCode.SERVICE_UNAVAILABLE,
    BillingClient.BillingResponseCode.SERVICE_DISCONNECTED,
    BillingClient.BillingResponseCode.NETWORK_ERROR ->
        BillingService.BillingError.BILLING_UNAVAILABLE.message
    else -> BillingService.BillingError.PURCHASE_FAILED.message
}
