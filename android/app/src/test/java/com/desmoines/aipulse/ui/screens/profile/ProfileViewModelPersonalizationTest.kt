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
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNotNull
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test

/**
 * The "Personalized suggestions" switch in Settings (XPLAT-016 AC2).
 *
 * get_personalized_recommendations_v2 answers no rows unless the account's
 * communication_preferences.event_recommendations is true, and before this the
 * app had no way to set it: an Android user who never visited the web could not
 * get a personalized For You at all.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class ProfileViewModelPersonalizationTest {

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
        every { authRepository.sessionStatus } returns null
        // Result is a value class; a relaxed mock cannot produce one.
        coEvery { authRepository.fetchProfile(any()) } returns Result.success(null)
        coEvery { authRepository.isEmailMarketingAllowed(any()) } returns Result.success(true)
        coEvery { authRepository.isPersonalizationEnabled(any()) } returns Result.success(false)
        coEvery { authRepository.setPersonalizationEnabled(any(), any()) } returns Result.success(Unit)
    }

    @AfterEach
    fun tearDown() = Dispatchers.resetMain()

    private fun vm() = ProfileViewModel(authRepository, onboardingPreferences, consentService, analyticsService)

    @Test
    fun `starts off, because the key is opt-in`() {
        assertFalse(vm().personalization.value)
    }

    @Test
    fun `loading a profile seeds the switch from the server`() = runTest(testDispatcher) {
        every { authRepository.currentUserId } returns "user-1"
        coEvery { authRepository.isPersonalizationEnabled("user-1") } returns Result.success(true)

        val viewModel = vm()
        viewModel.loadProfile()
        advanceUntilIdle()

        assertTrue(viewModel.personalization.value)
    }

    @Test
    fun `turning it on writes through to the profile`() = runTest(testDispatcher) {
        every { authRepository.currentUserId } returns "user-1"

        val viewModel = vm()
        viewModel.setPersonalization(true)
        advanceUntilIdle()

        coVerify { authRepository.setPersonalizationEnabled("user-1", true) }
        assertTrue(viewModel.personalization.value)
        assertNull(viewModel.personalizationError.value)
    }

    @Test
    fun `a failed write rolls the switch back and says so`() = runTest(testDispatcher) {
        every { authRepository.currentUserId } returns "user-1"
        coEvery { authRepository.setPersonalizationEnabled(any(), any()) } returns
            Result.failure(IllegalStateException("offline"))

        val viewModel = vm()
        viewModel.setPersonalization(true)
        advanceUntilIdle()

        assertFalse(viewModel.personalization.value, "switch stayed on after the write failed")
        assertNotNull(viewModel.personalizationError.value, "a silent failure on a consent control")
    }

    @Test
    fun `signed out, nothing changes and no repository call is made`() = runTest(testDispatcher) {
        every { authRepository.currentUserId } returns null

        val viewModel = vm()
        viewModel.setPersonalization(true)
        advanceUntilIdle()

        coVerify(exactly = 0) { authRepository.setPersonalizationEnabled(any(), any()) }
        assertEquals(false, viewModel.personalization.value)
    }
}
