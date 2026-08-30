package com.desmoines.aipulse.ui.components.ads

import com.desmoines.aipulse.data.model.CampaignAd
import com.desmoines.aipulse.data.model.SubscriptionTier
import com.desmoines.aipulse.data.remote.AdTrackingService
import com.desmoines.aipulse.data.remote.BillingService
import com.desmoines.aipulse.data.remote.CampaignAdService
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.every
import io.mockk.mockk
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test

@OptIn(ExperimentalCoroutinesApi::class)
class AdSlotViewModelTest {

    private val testDispatcher = StandardTestDispatcher()
    private lateinit var campaignAdService: CampaignAdService
    private lateinit var billingService: BillingService
    private lateinit var adTrackingService: AdTrackingService

    @BeforeEach
    fun setup() {
        Dispatchers.setMain(testDispatcher)
        campaignAdService = mockk(relaxed = true)
        billingService = mockk(relaxed = true)
        adTrackingService = mockk(relaxed = true)
        every { adTrackingService.canShow(any()) } returns true
    }

    @AfterEach
    fun tearDown() = Dispatchers.resetMain()

    private fun vm() = AdSlotViewModel(campaignAdService, billingService, adTrackingService)

    @Test
    fun `free tier loads the ad`() = runTest(testDispatcher) {
        every { billingService.currentTier } returns MutableStateFlow(SubscriptionTier.FREE)
        val ad = CampaignAd(campaignId = "c", creativeId = "cr", title = "Taco Tuesday")
        coEvery { campaignAdService.fetchAd("below_fold", false) } returns ad
        val viewModel = vm()

        viewModel.load("below_fold")
        advanceUntilIdle()

        assertEquals("Taco Tuesday", viewModel.ad.value?.title)
        coVerify { campaignAdService.fetchAd("below_fold", isPremium = false) }
    }

    @Test
    fun `premium tier passes isPremium true and renders nothing`() = runTest(testDispatcher) {
        every { billingService.currentTier } returns MutableStateFlow(SubscriptionTier.VIP)
        coEvery { campaignAdService.fetchAd("below_fold", true) } returns null
        val viewModel = vm()

        viewModel.load("below_fold")
        advanceUntilIdle()

        assertNull(viewModel.ad.value)
        coVerify { campaignAdService.fetchAd("below_fold", isPremium = true) }
    }

    @Test
    fun `frequency-capped campaign is not shown`() = runTest(testDispatcher) {
        every { billingService.currentTier } returns MutableStateFlow(SubscriptionTier.FREE)
        every { adTrackingService.canShow("c") } returns false
        coEvery { campaignAdService.fetchAd("below_fold", false) } returns
            CampaignAd(campaignId = "c", creativeId = "cr", title = "Capped")
        val viewModel = vm()

        viewModel.load("below_fold")
        advanceUntilIdle()

        assertNull(viewModel.ad.value)
    }
}
