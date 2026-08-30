package com.desmoines.aipulse.ui.screens.search

import com.desmoines.aipulse.data.model.RecentItem
import com.desmoines.aipulse.data.model.RecentItemType
import com.desmoines.aipulse.util.RecentlyViewedService
import com.desmoines.aipulse.util.SearchHistoryService
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
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test

@OptIn(ExperimentalCoroutinesApi::class)
class SearchSuggestionsViewModelTest {

    private val testDispatcher = StandardTestDispatcher()
    private lateinit var searchHistoryService: SearchHistoryService
    private lateinit var recentlyViewedService: RecentlyViewedService

    @BeforeEach
    fun setup() {
        Dispatchers.setMain(testDispatcher)
        searchHistoryService = mockk(relaxed = true)
        recentlyViewedService = mockk(relaxed = true)
    }

    @AfterEach
    fun tearDown() = Dispatchers.resetMain()

    private fun vm() = SearchSuggestionsViewModel(searchHistoryService, recentlyViewedService)

    @Test
    fun `exposes the service histories`() {
        every { searchHistoryService.history } returns MutableStateFlow(listOf("tacos", "music"))
        every { recentlyViewedService.recent } returns MutableStateFlow(
            listOf(RecentItem(RecentItemType.EVENT, "e1", "Jazz Night")),
        )
        val viewModel = vm()

        assertEquals(listOf("tacos", "music"), viewModel.recentSearches.value)
        assertEquals("Jazz Night", viewModel.recentlyViewed.value.first().title)
    }

    @Test
    fun `clear search history delegates to the service`() = runTest(testDispatcher) {
        val viewModel = vm()
        viewModel.clearSearchHistory()
        advanceUntilIdle()

        coVerify { searchHistoryService.clearAll() }
    }

    @Test
    fun `trending list is non-empty`() {
        assertEquals(5, SearchSuggestionsViewModel.TRENDING.size)
    }
}
