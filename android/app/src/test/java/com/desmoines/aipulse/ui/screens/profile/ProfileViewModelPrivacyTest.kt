package com.desmoines.aipulse.ui.screens.profile

import com.desmoines.aipulse.data.repository.AuthRepository
import com.desmoines.aipulse.util.AnalyticsService
import com.desmoines.aipulse.util.ConsentService
import com.desmoines.aipulse.util.OnboardingPreferences
import io.mockk.every
import io.mockk.mockk
import io.mockk.verify
import io.mockk.verifyOrder
import kotlinx.coroutines.flow.MutableStateFlow
import org.junit.jupiter.api.Test

/**
 * ANDP-067: the Settings analytics toggle must actually drive the opt-out —
 * revoke consent in ConsentService and re-apply Firebase collection state.
 */
class ProfileViewModelPrivacyTest {

    private val consentService = mockk<ConsentService>(relaxed = true)
    private val analyticsService = mockk<AnalyticsService>(relaxed = true)
    private val authRepository = mockk<AuthRepository>(relaxed = true)
    private val onboardingPreferences = mockk<OnboardingPreferences>(relaxed = true)

    private fun vm(): ProfileViewModel {
        every { consentService.locationConsent } returns MutableStateFlow(false)
        every { consentService.emailConsent } returns MutableStateFlow(false)
        every { consentService.analyticsConsent } returns MutableStateFlow(true)
        // No session flow → the auth listener returns before touching viewModelScope.
        every { authRepository.sessionStatus } returns null
        return ProfileViewModel(authRepository, onboardingPreferences, consentService, analyticsService)
    }

    @Test
    fun `opting out revokes analytics consent and re-applies collection`() {
        vm().setAnalyticsConsent(false)

        verifyOrder {
            consentService.setAnalyticsConsent(false)
            analyticsService.applyConsent()
        }
    }

    @Test
    fun `opting back in grants consent and re-applies collection`() {
        vm().setAnalyticsConsent(true)

        verify { consentService.setAnalyticsConsent(true) }
        verify { analyticsService.applyConsent() }
    }

    @Test
    fun `location and email toggles route to ConsentService`() {
        val viewModel = vm()
        viewModel.setLocationConsent(false)
        viewModel.setEmailConsent(true)

        verify { consentService.setLocationConsent(false) }
        verify { consentService.setEmailConsent(true) }
    }
}
