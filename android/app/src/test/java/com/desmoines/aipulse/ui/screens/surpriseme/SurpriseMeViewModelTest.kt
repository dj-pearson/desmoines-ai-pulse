package com.desmoines.aipulse.ui.screens.surpriseme

import com.desmoines.aipulse.data.model.SurprisePick
import com.desmoines.aipulse.data.remote.FavoritesException
import com.desmoines.aipulse.data.repository.AuthRepository
import com.desmoines.aipulse.data.repository.FavoritesRepository
import com.desmoines.aipulse.data.repository.FavoritesState
import com.desmoines.aipulse.data.repository.SurpriseMeException
import com.desmoines.aipulse.data.repository.SurpriseMeRepository
import com.desmoines.aipulse.util.SoftPaywallService
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.every
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
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNotNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test

@OptIn(ExperimentalCoroutinesApi::class)
class SurpriseMeViewModelTest {

    private val testDispatcher = StandardTestDispatcher()
    private lateinit var repository: SurpriseMeRepository
    private lateinit var favoritesRepository: FavoritesRepository
    private lateinit var authRepository: AuthRepository
    private lateinit var softPaywallService: SoftPaywallService

    @BeforeEach
    fun setup() {
        Dispatchers.setMain(testDispatcher)
        repository = mockk(relaxed = true)
        favoritesRepository = mockk(relaxed = true)
        authRepository = mockk(relaxed = true)
        softPaywallService = mockk(relaxed = true)
        every { authRepository.currentUserId } returns "u1"
        // Result is a value class — relaxed mocks can't synthesize one, so stub it.
        coEvery { favoritesRepository.loadFavorites(any()) } returns Result.success(FavoritesState())
    }

    @AfterEach
    fun tearDown() = Dispatchers.resetMain()

    private fun pick(id: String = "e1", type: String = "event") =
        SurprisePick(itemType = type, itemId = id, title = "Pick $id", reason = "because")

    private fun vm() = SurpriseMeViewModel(repository, favoritesRepository, authRepository, softPaywallService)

    @Test
    fun `roll reveals a pick and tracks shown`() = runTest(testDispatcher) {
        coEvery { repository.surprise(any(), any()) } returns Result.success(pick())
        val viewModel = vm()
        advanceUntilIdle()

        val state = viewModel.uiState.value
        assertFalse(state.isRolling)
        assertNotNull(state.pick)
        coVerify { repository.track(any(), "shown") }
    }

    @Test
    fun `roll failure surfaces the error message`() = runTest(testDispatcher) {
        coEvery { repository.surprise(any(), any()) } returns
            Result.failure(SurpriseMeException("No surprise pick available right now. Try again."))
        val viewModel = vm()
        advanceUntilIdle()

        val state = viewModel.uiState.value
        assertFalse(state.isRolling)
        assertEquals("No surprise pick available right now. Try again.", state.errorMessage)
    }

    @Test
    fun `try another tracks tried_another and rerolls`() = runTest(testDispatcher) {
        coEvery { repository.surprise(any(), any()) } returnsMany listOf(
            Result.success(pick("e1")),
            Result.success(pick("e2")),
        )
        val viewModel = vm()
        advanceUntilIdle()

        viewModel.tryAnother()
        advanceUntilIdle()

        assertEquals(1, viewModel.uiState.value.rollCount)
        assertEquals("e2", viewModel.uiState.value.pick?.itemId)
        coVerify { repository.track(match { it.itemId == "e1" }, "tried_another") }
    }

    @Test
    fun `save toggles favorite, tracks saved, and dismisses`() = runTest(testDispatcher) {
        coEvery { repository.surprise(any(), any()) } returns Result.success(pick("e1"))
        coEvery { favoritesRepository.toggleEventFavorite(any(), any(), any()) } returns Result.success(true)
        val viewModel = vm()
        advanceUntilIdle()

        viewModel.save()
        advanceUntilIdle()

        assertTrue(viewModel.uiState.value.dismiss)
        coVerify { repository.track(any(), "saved") }
    }

    @Test
    fun `save at the favorites cap presents the paywall and dismisses`() = runTest(testDispatcher) {
        coEvery { repository.surprise(any(), any()) } returns Result.success(pick("e1"))
        coEvery { favoritesRepository.toggleEventFavorite(any(), any(), any()) } returns
            Result.failure(FavoritesException.LimitReached(3))
        val viewModel = vm()
        advanceUntilIdle()

        viewModel.save()
        advanceUntilIdle()

        assertTrue(viewModel.uiState.value.dismiss)
        verify { softPaywallService.maybePresent(any()) }
    }
}
