package com.desmoines.aipulse.ui.components.ads

import com.desmoines.aipulse.data.model.SponsoredPick
import com.desmoines.aipulse.data.remote.AdTrackingService
import com.desmoines.aipulse.data.remote.SponsoredPickService
import io.mockk.coEvery
import io.mockk.mockk
import io.mockk.verify
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
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
class SponsoredPickViewModelTest {

    private val testDispatcher = StandardTestDispatcher()
    private lateinit var sponsoredPickService: SponsoredPickService
    private lateinit var adTrackingService: AdTrackingService

    @BeforeEach
    fun setup() {
        Dispatchers.setMain(testDispatcher)
        sponsoredPickService = mockk(relaxed = true)
        adTrackingService = mockk(relaxed = true)
    }

    @AfterEach
    fun tearDown() = Dispatchers.resetMain()

    private fun vm() = SponsoredPickViewModel(sponsoredPickService, adTrackingService)

    private fun pick() = SponsoredPick(
        itemType = "restaurant", itemId = "r1", title = "El Bait Shop", reason = "Local favorite", campaignId = "c1",
    )

    @Test
    fun `load surfaces the pick and tracks impression then click`() = runTest(testDispatcher) {
        coEvery { sponsoredPickService.fetch("ask_pulse", null) } returns pick()
        val viewModel = vm()

        viewModel.load("ask_pulse", null)
        advanceUntilIdle()
        assertEquals("r1", viewModel.pick.value?.itemId)

        viewModel.onImpression("ask_pulse")
        verify { adTrackingService.recordSponsoredImpression("c1", "ask_pulse") }

        viewModel.onClick("ask_pulse")
        verify { adTrackingService.recordSponsoredClick("c1", "ask_pulse") }
    }

    @Test
    fun `no inventory leaves pick null and tracks nothing`() = runTest(testDispatcher) {
        coEvery { sponsoredPickService.fetch(any(), any()) } returns null
        val viewModel = vm()

        viewModel.load("surprise_me", null)
        advanceUntilIdle()
        viewModel.onImpression("surprise_me")

        assertNull(viewModel.pick.value)
    }
}
