package com.desmoines.aipulse.ui.screens.auth

import com.desmoines.aipulse.data.remote.BillingService
import com.desmoines.aipulse.data.repository.AuthRepository
import com.desmoines.aipulse.ui.screens.auth.AuthViewModel.PasswordStrength
import com.desmoines.aipulse.util.BiometricAuthService
import com.desmoines.aipulse.util.SessionTimeoutService
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.every
import io.mockk.mockk
import io.mockk.verify
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.emptyFlow
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.advanceTimeBy
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Nested
import org.junit.jupiter.api.Test

@OptIn(ExperimentalCoroutinesApi::class)
class AuthViewModelTest {

    private val testDispatcher = StandardTestDispatcher()
    private lateinit var authRepository: AuthRepository
    private lateinit var biometricAuthService: BiometricAuthService
    private lateinit var billingService: BillingService
    private lateinit var sessionTimeoutService: SessionTimeoutService
    private lateinit var viewModel: AuthViewModel

    @BeforeEach
    fun setup() {
        Dispatchers.setMain(testDispatcher)
        authRepository = mockk(relaxed = true)
        biometricAuthService = mockk(relaxed = true)
        billingService = mockk(relaxed = true)
        sessionTimeoutService = mockk(relaxed = true)
        every { authRepository.sessionStatus } returns emptyFlow()
        viewModel = AuthViewModel(
            authRepository,
            biometricAuthService,
            billingService,
            sessionTimeoutService,
        )
    }

    @AfterEach
    fun tearDown() {
        Dispatchers.resetMain()
    }

    @Test
    fun `signing out leaves the biometric lock alone`() = runTest {
        // signOut used to call biometricAuthService.reset(), which deleted the
        // biometric preference. That was a second path to the same defect
        // AND-AUDIT-024 fixes in SecureStorage: making deleteUserData() preserve
        // the key achieves nothing while another caller clears it directly.
        // Biometric enrolment belongs to the device, not the account.
        viewModel.signOut()
        advanceUntilIdle()

        verify(exactly = 0) { biometricAuthService.disable() }
    }

    @Nested
    inner class EmailValidation {

        @Test
        fun `empty email is valid (no error shown)`() {
            assertTrue(viewModel.isEmailValid(""))
        }

        @Test
        fun `valid email passes`() {
            assertTrue(viewModel.isEmailValid("user@example.com"))
        }

        @Test
        fun `valid email with subdomain passes`() {
            assertTrue(viewModel.isEmailValid("user@sub.example.com"))
        }

        @Test
        fun `email without @ fails`() {
            assertFalse(viewModel.isEmailValid("userexample.com"))
        }

        @Test
        fun `email without domain fails`() {
            assertFalse(viewModel.isEmailValid("user@"))
        }

        @Test
        fun `email without TLD fails`() {
            assertFalse(viewModel.isEmailValid("user@example"))
        }

        @Test
        fun `email with spaces fails`() {
            assertFalse(viewModel.isEmailValid("user @example.com"))
        }
    }

    @Nested
    inner class PasswordStrengthScoring {

        @Test
        fun `empty password returns NONE`() {
            assertEquals(PasswordStrength.NONE, viewModel.passwordStrength(""))
        }

        @Test
        fun `short lowercase-only password is WEAK`() {
            // score = 1 (lowercase) -> WEAK
            assertEquals(PasswordStrength.WEAK, viewModel.passwordStrength("abc"))
        }

        @Test
        fun `8 char lowercase is WEAK`() {
            // score = 2 (length>=8, lowercase) -> WEAK
            assertEquals(PasswordStrength.WEAK, viewModel.passwordStrength("abcdefgh"))
        }

        @Test
        fun `8 char mixed case is MEDIUM`() {
            // score = 3 (length>=8, uppercase, lowercase) -> MEDIUM
            assertEquals(PasswordStrength.MEDIUM, viewModel.passwordStrength("Abcdefgh"))
        }

        @Test
        fun `8 char mixed case with number is MEDIUM`() {
            // score = 4 (length>=8, uppercase, lowercase, digit) -> MEDIUM
            assertEquals(PasswordStrength.MEDIUM, viewModel.passwordStrength("Abcdefg1"))
        }

        @Test
        fun `12 char mixed case with number is STRONG`() {
            // score = 5 (length>=8, length>=12, uppercase, lowercase, digit) -> STRONG
            assertEquals(PasswordStrength.STRONG, viewModel.passwordStrength("Abcdefghijk1"))
        }

        @Test
        fun `12 char all criteria is STRONG`() {
            // score = 6 (length>=8, length>=12, uppercase, lowercase, digit, special) -> STRONG
            assertEquals(PasswordStrength.STRONG, viewModel.passwordStrength("Abcdefghij1!"))
        }

        @Test
        fun `short with special char and digit is MEDIUM`() {
            // score = 4 (lowercase, uppercase, digit, special) — no length bonuses -> MEDIUM
            assertEquals(PasswordStrength.MEDIUM, viewModel.passwordStrength("Ab1!"))
        }
    }

    @Nested
    inner class PasswordMatching {

        @Test
        fun `matching passwords return true`() {
            assertTrue(viewModel.passwordsMatch("password123", "password123"))
        }

        @Test
        fun `non-matching passwords return false`() {
            assertFalse(viewModel.passwordsMatch("password123", "password456"))
        }

        @Test
        fun `empty passwords match`() {
            assertTrue(viewModel.passwordsMatch("", ""))
        }
    }

    @Nested
    inner class RateLimiting {

        @Test
        fun `not locked out initially`() {
            assertFalse(viewModel.isLockedOut)
            assertEquals(0, viewModel.lockoutSecondsRemaining.value)
        }

        @Test
        fun `lockout after max failed attempts`() = runTest {
            coEvery { authRepository.signIn(any(), any()) } returns Result.failure(RuntimeException("Invalid"))

            // Attempt sign in 5 times (MAX_AUTH_ATTEMPTS = 5)
            // Use advanceTimeBy(1) instead of advanceUntilIdle() to avoid
            // completing the lockout countdown timer (60 × delay(1000))
            repeat(5) {
                viewModel.signIn("bad@test.com", "wrongpass")
                advanceTimeBy(1)
            }

            assertTrue(viewModel.isLockedOut)
            assertTrue(viewModel.lockoutSecondsRemaining.value > 0)
        }

        @Test
        fun `sign in blocked when locked out`() = runTest {
            coEvery { authRepository.signIn(any(), any()) } returns Result.failure(RuntimeException("Invalid"))

            // Trigger lockout
            repeat(5) {
                viewModel.signIn("bad@test.com", "wrongpass")
                advanceTimeBy(1)
            }

            // Next attempt should be blocked (no additional repository call)
            val callCountBefore = 5 // already called 5 times
            viewModel.signIn("good@test.com", "goodpass")
            advanceTimeBy(1)

            coVerify(exactly = callCountBefore) { authRepository.signIn(any(), any()) }
        }
    }

    @Test
    fun `signIn calls repository on success`() = runTest {
        coEvery { authRepository.signIn(any(), any()) } returns Result.success(Unit)

        viewModel.signIn("user@test.com", "password123")
        advanceUntilIdle()

        coVerify { authRepository.signIn("user@test.com", "password123") }
    }

    @Test
    fun `clearError resets error message`() = runTest {
        coEvery { authRepository.signIn(any(), any()) } returns Result.failure(RuntimeException("Error"))
        viewModel.signIn("user@test.com", "pass")
        advanceUntilIdle()

        viewModel.clearError()
        advanceUntilIdle()

        assertEquals(null, viewModel.errorMessage.value)
    }
}
