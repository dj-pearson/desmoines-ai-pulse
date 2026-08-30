package com.desmoines.aipulse.data.remote

import com.desmoines.aipulse.data.model.CampaignAd
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.runTest
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

@OptIn(ExperimentalCoroutinesApi::class)
class CampaignAdServiceTest {

    private fun service() = CampaignAdService(supabaseClient = null)

    @Test
    fun `premium tier never gets an ad`() = runTest {
        // Returns before touching any client.
        assertNull(service().fetchAd("below_fold", isPremium = true))
    }

    @Test
    fun `no client yields null without throwing`() = runTest {
        assertNull(service().fetchAd("below_fold", isPremium = false))
    }

    @Test
    fun `renderable requires a title or image`() {
        assertTrue(CampaignAd(campaignId = "c", creativeId = "cr", title = "Hi").isRenderable)
        assertTrue(CampaignAd(campaignId = "c", creativeId = "cr", imageUrl = "http://x/y.png").isRenderable)
        assertFalse(CampaignAd(campaignId = "c", creativeId = "cr").isRenderable)
    }

    @Test
    fun `displayCta falls back to a default`() {
        assertTrue(CampaignAd(campaignId = "c", creativeId = "cr").displayCta == "Learn more")
        assertTrue(CampaignAd(campaignId = "c", creativeId = "cr", ctaText = "Shop now").displayCta == "Shop now")
    }
}
