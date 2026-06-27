package com.desmoines.aipulse.ui.screens.groupsession

import com.desmoines.aipulse.data.model.ActiveGroupSession
import com.desmoines.aipulse.data.model.SwipeSession
import com.desmoines.aipulse.data.repository.AuthRepository
import com.desmoines.aipulse.data.repository.GroupSessionManager
import com.desmoines.aipulse.data.repository.GroupSessionRepository
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.every
import io.mockk.mockk
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
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
class GroupSessionViewModelTest {

    private val testDispatcher = StandardTestDispatcher()
    private lateinit var repository: GroupSessionRepository
    private lateinit var authRepository: AuthRepository
    private lateinit var manager: GroupSessionManager

    @BeforeEach
    fun setup() {
        Dispatchers.setMain(testDispatcher)
        repository = mockk(relaxed = true)
        authRepository = mockk(relaxed = true)
        manager = mockk(relaxed = true)
        every { authRepository.currentUserId } returns "u1"
        every { manager.activeSession } returns null
        coEvery { repository.fetchParticipants(any()) } returns Result.success(emptyList())
        coEvery { repository.fetchMatches(any()) } returns Result.success(emptyList())
    }

    @AfterEach
    fun tearDown() = Dispatchers.resetMain()

    private fun session(host: String = "u1") = SwipeSession(
        id = "s1", code = "DSM-AB12", hostUserId = host, mode = "mixed", status = "active",
        expiresAt = "2999-01-01T00:00:00Z",
    )

    private fun vm() = GroupSessionViewModel(repository, authRepository, manager)

    @Test
    fun `unauthenticated state when signed out`() {
        every { authRepository.currentUserId } returns null
        val viewModel = vm()
        assertFalse(viewModel.uiState.value.isAuthenticated)
    }

    @Test
    fun `create starts a session and marks host`() = runTest(testDispatcher) {
        coEvery { repository.createSession("u1", "mixed") } returns Result.success(session())
        coEvery { repository.fetchSession("s1") } returns Result.success(session())
        val viewModel = vm()

        viewModel.createSession()
        advanceUntilIdle()

        assertEquals("DSM-AB12", viewModel.uiState.value.session?.code)
        assertTrue(viewModel.uiState.value.isHost)
        coVerify { manager.setActive(match { it.sessionId == "s1" && it.isHost }) }
    }

    @Test
    fun `join by code enters the session as non-host`() = runTest(testDispatcher) {
        coEvery { repository.joinByCode("DSM-AB12", "u1", null) } returns Result.success(session(host = "other"))
        coEvery { repository.fetchSession("s1") } returns Result.success(session(host = "other"))
        val viewModel = vm()

        viewModel.onJoinCodeChanged("dsm-ab12")
        viewModel.joinSession()
        advanceUntilIdle()

        assertEquals("DSM-AB12", viewModel.uiState.value.joinCode)
        assertEquals("s1", viewModel.uiState.value.session?.id)
        assertFalse(viewModel.uiState.value.isHost)
    }

    @Test
    fun `join failure surfaces the message`() = runTest(testDispatcher) {
        coEvery { repository.joinByCode(any(), any(), any()) } returns Result.failure(IllegalStateException("That session has ended or expired."))
        val viewModel = vm()

        viewModel.onJoinCodeChanged("DSM-ZZZZ")
        viewModel.joinSession()
        advanceUntilIdle()

        assertEquals("That session has ended or expired.", viewModel.uiState.value.errorMessage)
    }

    @Test
    fun `end session updates status via repository`() = runTest(testDispatcher) {
        coEvery { repository.createSession("u1", "mixed") } returns Result.success(session())
        coEvery { repository.fetchSession("s1") } returns Result.success(session())
        coEvery { repository.endSession("s1") } returns Result.success(Unit)
        val viewModel = vm()
        viewModel.createSession()
        advanceUntilIdle()

        viewModel.endSession()
        advanceUntilIdle()

        coVerify { repository.endSession("s1") }
    }

    @Test
    fun `leave clears the manager and resets`() = runTest(testDispatcher) {
        coEvery { repository.createSession("u1", "mixed") } returns Result.success(session())
        coEvery { repository.fetchSession("s1") } returns Result.success(session())
        val viewModel = vm()
        viewModel.createSession()
        advanceUntilIdle()

        viewModel.leaveSession()

        assertFalse(viewModel.uiState.value.inSession)
        coVerify { manager.clear() }
    }

    @Test
    fun `restores an in-progress session from the manager`() = runTest(testDispatcher) {
        every { manager.activeSession } returns ActiveGroupSession("s1", "DSM-AB12", "mixed", isHost = true)
        coEvery { repository.fetchSession("s1") } returns Result.success(session())
        val viewModel = vm()
        advanceUntilIdle()

        assertEquals("s1", viewModel.uiState.value.session?.id)
        assertTrue(viewModel.uiState.value.isHost)
    }
}
