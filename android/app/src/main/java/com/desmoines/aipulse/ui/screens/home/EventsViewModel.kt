package com.desmoines.aipulse.ui.screens.home

import android.util.Log
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.desmoines.aipulse.data.model.DateFilterPreset
import com.desmoines.aipulse.data.model.Event
import com.desmoines.aipulse.data.model.EventCategory
import com.desmoines.aipulse.data.model.Restaurant
import com.desmoines.aipulse.data.model.SubscriptionTier
import com.desmoines.aipulse.data.remote.EventsQuery
import com.desmoines.aipulse.data.model.RestaurantSortOption
import com.desmoines.aipulse.data.remote.RestaurantsQuery
import com.desmoines.aipulse.data.repository.EventsRepository
import com.desmoines.aipulse.data.repository.RestaurantsRepository
import com.desmoines.aipulse.util.Config
import com.desmoines.aipulse.util.LocationService
import com.desmoines.aipulse.util.NetworkMonitor
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import java.time.format.DateTimeFormatter
import javax.inject.Inject

private const val TAG = "EventsViewModel"

/**
 * ViewModel for the Home screen / events feed.
 * Mirrors iOS EventsViewModel.swift — handles fetching, filtering, pagination, caching.
 */
@HiltViewModel
class EventsViewModel @Inject constructor(
    private val eventsRepository: EventsRepository,
    private val restaurantsRepository: RestaurantsRepository,
    private val networkMonitor: NetworkMonitor,
    private val locationService: LocationService,
) : ViewModel() {

    // region State

    private val _events = MutableStateFlow<List<Event>>(emptyList())
    val events: StateFlow<List<Event>> = _events.asStateFlow()

    private val _featuredEvents = MutableStateFlow<List<Event>>(emptyList())
    val featuredEvents: StateFlow<List<Event>> = _featuredEvents.asStateFlow()

    private val _restaurants = MutableStateFlow<List<Restaurant>>(emptyList())
    val restaurants: StateFlow<List<Restaurant>> = _restaurants.asStateFlow()

    private val _isLoading = MutableStateFlow(false)
    val isLoading: StateFlow<Boolean> = _isLoading.asStateFlow()

    private val _isLoadingMore = MutableStateFlow(false)
    val isLoadingMore: StateFlow<Boolean> = _isLoadingMore.asStateFlow()

    private val _isRefreshing = MutableStateFlow(false)
    val isRefreshing: StateFlow<Boolean> = _isRefreshing.asStateFlow()

    private val _hasMore = MutableStateFlow(false)
    val hasMore: StateFlow<Boolean> = _hasMore.asStateFlow()

    private val _totalCount = MutableStateFlow(0)
    val totalCount: StateFlow<Int> = _totalCount.asStateFlow()

    private val _errorMessage = MutableStateFlow<String?>(null)
    val errorMessage: StateFlow<String?> = _errorMessage.asStateFlow()

    // endregion

    // region Filters

    private val _searchText = MutableStateFlow("")
    val searchText: StateFlow<String> = _searchText.asStateFlow()

    private val _selectedCategory = MutableStateFlow<EventCategory?>(null)
    val selectedCategory: StateFlow<EventCategory?> = _selectedCategory.asStateFlow()

    private val _selectedDatePreset = MutableStateFlow<DateFilterPreset?>(null)
    val selectedDatePreset: StateFlow<DateFilterPreset?> = _selectedDatePreset.asStateFlow()

    private val _showFeaturedOnly = MutableStateFlow(false)
    val showFeaturedOnly: StateFlow<Boolean> = _showFeaturedOnly.asStateFlow()

    // Premium filters (Insider+ only)
    private val _showFreeOnly = MutableStateFlow(false)
    val showFreeOnly: StateFlow<Boolean> = _showFreeOnly.asStateFlow()

    private val _maxDistance = MutableStateFlow<Double?>(null)
    val maxDistance: StateFlow<Double?> = _maxDistance.asStateFlow()

    private val _minRating = MutableStateFlow<Double?>(null)
    val minRating: StateFlow<Double?> = _minRating.asStateFlow()

    // Current subscription tier (set externally when subscription state changes)
    private val _currentTier = MutableStateFlow(SubscriptionTier.FREE)
    val currentTier: StateFlow<SubscriptionTier> = _currentTier.asStateFlow()

    // endregion

    // region Derived State

    /**
     * Combined UI state for HomeScreen. Mirrors iOS approach of computed properties
     * exposed to the view, but uses Compose-friendly StateFlow.
     */
    @Suppress("UNCHECKED_CAST")
    val uiState: StateFlow<HomeScreenState> = combine(
        _events, _featuredEvents, _restaurants,
        _isLoading, _isLoadingMore, _isRefreshing,
        _hasMore, _totalCount, _errorMessage,
    ) { values: Array<Any?> ->
        HomeScreenState(
            events = values[0] as List<Event>,
            featuredEvents = values[1] as List<Event>,
            restaurants = values[2] as List<Restaurant>,
            isLoading = values[3] as Boolean,
            isLoadingMore = values[4] as Boolean,
            isRefreshing = values[5] as Boolean,
            hasMore = values[6] as Boolean,
            totalCount = values[7] as Int,
            errorMessage = values[8] as String?,
        )
    }.combine(
        combine(
            _selectedCategory, _selectedDatePreset, _showFeaturedOnly,
            _searchText, _showFreeOnly, _maxDistance, _minRating, _currentTier,
            networkMonitor.isConnected,
        ) { filterValues: Array<Any?> ->
            FilterState(
                selectedCategory = filterValues[0] as EventCategory?,
                selectedDatePreset = filterValues[1] as DateFilterPreset?,
                showFeaturedOnly = filterValues[2] as Boolean,
                searchText = filterValues[3] as String,
                showFreeOnly = filterValues[4] as Boolean,
                maxDistance = filterValues[5] as Double?,
                minRating = filterValues[6] as Double?,
                currentTier = filterValues[7] as SubscriptionTier,
                isConnected = filterValues[8] as Boolean,
            )
        }
    ) { state, filters ->
        state.copy(
            selectedCategory = filters.selectedCategory,
            selectedDatePreset = filters.selectedDatePreset,
            showFeaturedOnly = filters.showFeaturedOnly,
            activeFilterCount = computeActiveFilterCount(filters),
            currentTier = filters.currentTier,
            isConnected = filters.isConnected,
        )
    }.stateIn(
        scope = viewModelScope,
        started = SharingStarted.WhileSubscribed(5_000),
        initialValue = HomeScreenState(),
    )

    // endregion

    // region Pagination

    private var currentOffset = 0
    private val pageSize = Config.DEFAULT_PAGE_SIZE
    private var debounceJob: Job? = null
    private var hasLoadedInitialData = false

    // endregion

    // region Public API

    /**
     * Load initial data — serve cached data immediately, fetch fresh in background.
     * Skip network if offline with cache hit. Mirrors iOS loadInitialData().
     */
    fun loadInitialData() {
        if (hasLoadedInitialData) return
        hasLoadedInitialData = true

        viewModelScope.launch {
            _isLoading.value = _events.value.isEmpty()

            // Fetch events and featured events in parallel
            launch { fetchEvents(reset = true) }
            launch { fetchFeaturedEvents() }
            launch { fetchPopularRestaurants() }
        }
    }

    /**
     * Pull-to-refresh — always bypasses cache. Mirrors iOS refresh().
     */
    fun refresh() {
        viewModelScope.launch {
            _isRefreshing.value = true
            _errorMessage.value = null

            launch { fetchEvents(reset = true) }
            launch { fetchFeaturedEvents() }
            launch { fetchPopularRestaurants() }

            // Wait a beat then clear refreshing (individual fetches handle their own state)
            delay(300)
            _isRefreshing.value = false
        }
    }

    fun setSearchText(text: String) {
        _searchText.value = text
        resetAndFetch()
    }

    fun setSelectedCategory(category: EventCategory?) {
        _selectedCategory.value = category
        resetAndFetch()
    }

    fun setSelectedDatePreset(preset: DateFilterPreset?) {
        _selectedDatePreset.value = preset
        resetAndFetch()
    }

    fun setShowFeaturedOnly(featured: Boolean) {
        _showFeaturedOnly.value = featured
        resetAndFetch()
    }

    fun setShowFreeOnly(freeOnly: Boolean) {
        _showFreeOnly.value = freeOnly
        resetAndFetch()
    }

    fun setMaxDistance(distance: Double?) {
        _maxDistance.value = distance
        resetAndFetch()
    }

    fun setMinRating(rating: Double?) {
        _minRating.value = rating
        resetAndFetch()
    }

    fun setCurrentTier(tier: SubscriptionTier) {
        _currentTier.value = tier
    }

    fun clearFilters() {
        _selectedCategory.value = null
        _selectedDatePreset.value = null
        _showFeaturedOnly.value = false
        _searchText.value = ""
        _showFreeOnly.value = false
        _maxDistance.value = null
        _minRating.value = null
        resetAndFetch()
    }

    /**
     * Trigger load more when user scrolls near end of list.
     * Mirrors iOS loadMoreIfNeeded(currentItem:).
     */
    fun loadMoreIfNeeded(currentIndex: Int) {
        val events = _events.value
        if (!_hasMore.value || _isLoadingMore.value) return
        if (currentIndex < events.size - 5) return

        viewModelScope.launch {
            fetchEvents(reset = false)
        }
    }

    // endregion

    // region Private Implementation

    /**
     * Fetch events from repository. Mirrors iOS fetchEvents(reset:).
     */
    private suspend fun fetchEvents(reset: Boolean) {
        if (reset) {
            currentOffset = 0
            if (_events.value.isEmpty()) {
                _isLoading.value = true
            }
        } else {
            _isLoadingMore.value = true
        }
        _errorMessage.value = null

        val dateTimeFormatter = DateTimeFormatter.ISO_LOCAL_DATE_TIME

        val query = EventsQuery(
            searchText = _searchText.value.ifEmpty { null },
            category = _selectedCategory.value?.displayName,
            dateStart = _selectedDatePreset.value?.dateRange?.first?.format(dateTimeFormatter),
            dateEnd = _selectedDatePreset.value?.dateRange?.second?.format(dateTimeFormatter),
            isFeatured = if (_showFeaturedOnly.value) true else null,
            limit = pageSize,
            offset = currentOffset,
        )

        eventsRepository.fetchEvents(query)
            .onSuccess { response ->
                val filtered = applyPremiumFilters(response.events)
                if (reset) {
                    _events.value = filtered
                } else {
                    _events.update { current -> current + filtered }
                }
                _totalCount.value = response.totalCount
                _hasMore.value = response.hasMore
                currentOffset = _events.value.size
            }
            .onFailure { error ->
                Log.e(TAG, "fetchEvents failed: ${error.message}", error)
                // If offline and we have cached data, don't overwrite with an error
                if (_events.value.isEmpty()) {
                    _errorMessage.value = error.message ?: "Failed to load events"
                }
            }

        _isLoading.value = false
        _isLoadingMore.value = false
    }

    /**
     * Fetch featured events. Mirrors iOS fetchFeaturedEvents().
     */
    private suspend fun fetchFeaturedEvents() {
        eventsRepository.fetchFeaturedEvents()
            .onSuccess { featured ->
                _featuredEvents.value = featured
            }
            .onFailure { error ->
                Log.e(TAG, "fetchFeaturedEvents failed: ${error.message}", error)
                // Keep existing cached featured events on failure
            }
    }

    /**
     * Fetch popular restaurants for the home screen carousel.
     * Uses default query sorted by popularity.
     */
    private suspend fun fetchPopularRestaurants() {
        restaurantsRepository.fetchRestaurants(
            RestaurantsQuery(
                sortBy = RestaurantSortOption.POPULARITY,
                isFeatured = true,
                limit = 10,
            )
        ).onSuccess { response ->
            _restaurants.value = response.restaurants
        }.onFailure { error ->
            Log.e(TAG, "fetchPopularRestaurants failed: ${error.message}", error)
        }
    }

    /**
     * Apply premium filters client-side. Mirrors iOS applyPremiumFilters(_:).
     */
    private fun applyPremiumFilters(events: List<Event>): List<Event> {
        var result = events

        if (_showFreeOnly.value) {
            result = result.filter { it.isFree }
        }

        val maxDist = _maxDistance.value
        if (maxDist != null) {
            val userLoc = locationService.userLocation.value
            val userLat = userLoc?.latitude ?: Config.DEFAULT_LATITUDE
            val userLng = userLoc?.longitude ?: Config.DEFAULT_LONGITUDE
            result = result.filter { event ->
                val coord = event.coordinate ?: return@filter true
                val distanceMiles = locationService.haversineDistanceMiles(
                    userLat, userLng, coord.latitude, coord.longitude
                )
                distanceMiles <= maxDist
            }
        }

        // minRating available for future use when events have ratings
        return result
    }

    /**
     * Debounced reset and fetch. Mirrors iOS resetAndFetch().
     * Cancels any pending fetch and waits 300ms before fetching.
     */
    private fun resetAndFetch() {
        debounceJob?.cancel()
        debounceJob = viewModelScope.launch {
            delay(Config.SEARCH_DEBOUNCE_MS)
            fetchEvents(reset = true)
        }
    }

    private fun computeActiveFilterCount(filters: FilterState): Int {
        var count = 0
        if (filters.selectedCategory != null) count++
        if (filters.selectedDatePreset != null) count++
        if (filters.showFeaturedOnly) count++
        if (filters.searchText.isNotEmpty()) count++
        if (filters.showFreeOnly) count++
        if (filters.maxDistance != null) count++
        if (filters.minRating != null) count++
        return count
    }

    // endregion
}

/**
 * Internal filter state holder for combine operations.
 */
private data class FilterState(
    val selectedCategory: EventCategory? = null,
    val selectedDatePreset: DateFilterPreset? = null,
    val showFeaturedOnly: Boolean = false,
    val searchText: String = "",
    val showFreeOnly: Boolean = false,
    val maxDistance: Double? = null,
    val minRating: Double? = null,
    val currentTier: SubscriptionTier = SubscriptionTier.FREE,
    val isConnected: Boolean = true,
)
