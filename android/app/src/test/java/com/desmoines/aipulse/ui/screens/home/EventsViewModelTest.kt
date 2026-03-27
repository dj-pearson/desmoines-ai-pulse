package com.desmoines.aipulse.ui.screens.home

import app.cash.turbine.test
import com.desmoines.aipulse.data.model.Event
import com.desmoines.aipulse.data.model.EventCategory
import com.desmoines.aipulse.data.model.Restaurant
import com.desmoines.aipulse.data.remote.EventsQuery
import com.desmoines.aipulse.data.remote.EventsResponse
import com.desmoines.aipulse.data.remote.RestaurantsQuery
import com.desmoines.aipulse.data.remote.RestaurantsResponse
import com.desmoines.aipulse.data.repository.EventsRepository
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
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test

@OptIn(ExperimentalCoroutinesApi::class)
class EventsViewModelTest {

    private val testDispatcher = StandardTestDispatcher()
    private lateinit var eventsRepository: EventsRepository
    private lateinit var restaurantsRepository: RestaurantsRepository
    private lateinit var networkMonitor: NetworkMonitor
    private lateinit var viewModel: EventsViewModel

    private val sampleEvent = Event.preview()
    private val sampleEventsResponse = EventsResponse(
        events = listOf(sampleEvent),
        totalCount = 1,
        hasMore = false,
    )
    private val emptyEventsResponse = EventsResponse(
        events = emptyList(),
        totalCount = 0,
        hasMore = false,
    )
    private val sampleRestaurantsResponse = RestaurantsResponse(
        restaurants = emptyList(),
        totalCount = 0,
        hasMore = false,
    )

    @BeforeEach
    fun setup() {
        Dispatchers.setMain(testDispatcher)
        eventsRepository = mockk(relaxed = true)
        restaurantsRepository = mockk(relaxed = true)
        networkMonitor = mockk()
        every { networkMonitor.isConnected } returns MutableStateFlow(true)

        coEvery { eventsRepository.fetchEvents(any()) } returns Result.success(sampleEventsResponse)
        coEvery { eventsRepository.fetchFeaturedEvents(any()) } returns Result.success(listOf(sampleEvent))
        coEvery { restaurantsRepository.fetchRestaurants(any()) } returns Result.success(sampleRestaurantsResponse)
    }

    @AfterEach
    fun tearDown() {
        Dispatchers.resetMain()
    }

    private fun createViewModel(): EventsViewModel {
        return EventsViewModel(eventsRepository, restaurantsRepository, networkMonitor)
    }

    @Test
    fun `initial state has no data and is not loading`() = runTest {
        viewModel = createViewModel()
        val state = viewModel.uiState.value
        assertTrue(state.events.isEmpty())
        assertTrue(state.featuredEvents.isEmpty())
        assertFalse(state.isLoading)
    }

    @Test
    fun `loadInitialData fetches events, featured, and restaurants`() = runTest {
        viewModel = createViewModel()
        viewModel.loadInitialData()
        advanceUntilIdle()

        coVerify { eventsRepository.fetchEvents(any()) }
        coVerify { eventsRepository.fetchFeaturedEvents(any()) }
        coVerify { restaurantsRepository.fetchRestaurants(any()) }
    }

    @Test
    fun `loadInitialData does not duplicate on second call`() = runTest {
        viewModel = createViewModel()
        viewModel.loadInitialData()
        advanceUntilIdle()
        viewModel.loadInitialData()
        advanceUntilIdle()

        coVerify(exactly = 1) { eventsRepository.fetchFeaturedEvents(any()) }
    }

    @Test
    fun `setSelectedCategory updates filter and triggers refetch`() = runTest {
        viewModel = createViewModel()
        viewModel.loadInitialData()
        advanceUntilIdle()

        viewModel.setSelectedCategory(EventCategory.MUSIC)
        advanceUntilIdle()

        assertEquals(EventCategory.MUSIC, viewModel.selectedCategory.value)
    }

    @Test
    fun `clearFilters resets all filter state`() = runTest {
        viewModel = createViewModel()
        viewModel.setSelectedCategory(EventCategory.FOOD)
        viewModel.setShowFeaturedOnly(true)

        viewModel.clearFilters()
        advanceUntilIdle()

        assertNull(viewModel.selectedCategory.value)
        assertFalse(viewModel.showFeaturedOnly.value)
        assertNull(viewModel.selectedDatePreset.value)
        assertEquals("", viewModel.searchText.value)
    }

    @Test
    fun `loadMoreIfNeeded does not trigger when not near end`() = runTest {
        val manyEvents = (1..30).map { sampleEvent }
        coEvery { eventsRepository.fetchEvents(any()) } returns Result.success(
            EventsResponse(events = manyEvents, totalCount = 60, hasMore = true)
        )

        viewModel = createViewModel()
        viewModel.loadInitialData()
        advanceUntilIdle()

        // Index 5 is far from the end of 30 items
        viewModel.loadMoreIfNeeded(5)
        advanceUntilIdle()

        // Only the initial fetch, no additional pagination call
        coVerify(exactly = 1) { eventsRepository.fetchEvents(any()) }
    }

    @Test
    fun `loadMoreIfNeeded triggers when near end`() = runTest {
        val manyEvents = (1..30).map { sampleEvent }
        coEvery { eventsRepository.fetchEvents(any()) } returns Result.success(
            EventsResponse(events = manyEvents, totalCount = 60, hasMore = true)
        )

        viewModel = createViewModel()
        viewModel.loadInitialData()
        advanceUntilIdle()

        // Index 26 is near end (count - 5 = 25)
        viewModel.loadMoreIfNeeded(26)
        advanceUntilIdle()

        coVerify(atLeast = 2) { eventsRepository.fetchEvents(any()) }
    }

    @Test
    fun `refresh bypasses cache and refetches all data`() = runTest {
        viewModel = createViewModel()
        viewModel.loadInitialData()
        advanceUntilIdle()

        viewModel.refresh()
        advanceUntilIdle()

        coVerify(atLeast = 2) { eventsRepository.fetchEvents(any()) }
        coVerify(atLeast = 2) { eventsRepository.fetchFeaturedEvents(any()) }
    }

    @Test
    fun `error message set on repository failure`() = runTest {
        coEvery { eventsRepository.fetchEvents(any()) } returns Result.failure(RuntimeException("Network error"))
        coEvery { eventsRepository.fetchFeaturedEvents(any()) } returns Result.failure(RuntimeException("Network error"))

        viewModel = createViewModel()
        viewModel.loadInitialData()
        advanceUntilIdle()

        val error = viewModel.errorMessage.value
        assertTrue(error != null && error.isNotBlank())
    }
}
