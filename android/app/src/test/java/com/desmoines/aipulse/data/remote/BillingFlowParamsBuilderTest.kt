package com.desmoines.aipulse.data.remote

import com.android.billingclient.api.BillingClient.BillingResponseCode
import com.android.billingclient.api.BillingFlowParams.ProductDetailsParams.SubscriptionProductReplacementParams.ReplacementMode
import com.desmoines.aipulse.data.model.SubscriptionTier
import com.desmoines.aipulse.ui.screens.subscription.purchaseButtonLabel
import com.desmoines.aipulse.ui.screens.subscription.renewalDisclosure
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNotNull
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

/**
 * AND-OVH-009: a tier change replaces the Play subscription instead of buying
 * a second one, the offer sold is the one Config names, and a failed launch
 * says why instead of spinning until the watchdog.
 */
class BillingFlowParamsBuilderTest {

    // region planPurchase

    @Test
    fun `a free user buying a tier is a new purchase`() {
        assertEquals(
            PurchasePlan.New,
            planPurchase(SubscriptionTier.FREE, currentPurchaseToken = null, targetTier = SubscriptionTier.INSIDER),
        )
    }

    @Test
    fun `a paid tier with no Play token is a new purchase, not a replacement`() {
        // A web or App Store subscriber: there is nothing on Play to replace.
        assertEquals(PurchasePlan.New, planPurchase(SubscriptionTier.INSIDER, null, SubscriptionTier.VIP))
        assertEquals(PurchasePlan.New, planPurchase(SubscriptionTier.INSIDER, "  ", SubscriptionTier.VIP))
    }

    @Test
    fun `Insider to VIP is an upgrade of the held token, charged prorated`() {
        val plan = planPurchase(SubscriptionTier.INSIDER, "tok-insider", SubscriptionTier.VIP)

        assertEquals(PurchasePlan.Upgrade("tok-insider"), plan)
        assertEquals(ReplacementMode.CHARGE_PRORATED_PRICE, (plan as PurchasePlan.Upgrade).replacementMode)
    }

    @Test
    fun `VIP to Insider is a downgrade of the held token, deferred to renewal`() {
        val plan = planPurchase(SubscriptionTier.VIP, "tok-vip", SubscriptionTier.INSIDER)

        assertEquals(PurchasePlan.Downgrade("tok-vip"), plan)
        assertEquals(ReplacementMode.DEFERRED, (plan as PurchasePlan.Downgrade).replacementMode)
    }

    @Test
    fun `the same tier is a no-op`() {
        assertEquals(PurchasePlan.NoOp, planPurchase(SubscriptionTier.VIP, "tok-vip", SubscriptionTier.VIP))
        assertEquals(PurchasePlan.NoOp, planPurchase(SubscriptionTier.INSIDER, "tok", SubscriptionTier.INSIDER))
        assertEquals(PurchasePlan.NoOp, planPurchase(SubscriptionTier.FREE, null, SubscriptionTier.FREE))
    }

    @Test
    fun `Free is never something to buy`() {
        assertEquals(PurchasePlan.NoOp, planPurchase(SubscriptionTier.VIP, "tok-vip", SubscriptionTier.FREE))
    }

    @Test
    fun `replacement modes come from the non-deprecated enum`() {
        // SubscriptionUpdateParams.ReplacementMode numbers DEFERRED 6, the
        // ProductDetailsParams one numbers it 5. Mixing them up would send
        // KEEP_EXISTING. Pin the values this code sends.
        assertEquals(2, PurchasePlan.Upgrade("t").replacementMode)
        assertEquals(5, PurchasePlan.Downgrade("t").replacementMode)
    }

    // endregion

    // region chooseOffer

    private data class Offer(val basePlanId: String, val token: String)

    private val offers = listOf(
        Offer("monthly", "tok-monthly"),
        Offer("annual", "tok-annual"),
        Offer("annual", "tok-annual-promo"),
    )

    @Test
    fun `no configured base plan keeps the first offer`() {
        assertEquals("tok-monthly", chooseOffer(offers, null) { it.basePlanId }?.token)
        assertEquals("tok-monthly", chooseOffer(offers, "") { it.basePlanId }?.token)
    }

    @Test
    fun `a configured base plan picks its first offer`() {
        assertEquals("tok-annual", chooseOffer(offers, "annual") { it.basePlanId }?.token)
    }

    @Test
    fun `a configured base plan Play does not return falls back to the first offer`() {
        assertEquals("tok-monthly", chooseOffer(offers, "weekly") { it.basePlanId }?.token)
    }

    @Test
    fun `no offers means nothing to sell`() {
        assertNull(chooseOffer(emptyList<Offer>(), "annual") { it.basePlanId })
    }

    // endregion

    // region launchFailureMessage

    @Test
    fun `a user who backs out sees no error`() {
        assertNull(launchFailureMessage(BillingResponseCode.OK))
        assertNull(launchFailureMessage(BillingResponseCode.USER_CANCELED))
    }

    @Test
    fun `connection failures say billing is unavailable`() {
        listOf(
            BillingResponseCode.SERVICE_DISCONNECTED,
            BillingResponseCode.SERVICE_UNAVAILABLE,
            BillingResponseCode.BILLING_UNAVAILABLE,
            BillingResponseCode.NETWORK_ERROR,
        ).forEach {
            assertEquals(BillingService.BillingError.BILLING_UNAVAILABLE.message, launchFailureMessage(it))
        }
    }

    @Test
    fun `every other failure maps to a visible message`() {
        listOf(
            BillingResponseCode.ERROR,
            BillingResponseCode.DEVELOPER_ERROR,
            BillingResponseCode.FEATURE_NOT_SUPPORTED,
            BillingResponseCode.ITEM_UNAVAILABLE,
            BillingResponseCode.ITEM_ALREADY_OWNED,
        ).forEach { code ->
            val message = launchFailureMessage(code)
            assertNotNull(message, "code $code")
            assertTrue(message!!.isNotBlank())
        }
    }

    // endregion

    // region paywall copy

    @Test
    fun `the button names a tier change for what it is`() {
        assertEquals("Upgrade to VIP", purchaseButtonLabel(PurchasePlan.Upgrade("t"), SubscriptionTier.VIP))
        assertEquals("Switch to Insider", purchaseButtonLabel(PurchasePlan.Downgrade("t"), SubscriptionTier.INSIDER))
        assertEquals("Subscribe", purchaseButtonLabel(PurchasePlan.New, SubscriptionTier.INSIDER))
        assertEquals("Subscribe", purchaseButtonLabel(null, null))
    }

    @Test
    fun `every disclosure carries Play's price`() {
        listOf(PurchasePlan.New, PurchasePlan.Upgrade("t"), PurchasePlan.Downgrade("t")).forEach { plan ->
            assertTrue(renewalDisclosure(plan, SubscriptionTier.VIP, "EUR 12,49").contains("EUR 12,49"))
        }
        assertTrue(renewalDisclosure(PurchasePlan.Downgrade("t"), SubscriptionTier.INSIDER, "$4.99").contains("until it renews"))
    }

    // endregion
}
