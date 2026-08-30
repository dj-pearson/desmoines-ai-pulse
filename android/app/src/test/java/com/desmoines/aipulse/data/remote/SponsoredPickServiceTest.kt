package com.desmoines.aipulse.data.remote

import com.desmoines.aipulse.data.model.SubscriptionTier
import io.mockk.every
import io.mockk.mockk
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.Json
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test

@OptIn(ExperimentalCoroutinesApi::class)
class SponsoredPickServiceTest {

    private lateinit var billingService: BillingService
    private val json = Json { ignoreUnknownKeys = true }

    @BeforeEach
    fun setup() {
        billingService = mockk(relaxed = true)
    }

    private fun service() = SponsoredPickService(supabaseClient = null, billingService = billingService, json = json)

    @Test
    fun `premium tier short-circuits to null without a network call`() = runTest {
        every { billingService.currentTier } returns MutableStateFlow(SubscriptionTier.VIP)
        assertNull(service().fetch(SponsoredPickService.Surface.ASK_PULSE, query = null))
    }

    @Test
    fun `free tier with no client yields null`() = runTest {
        every { billingService.currentTier } returns MutableStateFlow(SubscriptionTier.FREE)
        assertNull(service().fetch(SponsoredPickService.Surface.SURPRISE_ME, query = "tacos"))
    }
}
