package com.desmoines.aipulse.ui.screens.restaurants

import com.desmoines.aipulse.data.model.RestaurantSortOption
import com.desmoines.aipulse.data.remote.RestaurantsResponse
import com.desmoines.aipulse.data.repository.RestaurantsRepository
import com.desmoines.aipulse.util.NetworkMonitor
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
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test

@OptIn(ExperimentalCoroutinesApi::class)
class RestaurantsViewModelTest {

    private val testDispatcher = StandardTestDispatcher()
    private lateinit var restaurantsRepository: RestaurantsRepository
    private lateinit var networkMonitor: NetworkMonitor
    private lateinit var viewModel: RestaurantsViewModel

    private val emptyResponse = RestaurantsResponse(
        restaurants = emptyList(),
        totalCount = 0,
        hasMore = false,
    )

    @BeforeEach
    fun setup() {
        Dispatchers.setMain(testDispatcher)
        restaurantsRepository = mockk(relaxed = true)
        networkMonitor = mockk()
        every { networkMonitor.isConnected } returns MutableStateFlow(true)

        coEvery { restaurantsRepository.fetchRestaurants(any()) } returns Result.success(emptyResponse)
        coEvery { restaurantsRepository.fetchAvailableCuisines() } returns Result.success(listOf("Italian", "Mexican", "Chinese"))
    }

    @AfterEach
    fun tearDown() {
        Dispatchers.resetMain()
    }

    private fun createViewModel(): RestaurantsViewModel {
        return RestaurantsViewModel(restaurantsRepository, networkMonitor)
    }

    @Test
    fun `initial sort is popularity`() = runTest {
        viewModel = createViewModel()
        val state = viewModel.uiState.value
        assertEquals(RestaurantSortOption.POPULARITY, state.sortBy)
    }

    @Test
    fun `setSortBy changes sort option`() = runTest {
        viewModel = createViewModel()
        viewModel.loadInitialData()
        advanceUntilIdle()

        viewModel.setSortBy(RestaurantSortOption.RATING)
        advanceUntilIdle()

        assertEquals(RestaurantSortOption.RATING, viewModel.uiState.value.sortBy)
    }

    @Test
    fun `toggleCuisine adds and removes cuisine filter`() = runTest {
        viewModel = createViewModel()
        viewModel.loadInitialData()
        advanceUntilIdle()

        viewModel.toggleCuisine("Italian")
        advanceUntilIdle()
        assertTrue(viewModel.uiState.value.selectedCuisines.contains("Italian"))

        viewModel.toggleCuisine("Italian")
        advanceUntilIdle()
        assertFalse(viewModel.uiState.value.selectedCuisines.contains("Italian"))
    }

    @Test
    fun `togglePriceRange adds and removes price filter`() = runTest {
        viewModel = createViewModel()
        viewModel.loadInitialData()
        advanceUntilIdle()

        viewModel.togglePriceRange("$$")
        advanceUntilIdle()
        assertTrue(viewModel.uiState.value.selectedPriceRanges.contains("$$"))

        viewModel.togglePriceRange("$$")
        advanceUntilIdle()
        assertFalse(viewModel.uiState.value.selectedPriceRanges.contains("$$"))
    }

    @Test
    fun `clearFilters resets all filters`() = runTest {
        viewModel = createViewModel()
        viewModel.loadInitialData()
        advanceUntilIdle()

        viewModel.toggleCuisine("Italian")
        viewModel.togglePriceRange("$$")
        viewModel.setSortBy(RestaurantSortOption.RATING)
        advanceUntilIdle()

        viewModel.clearFilters()
        advanceUntilIdle()

        val state = viewModel.uiState.value
        assertTrue(state.selectedCuisines.isEmpty())
        assertTrue(state.selectedPriceRanges.isEmpty())
        assertEquals(RestaurantSortOption.POPULARITY, state.sortBy)
    }

    @Test
    fun `activeFilterCount reflects active filters`() = runTest {
        viewModel = createViewModel()
        viewModel.loadInitialData()
        advanceUntilIdle()

        assertEquals(0, viewModel.uiState.value.activeFilterCount)

        viewModel.toggleCuisine("Italian")
        viewModel.togglePriceRange("$$")
        advanceUntilIdle()

        assertEquals(2, viewModel.uiState.value.activeFilterCount)
    }

    @Test
    fun `toggleOpenNowOnly toggles filter`() = runTest {
        viewModel = createViewModel()
        viewModel.loadInitialData()
        advanceUntilIdle()

        assertFalse(viewModel.uiState.value.showOpenNowOnly)

        viewModel.toggleOpenNowOnly()
        advanceUntilIdle()

        assertTrue(viewModel.uiState.value.showOpenNowOnly)
    }

    @Test
    fun `loadInitialData fetches restaurants and cuisines`() = runTest {
        viewModel = createViewModel()
        viewModel.loadInitialData()
        advanceUntilIdle()

        coVerify { restaurantsRepository.fetchRestaurants(any()) }
        coVerify { restaurantsRepository.fetchAvailableCuisines() }
    }
}
