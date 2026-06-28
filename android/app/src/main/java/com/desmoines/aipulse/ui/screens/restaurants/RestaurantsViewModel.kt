package com.desmoines.aipulse.ui.screens.restaurants

import android.util.Log
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.desmoines.aipulse.data.model.Restaurant
import com.desmoines.aipulse.data.model.RestaurantSortOption
import com.desmoines.aipulse.data.model.SubscriptionTier
import com.desmoines.aipulse.data.remote.RestaurantsQuery
import com.desmoines.aipulse.data.repository.RestaurantsRepository
import com.desmoines.aipulse.util.Config
import com.desmoines.aipulse.util.NetworkMonitor
import com.desmoines.aipulse.util.RECONNECT_DEBOUNCE_MS
import com.desmoines.aipulse.util.onReconnect
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import javax.inject.Inject

private const val TAG = "RestaurantsViewModel"

/**
 * State holder for the Restaurants (Dining) screen.
 */
data class RestaurantsScreenState(
    val restaurants: List<Restaurant> = emptyList(),
    val isLoading: Boolean = false,
    val isLoadingMore: Boolean = false,
    val isRefreshing: Boolean = false,
    val hasMore: Boolean = false,
    val totalCount: Int = 0,
    val errorMessage: String? = null,
    val availableCuisines: List<String> = emptyList(),
    val selectedCuisines: Set<String> = emptySet(),
    val selectedPriceRanges: Set<String> = emptySet(),
    val sortBy: RestaurantSortOption = RestaurantSortOption.POPULARITY,
    val showOpenNowOnly: Boolean = false,
    val searchText: String = "",
    val activeFilterCount: Int = 0,
    val currentTier: SubscriptionTier = SubscriptionTier.FREE,
)

/**
 * ViewModel for the Restaurants (Dining) tab.
 * Mirrors iOS RestaurantsViewModel.swift — same filtering, sorting, pagination, caching.
 */
@HiltViewModel
class RestaurantsViewModel @Inject constructor(
    private val restaurantsRepository: RestaurantsRepository,
    private val networkMonitor: NetworkMonitor,
) : ViewModel() {

    // region State

    private val _restaurants = MutableStateFlow<List<Restaurant>>(emptyList())
    private val _allRestaurants = MutableStateFlow<List<Restaurant>>(emptyList())
    private val _isLoading = MutableStateFlow(false)
    private val _isLoadingMore = MutableStateFlow(false)
    private val _isRefreshing = MutableStateFlow(false)
    private val _hasMore = MutableStateFlow(false)
    private val _totalCount = MutableStateFlow(0)
    private val _errorMessage = MutableStateFlow<String?>(null)
    private val _availableCuisines = MutableStateFlow<List<String>>(emptyList())

    // Filter state
    private val _selectedCuisines = MutableStateFlow<Set<String>>(emptySet())
    private val _selectedPriceRanges = MutableStateFlow<Set<String>>(emptySet())
    private val _sortBy = MutableStateFlow(RestaurantSortOption.POPULARITY)
    private val _showOpenNowOnly = MutableStateFlow(false)
    private val _searchText = MutableStateFlow("")
    private val _currentTier = MutableStateFlow(SubscriptionTier.FREE)

    private var currentOffset = 0
    private val pageSize = Config.DEFAULT_PAGE_SIZE
    private var fetchJob: Job? = null
    private var hasLoadedInitialData = false

    // endregion

    // region Combined UI State

    val uiState: StateFlow<RestaurantsScreenState> = combine(
        _restaurants, _isLoading, _isLoadingMore, _isRefreshing, _hasMore,
    ) { restaurants, isLoading, isLoadingMore, isRefreshing, hasMore ->
        RestaurantsScreenState(
            restaurants = restaurants,
            isLoading = isLoading,
            isLoadingMore = isLoadingMore,
            isRefreshing = isRefreshing,
            hasMore = hasMore,
        )
    }.combine(
        combine(
            _totalCount, _errorMessage, _availableCuisines, _selectedCuisines, _selectedPriceRanges,
        ) { totalCount, errorMessage, availableCuisines, selectedCuisines, selectedPriceRanges ->
            RestaurantsScreenState(
                totalCount = totalCount,
                errorMessage = errorMessage,
                availableCuisines = availableCuisines,
                selectedCuisines = selectedCuisines,
                selectedPriceRanges = selectedPriceRanges,
            )
        }
    ) { dataState, filterState ->
        dataState.copy(
            totalCount = filterState.totalCount,
            errorMessage = filterState.errorMessage,
            availableCuisines = filterState.availableCuisines,
            selectedCuisines = filterState.selectedCuisines,
            selectedPriceRanges = filterState.selectedPriceRanges,
        )
    }.combine(
        combine(
            _sortBy, _showOpenNowOnly, _searchText, _currentTier,
        ) { sortBy, showOpenNowOnly, searchText, currentTier ->
            RestaurantsScreenState(
                sortBy = sortBy,
                showOpenNowOnly = showOpenNowOnly,
                searchText = searchText,
                currentTier = currentTier,
            )
        }
    ) { combined, sortState ->
        val activeFilterCount = computeActiveFilterCount(
            selectedCuisines = combined.selectedCuisines,
            selectedPriceRanges = combined.selectedPriceRanges,
            searchText = sortState.searchText,
            showOpenNowOnly = sortState.showOpenNowOnly,
        )
        combined.copy(
            sortBy = sortState.sortBy,
            showOpenNowOnly = sortState.showOpenNowOnly,
            searchText = sortState.searchText,
            activeFilterCount = activeFilterCount,
            currentTier = sortState.currentTier,
        )
    }.stateIn(
        scope = viewModelScope,
        started = SharingStarted.WhileSubscribed(5_000),
        initialValue = RestaurantsScreenState(),
    )

    // endregion

    // region Public API

    init {
        // Auto-refetch the visible first page when connectivity returns (ANDP-069).
        viewModelScope.launch {
            networkMonitor.isConnected.onReconnect().collect {
                delay(RECONNECT_DEBOUNCE_MS)
                if (hasLoadedInitialData && networkMonitor.isConnected.value) refresh()
            }
        }
    }

    fun loadInitialData() {
        if (hasLoadedInitialData) return
        hasLoadedInitialData = true

        viewModelScope.launch {
            // Serve cached data immediately
            val isOffline = !networkMonitor.isConnected.value
            restaurantsRepository.fetchRestaurants(buildQuery()).onSuccess { response ->
                _allRestaurants.value = response.restaurants
                applyOpenNowFilter()
                _totalCount.value = response.totalCount
                _hasMore.value = response.hasMore
                currentOffset = response.restaurants.size
            }

            if (isOffline && _restaurants.value.isNotEmpty()) return@launch

            // Fetch fresh data and cuisines in parallel
            launch { fetchRestaurants(reset = true) }
            launch { loadCuisines() }
        }
    }

    fun refresh() {
        viewModelScope.launch {
            _isRefreshing.value = true
            _errorMessage.value = null
            fetchRestaurants(reset = true)
            _isRefreshing.value = false
        }
    }

    fun loadMoreIfNeeded(currentIndex: Int) {
        if (!_hasMore.value || _isLoadingMore.value) return
        if (currentIndex < _restaurants.value.size - 5) return

        viewModelScope.launch {
            fetchRestaurants(reset = false)
        }
    }

    fun setSortBy(option: RestaurantSortOption) {
        if (_sortBy.value == option) return
        _sortBy.value = option
        resetAndFetch()
    }

    fun toggleOpenNowOnly() {
        _showOpenNowOnly.value = !_showOpenNowOnly.value
        applyOpenNowFilter()
    }

    fun toggleCuisine(cuisine: String) {
        _selectedCuisines.value = _selectedCuisines.value.toMutableSet().apply {
            if (contains(cuisine)) remove(cuisine) else add(cuisine)
        }
        resetAndFetch()
    }

    fun togglePriceRange(priceRange: String) {
        _selectedPriceRanges.value = _selectedPriceRanges.value.toMutableSet().apply {
            if (contains(priceRange)) remove(priceRange) else add(priceRange)
        }
        resetAndFetch()
    }

    fun clearFilters() {
        _selectedCuisines.value = emptySet()
        _selectedPriceRanges.value = emptySet()
        _searchText.value = ""
        _sortBy.value = RestaurantSortOption.POPULARITY
        _showOpenNowOnly.value = false
        resetAndFetch()
    }

    // endregion

    // region Private

    private suspend fun fetchRestaurants(reset: Boolean) {
        if (reset) {
            currentOffset = 0
            if (_restaurants.value.isEmpty()) _isLoading.value = true
        } else {
            _isLoadingMore.value = true
        }
        _errorMessage.value = null

        val query = buildQuery().copy(offset = currentOffset)

        restaurantsRepository.fetchRestaurants(query).onSuccess { response ->
            if (reset) {
                _allRestaurants.value = response.restaurants
            } else {
                _allRestaurants.value = _allRestaurants.value + response.restaurants
            }
            applyOpenNowFilter()
            _totalCount.value = response.totalCount
            _hasMore.value = response.hasMore
            currentOffset = _allRestaurants.value.size
        }.onFailure { error ->
            Log.e(TAG, "fetchRestaurants failed: ${error.message}", error)
            if (_restaurants.value.isEmpty()) {
                _errorMessage.value = error.localizedMessage ?: "Failed to load restaurants"
            }
        }

        _isLoading.value = false
        _isLoadingMore.value = false
    }

    private fun buildQuery(): RestaurantsQuery = RestaurantsQuery(
        searchText = _searchText.value.ifBlank { null },
        cuisines = _selectedCuisines.value.takeIf { it.isNotEmpty() }?.toList(),
        priceRanges = _selectedPriceRanges.value.takeIf { it.isNotEmpty() }?.toList(),
        sortBy = _sortBy.value,
        limit = pageSize,
        offset = currentOffset,
    )

    private fun applyOpenNowFilter() {
        _restaurants.value = if (_showOpenNowOnly.value) {
            _allRestaurants.value.filter { it.isOpenNow() == true }
        } else {
            _allRestaurants.value
        }
    }

    private suspend fun loadCuisines() {
        restaurantsRepository.fetchAvailableCuisines().onSuccess { cuisines ->
            _availableCuisines.value = cuisines
        }.onFailure {
            Log.e(TAG, "loadCuisines failed: ${it.message}", it)
            _availableCuisines.value = emptyList()
        }
    }

    private fun resetAndFetch() {
        fetchJob?.cancel()
        fetchJob = viewModelScope.launch {
            delay(300) // Debounce matching iOS
            fetchRestaurants(reset = true)
        }
    }

    private fun computeActiveFilterCount(
        selectedCuisines: Set<String>,
        selectedPriceRanges: Set<String>,
        searchText: String,
        showOpenNowOnly: Boolean,
    ): Int {
        var count = 0
        if (selectedCuisines.isNotEmpty()) count++
        if (selectedPriceRanges.isNotEmpty()) count++
        if (searchText.isNotBlank()) count++
        if (showOpenNowOnly) count++
        return count
    }

    // endregion
}
