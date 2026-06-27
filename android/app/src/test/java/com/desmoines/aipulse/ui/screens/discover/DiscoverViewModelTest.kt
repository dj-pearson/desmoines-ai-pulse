package com.desmoines.aipulse.ui.screens.discover

import com.desmoines.aipulse.data.model.Event
import com.desmoines.aipulse.data.model.Restaurant
import com.desmoines.aipulse.data.model.SwipeItemType
import com.desmoines.aipulse.data.remote.EventsResponse
import com.desmoines.aipulse.data.remote.RestaurantsResponse
import com.desmoines.aipulse.data.repository.AuthRepository
import com.desmoines.aipulse.data.repository.EventsRepository
import com.desmoines.aipulse.data.repository.FavoritesRepository
import com.desmoines.aipulse.data.repository.RestaurantsRepository
import com.desmoines.aipulse.util.SoftPaywallService
import com.desmoines.aipulse.util.SwipeInteractionService
import io.mockk.coEvery
import io.mockk.every
import io.mockk.mockk
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
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
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test

@OptIn(ExperimentalCoroutinesApi::class)
class DiscoverViewModelTest {

    private val testDispatcher = StandardTestDispatcher()
    private lateinit var eventsRepository: EventsRepository
    private lateinit var restaurantsRepository: RestaurantsRepository
    private lateinit var favoritesRepository: FavoritesRepository
    private lateinit var authRepository: AuthRepository
    private lateinit var swipeInteractionService: SwipeInteractionService
    private lateinit var softPaywallService: SoftPaywallService

    @BeforeEach
    fun setup() {
        Dispatchers.setMain(testDispatcher)
        eventsRepository = mockk(relaxed = true)
        restaurantsRepository = mockk(relaxed = true)
        favoritesRepository = mockk(relaxed = true)
        authRepository = mockk(relaxed = true)
        swipeInteractionService = mockk(relaxed = true)
        softPaywallService = mockk(relaxed = true)
        every { authRepository.currentUserId } returns null
        every { swipeInteractionService.swipedKeys } returns MutableStateFlow(emptySet())
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

    private fun vm() = DiscoverViewModel(
        eventsRepository,
        restaurantsRepository,
        favoritesRepository,
        authRepository,
        swipeInteractionService,
        softPaywallService,
    )

    @Test
    fun `load builds a mixed deck of events and restaurants`() = runTest(testDispatcher) {
        stubEvents("e1", "e2")
        stubRestaurants("r1", "r2")
        val viewModel = vm()
        advanceUntilIdle()

        val state = viewModel.uiState.value
        assertFalse(state.isLoading)
        // Mixed mode shuffles, so assert membership not order.
        assertEquals(
            setOf("event-e1", "event-e2", "restaurant-r1", "restaurant-r2"),
            state.items.map { it.id }.toSet(),
        )
    }

    @Test
    fun `commit removes the swiped card`() = runTest(testDispatcher) {
        stubEvents("e1", "e2")
        stubRestaurants()
        val viewModel = vm()
        advanceUntilIdle()

        val before = viewModel.uiState.value.items
        val top = before.first()
        viewModel.onLike(top)

        val after = viewModel.uiState.value.items
        assertEquals(before.size - 1, after.size)
        assertFalse(after.any { it.id == top.id })
    }

    @Test
    fun `empty successful fetch shows the caught-up state, not an error`() = runTest(testDispatcher) {
        stubEvents()
        stubRestaurants()
        val viewModel = vm()
        advanceUntilIdle()

        val state = viewModel.uiState.value
        assertTrue(state.items.isEmpty())
        assertFalse(state.isLoading)
        assertNull(state.errorMessage)
        assertTrue(state.isEmpty)
    }

    @Test
    fun `failed fetch surfaces an error`() = runTest(testDispatcher) {
        coEvery { eventsRepository.fetchEvents(any()) } returns Result.failure(RuntimeException("boom"))
        coEvery { restaurantsRepository.fetchRestaurants(any()) } returns Result.failure(RuntimeException("boom"))
        val viewModel = vm()
        advanceUntilIdle()

        val state = viewModel.uiState.value
        assertTrue(state.items.isEmpty())
        assertNotNull(state.errorMessage)
    }

    @Test
    fun `switching mode refetches the deck`() = runTest(testDispatcher) {
        stubEvents("e1")
        stubRestaurants("r1")
        val viewModel = vm()
        advanceUntilIdle()

        viewModel.setMode(DiscoverMode.EVENTS)
        advanceUntilIdle()

        val state = viewModel.uiState.value
        assertEquals(DiscoverMode.EVENTS, state.mode)
        // Events-only mode: no restaurants in the deck.
        assertTrue(state.items.all { it.itemType == SwipeItemType.EVENT })
    }
}
