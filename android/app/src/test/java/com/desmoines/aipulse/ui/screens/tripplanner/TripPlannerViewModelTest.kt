package com.desmoines.aipulse.ui.screens.tripplanner

import com.desmoines.aipulse.data.model.PaywallContext
import com.desmoines.aipulse.data.model.SubscriptionTier
import com.desmoines.aipulse.data.model.TripPlan
import com.desmoines.aipulse.data.remote.BillingService
import com.desmoines.aipulse.data.repository.AuthRepository
import com.desmoines.aipulse.data.repository.TripPlannerRepository
import com.desmoines.aipulse.util.NetworkMonitor
import com.desmoines.aipulse.util.SoftPaywallService
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.every
import io.mockk.mockk
import io.mockk.verify
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
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test

@OptIn(ExperimentalCoroutinesApi::class)
class TripPlannerViewModelTest {

    private val testDispatcher = StandardTestDispatcher()
    private lateinit var repository: TripPlannerRepository
    private lateinit var billingService: BillingService
    private lateinit var softPaywall: SoftPaywallService
    private lateinit var authRepository: AuthRepository
    private lateinit var networkMonitor: NetworkMonitor

    @BeforeEach
    fun setup() {
        Dispatchers.setMain(testDispatcher)
        repository = mockk(relaxed = true)
        billingService = mockk(relaxed = true)
        softPaywall = mockk(relaxed = true)
        authRepository = mockk(relaxed = true)
        networkMonitor = mockk(relaxed = true)
        every { networkMonitor.isConnected } returns MutableStateFlow(true)
        coEvery { repository.monthlyTripCount(any()) } returns 0
    }

    @AfterEach
    fun tearDown() = Dispatchers.resetMain()

    private fun vm(tier: SubscriptionTier): TripPlannerViewModel {
        every { billingService.currentTier } returns MutableStateFlow(tier)
        return TripPlannerViewModel(repository, billingService, softPaywall, authRepository, networkMonitor)
    }

    @Test
    fun `free tier triggers soft paywall and does not generate`() = runTest(testDispatcher) {
        every { softPaywall.maybePresent(PaywallContext.TRIP_PLANNER) } returns true
        val viewModel = vm(SubscriptionTier.FREE)
        advanceUntilIdle()
        viewModel.toggleInterest("food")
        viewModel.generate()
        advanceUntilIdle()

        verify { softPaywall.maybePresent(PaywallContext.TRIP_PLANNER) }
        coVerify(exactly = 0) { repository.generate(any(), any(), any()) }
        assertFalse(viewModel.uiState.value.navigateToSubscription)
    }

    @Test
    fun `free tier on cooldown routes to the hard paywall`() = runTest(testDispatcher) {
        every { softPaywall.maybePresent(any()) } returns false
        val viewModel = vm(SubscriptionTier.FREE)
        advanceUntilIdle()
        viewModel.toggleInterest("food")
        viewModel.generate()
        advanceUntilIdle()

        assertTrue(viewModel.uiState.value.navigateToSubscription)
        coVerify(exactly = 0) { repository.generate(any(), any(), any()) }
    }

    @Test
    fun `insider over quota routes to the hard paywall`() = runTest(testDispatcher) {
        coEvery { repository.monthlyTripCount(any()) } returns 5
        val viewModel = vm(SubscriptionTier.INSIDER)
        advanceUntilIdle()
        viewModel.toggleInterest("food")
        viewModel.generate()
        advanceUntilIdle()

        assertTrue(viewModel.uiState.value.navigateToSubscription)
        coVerify(exactly = 0) { repository.generate(any(), any(), any()) }
    }

    @Test
    fun `insider under quota generates and sets the result`() = runTest(testDispatcher) {
        coEvery { repository.monthlyTripCount(any()) } returns 0
        coEvery { repository.generate(any(), any(), any()) } returns
            Result.success(TripPlan(id = "t1", title = "Trip"))
        val viewModel = vm(SubscriptionTier.INSIDER)
        advanceUntilIdle()
        viewModel.toggleInterest("food")
        viewModel.generate()
        advanceUntilIdle()

        assertEquals("t1", viewModel.uiState.value.result?.id)
        assertFalse(viewModel.uiState.value.isGenerating)
    }

    @Test
    fun `generate is blocked when offline`() = runTest(testDispatcher) {
        every { networkMonitor.isConnected } returns MutableStateFlow(false)
        val viewModel = vm(SubscriptionTier.VIP)
        advanceUntilIdle()
        viewModel.toggleInterest("food")
        viewModel.generate()
        advanceUntilIdle()

        assertTrue(viewModel.uiState.value.errorMessage!!.contains("offline", ignoreCase = true))
        coVerify(exactly = 0) { repository.generate(any(), any(), any()) }
    }

    @Test
    fun `cannot generate without interests`() = runTest(testDispatcher) {
        val viewModel = vm(SubscriptionTier.VIP)
        advanceUntilIdle()

        assertFalse(viewModel.uiState.value.canGenerate)
        viewModel.generate()
        advanceUntilIdle()
        coVerify(exactly = 0) { repository.generate(any(), any(), any()) }
    }
}
