package com.desmoines.aipulse.ui.screens.profile

import com.desmoines.aipulse.data.repository.AuthRepository
import com.desmoines.aipulse.util.AnalyticsService
import com.desmoines.aipulse.util.ConsentService
import com.desmoines.aipulse.util.OnboardingPreferences
import com.desmoines.aipulse.util.PlaySubscriptionLinks
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
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test

/**
 * AND-OVH-010: delete-user-account reports store subscriptions it cannot cancel
 * in `store_subscriptions_still_active`. Android used to read only `success`
 * and sign out, so a Play subscriber lost the account and kept the charge with
 * nothing on screen to say so.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class ProfileViewModelDeletionTest {

    private val testDispatcher = StandardTestDispatcher()
    private lateinit var authRepository: AuthRepository

    // The exact shape delete-user-account returns (index.ts, cancelBillingBeforeErasure.ts).
    private val withPlay = """
        {"success":true,"complete":true,"storage_files_removed":0,"subscriptions_cancelled":0,
         "store_subscriptions_still_active":[{"platform":"android","manageUrl":"https://play.google.com/store/account/subscriptions"}]}
    """.trimIndent()
    private val withoutField = """{"success":true,"complete":true,"storage_files_removed":3}"""
    private val emptyList = """{"success":true,"complete":true,"store_subscriptions_still_active":[]}"""

    @BeforeEach
    fun setup() {
        Dispatchers.setMain(testDispatcher)
        authRepository = mockk(relaxed = true)
        every { authRepository.sessionStatus } returns null
        coEvery { authRepository.signOut() } returns Result.success(Unit)
    }

    @AfterEach
    fun tearDown() {
        Dispatchers.resetMain()
    }

    private fun vm(): ProfileViewModel {
        val consentService = mockk<ConsentService>(relaxed = true)
        every { consentService.locationConsent } returns MutableStateFlow(false)
        every { consentService.analyticsConsent } returns MutableStateFlow(true)
        return ProfileViewModel(
            authRepository,
            mockk<OnboardingPreferences>(relaxed = true),
            consentService,
            mockk<AnalyticsService>(relaxed = true),
        )
    }

    // MARK: - Decoding

    @Test
    fun `a Play subscription in the response yields the Play notice`() {
        val result = AccountDeletionResponse.parse(withPlay, packageName = "com.desmoines.aipulse")

        assertTrue(result.succeeded)
        val notice = requireNotNull(result.notice)
        assertTrue(notice.isGooglePlay)
        assertEquals(
            "Your Google Play subscription is still active. Cancel it in Google Play to stop billing.",
            notice.message,
        )
        assertEquals(PlaySubscriptionLinks.manageUrl(null, "com.desmoines.aipulse"), notice.manageUrl)
    }

    @Test
    fun `a response without the field decodes with no notice`() {
        val result = AccountDeletionResponse.parse(withoutField)

        assertTrue(result.succeeded)
        assertNull(result.notice)
    }

    @Test
    fun `an empty list decodes with no notice`() {
        assertNull(AccountDeletionResponse.parse(emptyList).notice)
    }

    @Test
    fun `a bare true is treated as a Play subscription`() {
        val notice = AccountDeletionResponse.parse("""{"success":true,"store_subscriptions_still_active":true}""").notice

        assertTrue(notice!!.isGooglePlay)
    }

    @Test
    fun `an App Store subscription alone gets the generic notice and Apple's link`() {
        val notice = AccountDeletionResponse.parse(
            """{"success":true,"store_subscriptions_still_active":[{"platform":"ios","manageUrl":"https://apps.apple.com/account/subscriptions"}]}"""
        ).notice!!

        assertFalse(notice.isGooglePlay)
        assertEquals(AccountDeletionResponse.OTHER_STORE_NOTICE, notice.message)
        assertEquals("https://apps.apple.com/account/subscriptions", notice.manageUrl)
    }

    @Test
    fun `a failed or unreadable response is not a success`() {
        assertFalse(AccountDeletionResponse.parse("""{"success":false}""").succeeded)
        assertFalse(AccountDeletionResponse.parse("not json").succeeded)
    }

    @Test
    fun `the confirmation copy says deletion does not cancel Google Play`() {
        assertTrue(AccountDeletionResponse.CONFIRMATION_TEXT.contains("doesn't cancel a Google Play subscription"))
    }

    // MARK: - UI state

    @Test
    fun `a Play subscription holds sign-out until the notice is acknowledged`() = runTest(testDispatcher) {
        val viewModel = vm()

        viewModel.finishDeletion(withPlay)
        advanceUntilIdle()

        assertTrue(viewModel.storeSubscriptionNotice.value!!.isGooglePlay)
        coVerify(exactly = 0) { authRepository.signOut() }

        viewModel.acknowledgeStoreSubscriptionNotice()
        advanceUntilIdle()

        assertNull(viewModel.storeSubscriptionNotice.value)
        coVerify(exactly = 1) { authRepository.signOut() }
    }

    @Test
    fun `no store subscription signs out straight away with no notice`() = runTest(testDispatcher) {
        val viewModel = vm()

        viewModel.finishDeletion(withoutField)
        advanceUntilIdle()

        assertNull(viewModel.storeSubscriptionNotice.value)
        coVerify(exactly = 1) { authRepository.signOut() }
    }

    @Test
    fun `an unsuccessful confirm throws and does not sign out`() = runTest(testDispatcher) {
        val viewModel = vm()

        val outcome = runCatching { viewModel.finishDeletion("""{"success":false}""") }

        assertTrue(outcome.isFailure)
        assertNull(viewModel.storeSubscriptionNotice.value)
        coVerify(exactly = 0) { authRepository.signOut() }
    }
}
