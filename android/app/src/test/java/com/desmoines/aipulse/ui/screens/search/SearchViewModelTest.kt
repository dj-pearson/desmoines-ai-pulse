package com.desmoines.aipulse.ui.screens.search

import com.desmoines.aipulse.data.model.Event
import com.desmoines.aipulse.data.model.Restaurant
import com.desmoines.aipulse.data.remote.AttractionsResponse
import com.desmoines.aipulse.data.remote.EventsResponse
import com.desmoines.aipulse.data.remote.RestaurantsResponse
import com.desmoines.aipulse.data.repository.AttractionsRepository
import com.desmoines.aipulse.data.repository.EventsRepository
import com.desmoines.aipulse.data.repository.RestaurantsRepository
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.mockk
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
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
import org.junit.jupiter.api.Test

@OptIn(ExperimentalCoroutinesApi::class)
class SearchViewModelTest {

    private val testDispatcher = StandardTestDispatcher()
    private lateinit var eventsRepository: EventsRepository
    private lateinit var restaurantsRepository: RestaurantsRepository
    private lateinit var attractionsRepository: AttractionsRepository
    private lateinit var viewModel: SearchViewModel

    private val emptyEventsResponse = EventsResponse(events = emptyList(), totalCount = 0, hasMore = false)
    private val emptyRestaurantsResponse = RestaurantsResponse(restaurants = emptyList(), totalCount = 0, hasMore = false)
    private val emptyAttractionsResponse = AttractionsResponse(attractions = emptyList(), totalCount = 0, hasMore = false)

    @BeforeEach
    fun setup() {
        Dispatchers.setMain(testDispatcher)
        eventsRepository = mockk(relaxed = true)
        restaurantsRepository = mockk(relaxed = true)
        attractionsRepository = mockk(relaxed = true)

        coEvery { eventsRepository.fetchEvents(any()) } returns Result.success(emptyEventsResponse)
        coEvery { restaurantsRepository.fetchRestaurants(any()) } returns Result.success(emptyRestaurantsResponse)
        coEvery { attractionsRepository.fetchAttractions(any()) } returns Result.success(emptyAttractionsResponse)
        coEvery { eventsRepository.fuzzySearchEvents(any(), any()) } returns Result.success(emptyList())
        coEvery { restaurantsRepository.fuzzySearchRestaurants(any(), any()) } returns Result.success(emptyList())
    }

    @AfterEach
    fun tearDown() {
        Dispatchers.resetMain()
    }

    private fun createViewModel(): SearchViewModel {
        return SearchViewModel(eventsRepository, restaurantsRepository, attractionsRepository)
    }

    @Test
    fun `initial state has no results and no search`() = runTest {
        viewModel = createViewModel()
        val state = viewModel.uiState.value
        assertFalse(state.hasSearched)
        assertFalse(state.isSearching)
        assertTrue(state.eventResults.isEmpty())
        assertTrue(state.restaurantResults.isEmpty())
        assertTrue(state.attractionResults.isEmpty())
    }

    @Test
    fun `onSearchTextChanged triggers search after debounce`() = runTest {
        viewModel = createViewModel()
        viewModel.onSearchTextChanged("pizza")

        // Before debounce completes (300ms), search should not have fired
        advanceTimeBy(100)
        coVerify(exactly = 0) { eventsRepository.fetchEvents(any()) }

        // After debounce, search should fire
        advanceUntilIdle()
        coVerify(atLeast = 1) { eventsRepository.fetchEvents(any()) }
    }

    @Test
    fun `rapid text changes only trigger one search (debounce)`() = runTest {
        viewModel = createViewModel()
        viewModel.onSearchTextChanged("p")
        advanceTimeBy(100)
        viewModel.onSearchTextChanged("pi")
        advanceTimeBy(100)
        viewModel.onSearchTextChanged("piz")
        advanceTimeBy(100)
        viewModel.onSearchTextChanged("pizz")
        advanceTimeBy(100)
        viewModel.onSearchTextChanged("pizza")
        advanceUntilIdle()

        // Each repository should only be called once (for the final "pizza" query)
        coVerify(exactly = 1) { eventsRepository.fetchEvents(any()) }
    }

    @Test
    fun `search queries all three repositories in parallel`() = runTest {
        viewModel = createViewModel()
        viewModel.onSearchTextChanged("test query")
        advanceUntilIdle()

        coVerify { eventsRepository.fetchEvents(any()) }
        coVerify { restaurantsRepository.fetchRestaurants(any()) }
        coVerify { attractionsRepository.fetchAttractions(any()) }
    }

    @Test
    fun `fuzzy fallback triggers when full-text returns empty`() = runTest {
        // Full-text returns empty, fuzzy returns results
        coEvery { eventsRepository.fetchEvents(any()) } returns Result.success(emptyEventsResponse)
        coEvery { eventsRepository.fuzzySearchEvents(any(), any()) } returns Result.success(listOf(Event.preview))

        viewModel = createViewModel()
        viewModel.onSearchTextChanged("jazz")
        advanceUntilIdle()

        coVerify { eventsRepository.fuzzySearchEvents("jazz", any()) }
    }

    @Test
    fun `clearSearch resets state`() = runTest {
        viewModel = createViewModel()
        viewModel.onSearchTextChanged("test")
        advanceUntilIdle()

        viewModel.clearSearch()
        advanceUntilIdle()

        val state = viewModel.uiState.value
        assertEquals("", state.searchText)
        assertFalse(state.hasSearched)
    }

    @Test
    fun `onTabSelected changes active tab`() = runTest {
        viewModel = createViewModel()
        assertEquals(SearchTab.EVENTS, viewModel.uiState.value.selectedTab)

        viewModel.onTabSelected(SearchTab.RESTAURANTS)
        advanceUntilIdle()

        assertEquals(SearchTab.RESTAURANTS, viewModel.uiState.value.selectedTab)
    }

    @Test
    fun `empty search text does not trigger search`() = runTest {
        viewModel = createViewModel()
        viewModel.onSearchTextChanged("")
        advanceUntilIdle()

        coVerify(exactly = 0) { eventsRepository.fetchEvents(any()) }
    }
}
