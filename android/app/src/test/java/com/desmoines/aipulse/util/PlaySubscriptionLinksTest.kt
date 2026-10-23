package com.desmoines.aipulse.util

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class PlaySubscriptionLinksTest {

    @Test
    fun `builds Play's documented manage URL for one subscription`() {
        assertEquals(
            "https://play.google.com/store/account/subscriptions?sku=insider_monthly&package=com.desmoines.aipulse",
            PlaySubscriptionLinks.manageUrl("insider_monthly", "com.desmoines.aipulse"),
        )
    }

    @Test
    fun `uses the real product ids from Config`() {
        assertEquals(
            "https://play.google.com/store/account/subscriptions?sku=vip_monthly&package=com.desmoines.aipulse",
            PlaySubscriptionLinks.manageUrl(Config.VIP_MONTHLY_PRODUCT_ID, "com.desmoines.aipulse"),
        )
    }

    @Test
    fun `a missing sku falls back to Play's subscription list`() {
        assertEquals(PlaySubscriptionLinks.SUBSCRIPTIONS_URL, PlaySubscriptionLinks.manageUrl(null, "com.desmoines.aipulse"))
        assertEquals(PlaySubscriptionLinks.SUBSCRIPTIONS_URL, PlaySubscriptionLinks.manageUrl("  ", "com.desmoines.aipulse"))
    }

    @Test
    fun `query values are encoded so a stray character cannot add parameters`() {
        val url = PlaySubscriptionLinks.manageUrl("a&b=c", "com.desmoines.aipulse")
        assertEquals(
            "https://play.google.com/store/account/subscriptions?sku=a%26b%3Dc&package=com.desmoines.aipulse",
            url,
        )
    }

    @Test
    fun `the result is a URL SafeLinkLauncher will open`() {
        assertTrue(SafeLinkLauncher.isSafeWebUrl(PlaySubscriptionLinks.manageUrl("vip_monthly", "com.desmoines.aipulse")))
    }
}
