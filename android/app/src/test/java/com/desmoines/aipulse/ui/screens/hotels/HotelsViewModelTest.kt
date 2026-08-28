package com.desmoines.aipulse.ui.screens.hotels

import com.desmoines.aipulse.data.model.Hotel
import com.desmoines.aipulse.data.remote.HotelSort
import com.desmoines.aipulse.data.remote.HotelsQuery
import com.desmoines.aipulse.data.remote.HotelsResponse
import com.desmoines.aipulse.data.repository.HotelsRepository
import io.mockk.coEvery
import io.mockk.mockk
import io.mockk.slot
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
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test

@OptIn(ExperimentalCoroutinesApi::class)
class HotelsViewModelTest {

    private val testDispatcher = StandardTestDispatcher()
    private lateinit var repository: HotelsRepository

    @BeforeEach
    fun setup() {
        Dispatchers.setMain(testDispatcher)
        repository = mockk(relaxed = true)
        // Relaxed MockK can't synthesize kotlin.Result; stub the Result-returning calls.
        coEvery { repository.fetchAreas() } returns Result.success(listOf("Downtown", "West Des Moines"))
        coEvery { repository.fetchHotels(any()) } returns Result.success(
            HotelsResponse(hotels = listOf(hotel("a"), hotel("b")), totalCount = 2, hasMore = false),
        )
    }

    @AfterEach
    fun tearDown() = Dispatchers.resetMain()

    private fun hotel(id: String) = Hotel(id = id, name = "Hotel $id", address = "1 Main St")

    private fun vm() = HotelsViewModel(repository)

    @Test
    fun `load populates hotels and areas`() = runTest(testDispatcher) {
        val viewModel = vm()
        advanceUntilIdle()

        assertEquals(listOf("a", "b"), viewModel.uiState.value.hotels.map { it.id })
        assertEquals(listOf("Downtown", "West Des Moines"), viewModel.uiState.value.areas)
        assertFalse(viewModel.uiState.value.isLoading)
    }

    @Test
    fun `toggling an area reloads with that area in the query`() = runTest(testDispatcher) {
        val query = slot<HotelsQuery>()
        coEvery { repository.fetchHotels(capture(query)) } returns Result.success(
            HotelsResponse(hotels = listOf(hotel("a")), totalCount = 1, hasMore = false),
        )
        val viewModel = vm()
        advanceUntilIdle()

        viewModel.onToggleArea("Downtown")
        advanceUntilIdle()

        assertTrue(viewModel.uiState.value.selectedAreas.contains("Downtown"))
        assertEquals(listOf("Downtown"), query.captured.areas)
        assertEquals(0, query.captured.offset)
    }

    @Test
    fun `toggling a price range reloads with that tier in the query`() = runTest(testDispatcher) {
        val query = slot<HotelsQuery>()
        coEvery { repository.fetchHotels(capture(query)) } returns Result.success(
            HotelsResponse(hotels = emptyList(), totalCount = 0, hasMore = false),
        )
        val viewModel = vm()
        advanceUntilIdle()

        viewModel.onTogglePriceRange("$$")
        advanceUntilIdle()

        assertTrue(viewModel.uiState.value.selectedPriceRanges.contains("$$"))
        assertEquals(listOf("$$"), query.captured.priceRanges)
    }

    @Test
    fun `selecting a min rating and sort flows into the query`() = runTest(testDispatcher) {
        val query = slot<HotelsQuery>()
        coEvery { repository.fetchHotels(capture(query)) } returns Result.success(
            HotelsResponse(hotels = emptyList(), totalCount = 0, hasMore = false),
        )
        val viewModel = vm()
        advanceUntilIdle()

        viewModel.onSelectMinRating(4.0)
        advanceUntilIdle()
        assertEquals(4.0, query.captured.minRating)

        viewModel.onSelectSort(HotelSort.RATING)
        advanceUntilIdle()
        assertEquals(HotelSort.RATING, query.captured.sort)
    }

    @Test
    fun `clear filters resets selections`() = runTest(testDispatcher) {
        val viewModel = vm()
        advanceUntilIdle()

        viewModel.onToggleArea("Downtown")
        viewModel.onTogglePriceRange("$$$")
        viewModel.onSelectMinRating(4.5)
        advanceUntilIdle()
        assertEquals(3, viewModel.uiState.value.activeFilterCount)

        viewModel.clearFilters()
        advanceUntilIdle()

        assertTrue(viewModel.uiState.value.selectedAreas.isEmpty())
        assertTrue(viewModel.uiState.value.selectedPriceRanges.isEmpty())
        assertNull(viewModel.uiState.value.minRating)
        assertEquals(0, viewModel.uiState.value.activeFilterCount)
    }

    @Test
    fun `debounced search reloads with the trimmed query`() = runTest(testDispatcher) {
        val query = slot<HotelsQuery>()
        coEvery { repository.fetchHotels(capture(query)) } returns Result.success(
            HotelsResponse(hotels = listOf(hotel("a")), totalCount = 1, hasMore = false),
        )
        val viewModel = vm()
        advanceUntilIdle()

        viewModel.onSearchTextChanged("  marriott  ")
        advanceUntilIdle()

        assertEquals("marriott", query.captured.searchText)
    }

    @Test
    fun `failure shows a retry message`() = runTest(testDispatcher) {
        coEvery { repository.fetchHotels(any()) } returns Result.failure(IllegalStateException("boom"))
        val viewModel = vm()
        advanceUntilIdle()

        assertTrue(viewModel.uiState.value.hotels.isEmpty())
        assertEquals("Couldn't load hotels. Tap to retry.", viewModel.uiState.value.errorMessage)
    }
}
