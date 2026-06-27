package com.desmoines.aipulse.ui.screens.search

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.desmoines.aipulse.data.model.RecentItem
import com.desmoines.aipulse.util.RecentlyViewedService
import com.desmoines.aipulse.util.SearchHistoryService
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

/**
 * Backs the empty-search-state suggestions (ANDP-051): recent searches +
 * recently-viewed, both read-only / on-device. Mirrors iOS SearchSuggestions.
 */
@HiltViewModel
class SearchSuggestionsViewModel @Inject constructor(
    private val searchHistoryService: SearchHistoryService,
    private val recentlyViewedService: RecentlyViewedService,
) : ViewModel() {

    /** Most-recent-first search queries. */
    val recentSearches: StateFlow<List<String>> = searchHistoryService.history

    /** Most-recent-first viewed items. */
    val recentlyViewed: StateFlow<List<RecentItem>> = recentlyViewedService.recent

    fun clearSearchHistory() {
        viewModelScope.launch { searchHistoryService.clearAll() }
    }

    companion object {
        /** Trending searches shown as chips in the empty state. */
        val TRENDING = listOf("Live music", "Kid-friendly", "Brunch", "Free", "This weekend")

        /** How many recent searches to surface. */
        const val RECENT_LIMIT = 5
    }
}
