package com.desmoines.aipulse.ui.screens.profile

import com.desmoines.aipulse.data.repository.AuthRepository
import com.desmoines.aipulse.util.AnalyticsService
import com.desmoines.aipulse.util.ConsentService
import com.desmoines.aipulse.util.OnboardingPreferences
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
import org.junit.jupiter.api.Assertions.assertNotNull
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test

/**
 * The Android email opt-out has to reach the server (WEB-LEGAL-012 AC4).
 *
 * The toggle existed before this and wrote only SecureStorage, so it stopped no
 * mail at all: every sender gates on profiles.communication_preferences. It also
 * started OFF for everyone, because an unset boolean reads false while the
 * server reads a missing key as consent, so the screen showed an opt-out the
 * user did not have and could not get.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class ProfileViewModelEmailConsentTest {

    private val testDispatcher = StandardTestDispatcher()
    private lateinit var consentService: ConsentService
    private lateinit var analyticsService: AnalyticsService
    private lateinit var authRepository: AuthRepository
    private lateinit var onboardingPreferences: OnboardingPreferences

    @BeforeEach
    fun setup() {
        Dispatchers.setMain(testDispatcher)
        consentService = mockk(relaxed = true)
        analyticsService = mockk(relaxed = true)
        authRepository = mockk(relaxed = true)
        onboardingPreferences = mockk(relaxed = true)
        every { consentService.locationConsent } returns MutableStateFlow(false)
        every { consentService.analyticsConsent } returns MutableStateFlow(true)
        // No session flow - the auth listener returns before touching viewModelScope.
        every { authRepository.sessionStatus } returns null
        // Result is a value class, so a relaxed mock hands back a bare Object and
        // the cast blows up at the call site rather than at the stub. Every
        // Result-returning call this test can reach needs a real one.
        coEvery { authRepository.fetchProfile(any()) } returns Result.success(null)
        coEvery { authRepository.isEmailMarketingAllowed(any()) } returns Result.success(true)
        coEvery { authRepository.setEmailMarketingAllowed(any(), any()) } returns Result.success(Unit)
    }

    @AfterEach
    fun tearDown() = Dispatchers.resetMain()

    private fun vm() = ProfileViewModel(authRepository, onboardingPreferences, consentService, analyticsService)

    @Test
    fun `starts opted in, because absence means consent on the server`() {
        assertTrue(vm().emailConsent.value)
    }

    @Test
    fun `opting out writes through to the profile`() = runTest(testDispatcher) {
        every { authRepository.currentUserId } returns "user-1"
        coEvery { authRepository.setEmailMarketingAllowed("user-1", false) } returns Result.success(Unit)

        val viewModel = vm()
        viewModel.setEmailConsent(false)
        advanceUntilIdle()

        coVerify { authRepository.setEmailMarketingAllowed("user-1", false) }
        assertEquals(false, viewModel.emailConsent.value)
        assertNull(viewModel.emailConsentError.value)
    }

    @Test
    fun `a failed write rolls the toggle back and says so`() = runTest(testDispatcher) {
        every { authRepository.currentUserId } returns "user-1"
        coEvery { authRepository.setEmailMarketingAllowed(any(), any()) } returns
            Result.failure(IllegalStateException("offline"))

        val viewModel = vm()
        viewModel.setEmailConsent(false)
        advanceUntilIdle()

        // Leaving it off would show an opt-out the server does not have, and the
        // only evidence would be mail the user already asked us to stop.
        assertTrue(viewModel.emailConsent.value, "toggle stayed off after the write failed")
        assertNotNull(viewModel.emailConsentError.value, "a silent failure on a consent control")
    }

    @Test
    fun `signed out, it stays local and calls no repository`() = runTest(testDispatcher) {
        every { authRepository.currentUserId } returns null

        val viewModel = vm()
        viewModel.setEmailConsent(false)
        advanceUntilIdle()

        coVerify(exactly = 0) { authRepository.setEmailMarketingAllowed(any(), any()) }
        assertEquals(false, viewModel.emailConsent.value)
    }

    @Test
    fun `loading a profile seeds the toggle from the server`() = runTest(testDispatcher) {
        every { authRepository.currentUserId } returns "user-1"
        coEvery { authRepository.isEmailMarketingAllowed("user-1") } returns Result.success(false)

        val viewModel = vm()
        viewModel.loadProfile()
        advanceUntilIdle()

        assertEquals(false, viewModel.emailConsent.value)
    }
}
