package com.desmoines.aipulse.ui.screens.search

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.desmoines.aipulse.data.model.Attraction
import com.desmoines.aipulse.data.model.Event
import com.desmoines.aipulse.data.model.Restaurant
import com.desmoines.aipulse.data.remote.AttractionsQuery
import com.desmoines.aipulse.data.remote.EventsQuery
import com.desmoines.aipulse.data.remote.RestaurantsQuery
import com.desmoines.aipulse.data.repository.AttractionsRepository
import com.desmoines.aipulse.data.repository.EventsRepository
import com.desmoines.aipulse.data.repository.RestaurantsRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.launch
import javax.inject.Inject

enum class SearchTab(val displayName: String) {
    EVENTS("Events"),
    RESTAURANTS("Restaurants"),
    ATTRACTIONS("Attractions");
}

data class SearchScreenState(
    val eventResults: List<Event> = emptyList(),
    val restaurantResults: List<Restaurant> = emptyList(),
    val attractionResults: List<Attraction> = emptyList(),
    val isSearching: Boolean = false,
    val hasSearched: Boolean = false,
    val searchText: String = "",
    val selectedTab: SearchTab = SearchTab.EVENTS,
) {
    val totalResults: Int
        get() = eventResults.size + restaurantResults.size + attractionResults.size

    val isEmpty: Boolean
        get() = hasSearched && totalResults == 0 && !isSearching

    fun countFor(tab: SearchTab): Int = when (tab) {
        SearchTab.EVENTS -> eventResults.size
        SearchTab.RESTAURANTS -> restaurantResults.size
        SearchTab.ATTRACTIONS -> attractionResults.size
    }
}

@HiltViewModel
class SearchViewModel @Inject constructor(
    private val eventsRepository: EventsRepository,
    private val restaurantsRepository: RestaurantsRepository,
    private val attractionsRepository: AttractionsRepository,
) : ViewModel() {

    private val _searchText = MutableStateFlow("")
    private val _selectedTab = MutableStateFlow(SearchTab.EVENTS)
    private val _eventResults = MutableStateFlow<List<Event>>(emptyList())
    private val _restaurantResults = MutableStateFlow<List<Restaurant>>(emptyList())
    private val _attractionResults = MutableStateFlow<List<Attraction>>(emptyList())
    private val _isSearching = MutableStateFlow(false)
    private val _hasSearched = MutableStateFlow(false)

    val uiState: StateFlow<SearchScreenState> = combine(
        _searchText,
        _selectedTab,
        _eventResults,
        _restaurantResults,
        combine(_attractionResults, _isSearching, _hasSearched) { a, s, h -> Triple(a, s, h) }
    ) { searchText, selectedTab, events, restaurants, (attractions, isSearching, hasSearched) ->
        SearchScreenState(
            eventResults = events,
            restaurantResults = restaurants,
            attractionResults = attractions,
            isSearching = isSearching,
            hasSearched = hasSearched,
            searchText = searchText,
            selectedTab = selectedTab,
        )
    }.stateIn(
        scope = viewModelScope,
        started = SharingStarted.WhileSubscribed(5_000),
        initialValue = SearchScreenState(),
    )

    private var searchJob: Job? = null

    fun onSearchTextChanged(text: String) {
        _searchText.value = text
        performDebouncedSearch()
    }

    fun onTabSelected(tab: SearchTab) {
        _selectedTab.value = tab
    }

    fun clearSearch() {
        _searchText.value = ""
        clearResults()
    }

    fun refresh() {
        val current = _searchText.value
        if (current.isEmpty()) return
        clearResults()
        _searchText.value = current
        performDebouncedSearch()
    }

    private fun performDebouncedSearch() {
        searchJob?.cancel()

        val query = _searchText.value
        if (query.isEmpty()) {
            clearResults()
            return
        }

        searchJob = viewModelScope.launch {
            delay(300L)

            _isSearching.value = true
            _hasSearched.value = true

            // Parallel search across all content types
            val eventsDeferred = launch { searchEvents(query) }
            val restaurantsDeferred = launch { searchRestaurants(query) }
            val attractionsDeferred = launch { searchAttractions(query) }

            eventsDeferred.join()
            restaurantsDeferred.join()
            attractionsDeferred.join()

            _isSearching.value = false
        }
    }

    private suspend fun searchEvents(query: String) {
        val result = eventsRepository.fetchEvents(
            EventsQuery(searchText = query, limit = 20)
        )
        val events = result.getOrNull()?.events ?: emptyList()
        if (events.isEmpty()) {
            val fuzzyResult = eventsRepository.fuzzySearchEvents(query, limit = 20)
            _eventResults.value = fuzzyResult.getOrDefault(emptyList())
        } else {
            _eventResults.value = events
        }
    }

    private suspend fun searchRestaurants(query: String) {
        val result = restaurantsRepository.fetchRestaurants(
            RestaurantsQuery(searchText = query, limit = 20)
        )
        val restaurants = result.getOrNull()?.restaurants ?: emptyList()
        if (restaurants.isEmpty()) {
            val fuzzyResult = restaurantsRepository.fuzzySearchRestaurants(query, limit = 20)
            _restaurantResults.value = fuzzyResult.getOrDefault(emptyList())
        } else {
            _restaurantResults.value = restaurants
        }
    }

    private suspend fun searchAttractions(query: String) {
        val result = attractionsRepository.fetchAttractions(
            AttractionsQuery(searchText = query, limit = 20)
        )
        _attractionResults.value = result.getOrNull()?.attractions ?: emptyList()
    }

    private fun clearResults() {
        _eventResults.value = emptyList()
        _restaurantResults.value = emptyList()
        _attractionResults.value = emptyList()
        _hasSearched.value = false
    }
}
