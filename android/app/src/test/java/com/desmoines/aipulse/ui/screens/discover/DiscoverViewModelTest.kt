package com.desmoines.aipulse.ui.screens.discover

import com.desmoines.aipulse.data.model.Event
import com.desmoines.aipulse.data.model.Restaurant
import com.desmoines.aipulse.data.model.SwipeItemType
import com.desmoines.aipulse.data.remote.EventsResponse
import com.desmoines.aipulse.data.remote.RestaurantsResponse
import com.desmoines.aipulse.data.repository.EventsRepository
import com.desmoines.aipulse.data.repository.RestaurantsRepository
import io.mockk.coEvery
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
import org.junit.jupiter.api.Assertions.assertNotNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test

@OptIn(ExperimentalCoroutinesApi::class)
class DiscoverViewModelTest {

    private val testDispatcher = StandardTestDispatcher()
    private lateinit var eventsRepository: EventsRepository
    private lateinit var restaurantsRepository: RestaurantsRepository

    @BeforeEach
    fun setup() {
        Dispatchers.setMain(testDispatcher)
        eventsRepository = mockk(relaxed = true)
        restaurantsRepository = mockk(relaxed = true)
    }

    @AfterEach
    fun tearDown() = Dispatchers.resetMain()

    private fun event(id: String) = Event(id = id, title = "Event $id", date = "")
    private fun restaurant(id: String) = Restaurant(id = id, name = "Restaurant $id")

    private fun stubEvents(vararg ids: String) {
        coEvery { eventsRepository.fetchEvents(any()) } returns
            Result.success(EventsResponse(ids.map(::event), ids.size, false))
    }

    private fun stubRestaurants(vararg ids: String) {
        coEvery { restaurantsRepository.fetchRestaurants(any()) } returns
            Result.success(RestaurantsResponse(ids.map(::restaurant), ids.size, false))
    }

    private fun vm() = DiscoverViewModel(eventsRepository, restaurantsRepository)

    @Test
    fun `load interleaves events and restaurants`() = runTest(testDispatcher) {
        stubEvents("e1", "e2")
        stubRestaurants("r1", "r2")
        val viewModel = vm()
        advanceUntilIdle()

        val state = viewModel.uiState.value
        assertFalse(state.isLoading)
        assertEquals(
            listOf("event-e1", "restaurant-r1", "event-e2", "restaurant-r2"),
            state.items.map { it.id },
        )
        assertEquals(SwipeItemType.EVENT, state.items.first().itemType)
    }

    @Test
    fun `commit removes the top card`() = runTest(testDispatcher) {
        stubEvents("e1", "e2")
        stubRestaurants()
        val viewModel = vm()
        advanceUntilIdle()

        val top = viewModel.uiState.value.items.first()
        viewModel.onLike(top)

        assertEquals(listOf("event-e2"), viewModel.uiState.value.items.map { it.id })
    }

    @Test
    fun `empty deck surfaces an error`() = runTest(testDispatcher) {
        stubEvents()
        stubRestaurants()
        val viewModel = vm()
        advanceUntilIdle()

        val state = viewModel.uiState.value
        assertTrue(state.items.isEmpty())
        assertNotNull(state.errorMessage)
        assertFalse(state.isLoading)
    }
}
