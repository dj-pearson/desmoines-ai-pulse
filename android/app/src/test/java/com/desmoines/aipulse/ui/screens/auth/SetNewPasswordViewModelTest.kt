package com.desmoines.aipulse.ui.screens.auth

import com.desmoines.aipulse.data.repository.AuthRepository
import com.desmoines.aipulse.ui.screens.auth.SetNewPasswordViewModel.Exit
import com.desmoines.aipulse.util.AuthCallbackNotices
import com.desmoines.aipulse.util.PasswordRecoveryGate
import io.github.jan.supabase.auth.status.SessionStatus
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.every
import io.mockk.mockk
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.emptyFlow
import kotlinx.coroutines.flow.flowOf
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

/** AND-OVH-006 AC3/AC5: validation, the updateUser call, and both exits. */
@OptIn(ExperimentalCoroutinesApi::class)
class SetNewPasswordViewModelTest {

    private val testDispatcher = StandardTestDispatcher()
    private lateinit var authRepository: AuthRepository
    private lateinit var gate: PasswordRecoveryGate
    private lateinit var notices: AuthCallbackNotices

    private val goodPassword = "Harbor9Lights"

    @BeforeEach
    fun setup() {
        Dispatchers.setMain(testDispatcher)
        authRepository = mockk(relaxed = true)
        every { authRepository.sessionStatus } returns emptyFlow()
        gate = PasswordRecoveryGate().apply { require() }
        notices = AuthCallbackNotices(testDispatcher)
    }

    @AfterEach
    fun tearDown() {
        Dispatchers.resetMain()
    }

    private fun viewModel() = SetNewPasswordViewModel(authRepository, gate, notices)

    @Test
    fun `mismatched confirmation is refused before the server is called`() = runTest {
        val vm = viewModel()

        vm.save(goodPassword, "Harbor9Light")
        advanceUntilIdle()

        assertEquals("Passwords do not match.", vm.uiState.value.errorMessage)
        coVerify(exactly = 0) { authRepository.updatePassword(any()) }
        assertTrue(gate.required.value, "A refused password must leave the user on the screen.")
        assertNull(vm.uiState.value.exit)
    }

    @Test
    fun `a password under 8 characters is refused before the server is called`() = runTest {
        val vm = viewModel()

        vm.save("Ab1defg", "Ab1defg")
        advanceUntilIdle()

        assertEquals("Use at least 8 characters.", vm.uiState.value.errorMessage)
        coVerify(exactly = 0) { authRepository.updatePassword(any()) }
        assertTrue(gate.required.value)
    }

    @Test
    fun `a weak password is refused, as sign-up refuses it`() = runTest {
        val vm = viewModel()

        vm.save("aaaaaaaa", "aaaaaaaa")
        advanceUntilIdle()

        assertEquals("Too weak. Mix uppercase, lowercase and numbers.", vm.uiState.value.errorMessage)
        coVerify(exactly = 0) { authRepository.updatePassword(any()) }
    }

    @Test
    fun `success updates the password, opens the gate, confirms and leaves for Home`() = runTest {
        coEvery { authRepository.updatePassword(goodPassword) } returns Result.success(Unit)
        val vm = viewModel()

        vm.save(goodPassword, goodPassword)
        advanceUntilIdle()

        coVerify(exactly = 1) { authRepository.updatePassword(goodPassword) }
        assertFalse(gate.required.value)
        assertEquals(Exit.PASSWORD_SET, vm.uiState.value.exit)
        assertNull(vm.uiState.value.errorMessage)
        assertFalse(vm.uiState.value.isSaving)
        assertEquals(
            AuthCallbackNotices.Notice.PasswordUpdated(AuthCallbackNotices.PASSWORD_UPDATED_MESSAGE),
            notices.consume(),
        )
    }

    @Test
    fun `a server error is shown and keeps the user on the screen`() = runTest {
        coEvery { authRepository.updatePassword(any()) } returns
            Result.failure(RuntimeException("Too many requests"))
        val vm = viewModel()

        vm.save(goodPassword, goodPassword)
        advanceUntilIdle()

        assertEquals(
            "Too many attempts. Please wait a moment and try again.",
            vm.uiState.value.errorMessage,
        )
        assertTrue(gate.required.value)
        assertNull(vm.uiState.value.exit)
        assertFalse(vm.uiState.value.isSaving)
        assertNull(notices.consume())
    }

    @Test
    fun `signing out opens the gate and leaves`() = runTest {
        val vm = viewModel()

        vm.signOut()
        advanceUntilIdle()

        coVerify(exactly = 1) { authRepository.signOut() }
        assertFalse(gate.required.value)
        assertEquals(Exit.SIGNED_OUT, vm.uiState.value.exit)
    }

    @Test
    fun `a session ended elsewhere opens the gate`() = runTest {
        // The biometric lock's sign-out does not go through this screen. With
        // no session there is no password to set, so staying here is a trap.
        every { authRepository.sessionStatus } returns
            flowOf(SessionStatus.NotAuthenticated(isSignOut = true))
        val vm = viewModel()
        advanceUntilIdle()

        assertFalse(gate.required.value)
        assertEquals(Exit.SIGNED_OUT, vm.uiState.value.exit)
    }
}
