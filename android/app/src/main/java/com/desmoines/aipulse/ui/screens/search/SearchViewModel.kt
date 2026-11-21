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
import com.desmoines.aipulse.util.DateNightFilter
import com.desmoines.aipulse.util.DeepLinkHandler
import com.desmoines.aipulse.util.ShortcutDispatcher
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.stateIn
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
    /** The /events/kids filter (AND-AUDIT-041); narrows event results only. */
    val kidsOnly: Boolean = false,
    /** The /events/date-night filter (AND-AUDIT-046); null when off. */
    val dateNight: DateNightFilter.Times? = null,
) {
    /** A landing filter that lists events with no text of its own. */
    val hasEventFilter: Boolean
        get() = kidsOnly || dateNight != null

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
    private val shortcutDispatcher: ShortcutDispatcher,
    private val deepLinkHandler: DeepLinkHandler,
) : ViewModel() {

    private val _searchText = MutableStateFlow("")
    private val _selectedTab = MutableStateFlow(SearchTab.EVENTS)
    private val _eventResults = MutableStateFlow<List<Event>>(emptyList())
    private val _restaurantResults = MutableStateFlow<List<Restaurant>>(emptyList())
    private val _attractionResults = MutableStateFlow<List<Attraction>>(emptyList())
    private val _isSearching = MutableStateFlow(false)
    private val _hasSearched = MutableStateFlow(false)
    private val _kidsOnly = MutableStateFlow(false)
    private val _dateNight = MutableStateFlow<DateNightFilter.Times?>(null)

    val uiState: StateFlow<SearchScreenState> = combine(
        _searchText,
        _selectedTab,
        _eventResults,
        _restaurantResults,
        combine(_attractionResults, _isSearching, _hasSearched, _kidsOnly, _dateNight) { a, s, h, k, d ->
            SearchProgress(a, s, h, k, d)
        }
    ) { searchText, selectedTab, events, restaurants, progress ->
        SearchScreenState(
            eventResults = events,
            restaurantResults = restaurants,
            attractionResults = progress.attractions,
            isSearching = progress.isSearching,
            hasSearched = progress.hasSearched,
            searchText = searchText,
            selectedTab = selectedTab,
            kidsOnly = progress.kidsOnly,
            dateNight = progress.dateNight,
        )
    }.stateIn(
        scope = viewModelScope,
        started = SharingStarted.WhileSubscribed(5_000),
        initialValue = SearchScreenState(),
    )

    private var searchJob: Job? = null

    init {
        // A /search?q= link (AND-OVH-021): run its query once this screen
        // exists, then consume it so returning to the tab does not re-run it.
        viewModelScope.launch {
            deepLinkHandler.pendingSearchQuery.collect { query ->
                if (query != null) {
                    deepLinkHandler.consumeSearchQuery()
                    onSearchTextChanged(query)
                }
            }
        }
        // An /events/kids link (AND-AUDIT-041): turn the kids filter on once
        // this screen exists, then consume it, as for the query above.
        viewModelScope.launch {
            deepLinkHandler.pendingKidsEvents.collect { pending ->
                if (pending && deepLinkHandler.consumeKidsEvents()) showKidsEvents()
            }
        }
        // An /events/date-night link (AND-AUDIT-046), the same way.
        viewModelScope.launch {
            deepLinkHandler.pendingDateNight.collect { pending ->
                if (pending != null) deepLinkHandler.consumeDateNight()?.let { showDateNight(it) }
            }
        }
        // App Shortcut / Assistant deep links (ANDP-015): apply pre-filled
        // restaurant/event searches once this screen exists, then consume so the
        // payload isn't re-applied.
        viewModelScope.launch {
            shortcutDispatcher.pending.collect { pending ->
                when (pending) {
                    is ShortcutDispatcher.Pending.FindRestaurants -> {
                        applyShortcutSearch(
                            SearchTab.RESTAURANTS,
                            listOfNotNull(
                                pending.cuisine,
                                pending.area,
                                "open now".takeIf { pending.openNow },
                            ),
                        )
                        shortcutDispatcher.consume()
                    }
                    is ShortcutDispatcher.Pending.FindEvents -> {
                        applyShortcutSearch(
                            SearchTab.EVENTS,
                            listOfNotNull(pending.category, pending.datePreset),
                        )
                        shortcutDispatcher.consume()
                    }
                    else -> Unit // AskPulse handled elsewhere; ignore null.
                }
            }
        }
    }

    /** Select [tab] and, if any terms were supplied, run the composed query. */
    private fun applyShortcutSearch(tab: SearchTab, terms: List<String>) {
        _selectedTab.value = tab
        val query = terms.joinToString(" ").trim()
        if (query.isNotEmpty()) onSearchTextChanged(query)
    }

    fun onSearchTextChanged(text: String) {
        _searchText.value = text
        performDebouncedSearch()
    }

    /**
     * Lists upcoming kids-and-family events by the web's rule, with or
     * without a text query, as iOS's kidsDestination does.
     */
    fun showKidsEvents() {
        // One landing filter at a time: each is its own or() group.
        _dateNight.value = null
        _kidsOnly.value = true
        _selectedTab.value = SearchTab.EVENTS
        performDebouncedSearch()
    }

    /** Drops the kids filter and re-runs whatever text is left. */
    fun clearKidsFilter() {
        _kidsOnly.value = false
        performDebouncedSearch()
    }

    /**
     * Lists date night events by the web's rule over its 14 Central days,
     * evenings only unless [times] is ANY_TIME, as iOS's dateNightDestination
     * does.
     */
    fun showDateNight(times: DateNightFilter.Times) {
        _kidsOnly.value = false
        _dateNight.value = times
        _selectedTab.value = SearchTab.EVENTS
        performDebouncedSearch()
    }

    /** Drops the date night filter and re-runs whatever text is left. */
    fun clearDateNightFilter() {
        _dateNight.value = null
        performDebouncedSearch()
    }

    fun onTabSelected(tab: SearchTab) {
        _selectedTab.value = tab
    }

    fun clearSearch() {
        // A kids or date night list can be in flight with no text; stop it
        // repopulating.
        searchJob?.cancel()
        _isSearching.value = false
        _searchText.value = ""
        _kidsOnly.value = false
        _dateNight.value = null
        clearResults()
    }

    fun refresh() {
        val current = _searchText.value
        if (current.isEmpty() && !_kidsOnly.value && _dateNight.value == null) return
        clearResults()
        _searchText.value = current
        performDebouncedSearch()
    }

    private fun performDebouncedSearch() {
        searchJob?.cancel()

        val query = _searchText.value
        val kidsOnly = _kidsOnly.value
        val dateNight = _dateNight.value
        if (query.isEmpty() && !kidsOnly && dateNight == null) {
            clearResults()
            return
        }

        searchJob = viewModelScope.launch {
            delay(300L)

            _isSearching.value = true
            _hasSearched.value = true

            // Parallel search across all content types. A landing filter alone
            // is an events list: there is no text to match places against.
            val eventsDeferred = launch { searchEvents(query, kidsOnly, dateNight) }
            val restaurantsDeferred = launch {
                if (query.isEmpty()) _restaurantResults.value = emptyList() else searchRestaurants(query)
            }
            val attractionsDeferred = launch {
                if (query.isEmpty()) _attractionResults.value = emptyList() else searchAttractions(query)
            }

            eventsDeferred.join()
            restaurantsDeferred.join()
            attractionsDeferred.join()

            _isSearching.value = false
        }
    }

    private suspend fun searchEvents(query: String, kidsOnly: Boolean, dateNight: DateNightFilter.Times?) {
        // Date night is bounded to the web's 14 Central days; evenings are
        // filtered on the phone, as iOS does, so ask for more to filter.
        val window = dateNight?.let { DateNightFilter.windowBounds() }
        val eveningOnly = dateNight == DateNightFilter.Times.EVENING
        val result = eventsRepository.fetchEvents(
            EventsQuery(
                searchText = query.ifEmpty { null },
                kidsOnly = kidsOnly,
                dateNightOnly = dateNight != null,
                dateStart = window?.first,
                dateEnd = window?.second,
                limit = if (eveningOnly) DateNightFilter.EVENING_FETCH_LIMIT else DateNightFilter.RESULT_LIMIT,
            )
        )
        val fetched = result.getOrNull()?.events ?: emptyList()
        val events = if (eveningOnly) {
            fetched.filter(DateNightFilter::isEveningStart).take(DateNightFilter.RESULT_LIMIT)
        } else {
            fetched
        }
        // The fuzzy RPC knows nothing of the kids or date night rule, so it
        // would put unrelated events back into a filtered list.
        if (events.isEmpty() && !kidsOnly && dateNight == null) {
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

    private data class SearchProgress(
        val attractions: List<Attraction>,
        val isSearching: Boolean,
        val hasSearched: Boolean,
        val kidsOnly: Boolean,
        val dateNight: DateNightFilter.Times?,
    )

    private fun clearResults() {
        _eventResults.value = emptyList()
        _restaurantResults.value = emptyList()
        _attractionResults.value = emptyList()
        _hasSearched.value = false
    }
}
