package com.desmoines.aipulse.ui.screens.tripplanner

import com.desmoines.aipulse.data.model.TripPlan
import com.desmoines.aipulse.data.model.TripPlanItem
import com.desmoines.aipulse.data.repository.TripPlannerRepository
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
import org.junit.jupiter.api.Assertions.assertNotNull
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test

@OptIn(ExperimentalCoroutinesApi::class)
class ItineraryDetailViewModelTest {

    private val testDispatcher = StandardTestDispatcher()
    private lateinit var repository: TripPlannerRepository
    private lateinit var networkMonitor: NetworkMonitor

    @BeforeEach
    fun setup() {
        Dispatchers.setMain(testDispatcher)
        repository = mockk(relaxed = true)
        networkMonitor = mockk(relaxed = true)
        every { networkMonitor.isConnected } returns MutableStateFlow(true)
    }

    @AfterEach
    fun tearDown() = Dispatchers.resetMain()

    private fun vm() = ItineraryDetailViewModel(repository, networkMonitor)

    private fun item(id: String, day: Int, order: Int) =
        TripPlanItem(itemId = id, dayNumber = day, orderIndex = order, title = "Stop $id")

    @Test
    fun `load groups items by day and sorts by order`() = runTest(testDispatcher) {
        coEvery { repository.fetchTrip("t1") } returns
            Result.success(TripPlan(id = "t1", title = "Weekend"))
        coEvery { repository.fetchItems("t1") } returns Result.success(
            listOf(item("b", day = 2, order = 0), item("a2", day = 1, order = 1), item("a1", day = 1, order = 0)),
        )
        val viewModel = vm()
        viewModel.load("t1")
        advanceUntilIdle()

        val state = viewModel.uiState.value
        assertEquals("Weekend", state.title)
        assertFalse(state.isLoading)
        assertEquals(listOf(1, 2), state.days.map { it.day })
        assertEquals(listOf("a1", "a2"), state.days.first().items.map { it.itemId })
    }

    @Test
    fun `load failure flags loadFailed and offline state`() = runTest(testDispatcher) {
        every { networkMonitor.isConnected } returns MutableStateFlow(false)
        coEvery { repository.fetchTrip(any()) } returns Result.success(TripPlan(id = "t1"))
        coEvery { repository.fetchItems(any()) } returns Result.failure(RuntimeException("boom"))
        val viewModel = vm()
        viewModel.load("t1")
        advanceUntilIdle()

        assertTrue(viewModel.uiState.value.loadFailed)
        assertTrue(viewModel.uiState.value.isOffline)
    }

    @Test
    fun `move reorders within a day and persists`() = runTest(testDispatcher) {
        coEvery { repository.fetchTrip(any()) } returns Result.success(TripPlan(id = "t1"))
        coEvery { repository.fetchItems("t1") } returns Result.success(
            listOf(item("a", day = 1, order = 0), item("b", day = 1, order = 1)),
        )
        coEvery { repository.persistOrder(any()) } returns true
        val viewModel = vm()
        viewModel.load("t1")
        advanceUntilIdle()

        viewModel.move(day = 1, index = 0, delta = 1)
        advanceUntilIdle()

        assertEquals(listOf("b", "a"), viewModel.uiState.value.days.first().items.map { it.itemId })
        assertNull(viewModel.uiState.value.message)
        coVerify { repository.persistOrder(any()) }
    }

    @Test
    fun `move rolls back to server truth when persist fails`() = runTest(testDispatcher) {
        coEvery { repository.fetchTrip(any()) } returns Result.success(TripPlan(id = "t1"))
        coEvery { repository.fetchItems("t1") } returns Result.success(
            listOf(item("a", day = 1, order = 0), item("b", day = 1, order = 1)),
        )
        coEvery { repository.persistOrder(any()) } returns false
        val viewModel = vm()
        viewModel.load("t1")
        advanceUntilIdle()

        viewModel.move(day = 1, index = 0, delta = 1)
        advanceUntilIdle()

        // Server truth (unchanged order) is restored and the user is told.
        assertEquals(listOf("a", "b"), viewModel.uiState.value.days.first().items.map { it.itemId })
        assertNotNull(viewModel.uiState.value.message)
    }

    @Test
    fun `toggleReorderMode flips the flag`() = runTest(testDispatcher) {
        val viewModel = vm()
        assertFalse(viewModel.uiState.value.reorderMode)
        viewModel.toggleReorderMode()
        assertTrue(viewModel.uiState.value.reorderMode)
    }
}
