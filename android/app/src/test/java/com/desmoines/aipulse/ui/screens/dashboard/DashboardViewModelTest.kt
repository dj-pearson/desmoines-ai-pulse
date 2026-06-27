package com.desmoines.aipulse.ui.screens.dashboard

import com.desmoines.aipulse.data.model.TripPlan
import com.desmoines.aipulse.data.repository.AuthRepository
import com.desmoines.aipulse.data.repository.FavoritesRepository
import com.desmoines.aipulse.data.repository.FavoritesState
import com.desmoines.aipulse.data.repository.TripPlannerRepository
import com.desmoines.aipulse.util.RecentlyViewedService
import io.mockk.coEvery
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
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test

@OptIn(ExperimentalCoroutinesApi::class)
class DashboardViewModelTest {

    private val testDispatcher = StandardTestDispatcher()
    private lateinit var authRepository: AuthRepository
    private lateinit var tripPlannerRepository: TripPlannerRepository
    private lateinit var favoritesRepository: FavoritesRepository
    private lateinit var recentlyViewedService: RecentlyViewedService

    @BeforeEach
    fun setup() {
        Dispatchers.setMain(testDispatcher)
        authRepository = mockk(relaxed = true)
        tripPlannerRepository = mockk(relaxed = true)
        favoritesRepository = mockk(relaxed = true)
        recentlyViewedService = mockk(relaxed = true)
        every { recentlyViewedService.recent } returns MutableStateFlow(emptyList())
    }

    @AfterEach
    fun tearDown() = Dispatchers.resetMain()

    private fun vm() = DashboardViewModel(authRepository, tripPlannerRepository, favoritesRepository, recentlyViewedService)

    @Test
    fun `guest state when signed out`() = runTest(testDispatcher) {
        every { authRepository.currentUserId } returns null
        val viewModel = vm()
        advanceUntilIdle()

        assertFalse(viewModel.uiState.value.isAuthenticated)
        assertFalse(viewModel.uiState.value.isLoading)
    }

    @Test
    fun `signed-in loads up to three trips and favorite counts`() = runTest(testDispatcher) {
        every { authRepository.currentUserId } returns "u1"
        coEvery { tripPlannerRepository.fetchSavedTrips("u1") } returns Result.success(
            listOf(TripPlan(id = "t1"), TripPlan(id = "t2"), TripPlan(id = "t3"), TripPlan(id = "t4")),
        )
        coEvery { favoritesRepository.loadFavorites("u1") } returns Result.success(
            FavoritesState(favoriteEventIds = setOf("e1", "e2"), favoriteRestaurantIds = setOf("r1")),
        )
        val viewModel = vm()
        advanceUntilIdle()

        val state = viewModel.uiState.value
        assertTrue(state.isAuthenticated)
        assertEquals(3, state.trips.size)
        assertEquals(2, state.favoriteEvents)
        assertEquals(1, state.favoriteDining)
        assertEquals(3, state.totalFavorites)
        assertFalse(state.isLoading)
    }
}
