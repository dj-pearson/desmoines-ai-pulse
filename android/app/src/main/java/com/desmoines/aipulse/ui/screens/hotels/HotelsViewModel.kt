package com.desmoines.aipulse.ui.screens.hotels

import androidx.compose.runtime.Immutable
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.desmoines.aipulse.data.model.Hotel
import com.desmoines.aipulse.data.remote.HotelSort
import com.desmoines.aipulse.data.remote.HotelsQuery
import com.desmoines.aipulse.data.repository.HotelsRepository
import com.desmoines.aipulse.util.PaginationGuard
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

@Immutable
data class HotelsUiState(
    val hotels: List<Hotel> = emptyList(),
    val areas: List<String> = emptyList(),
    val selectedAreas: Set<String> = emptySet(),
    val selectedPriceRanges: Set<String> = emptySet(),
    val minRating: Double? = null,
    val sort: HotelSort = HotelSort.FEATURED,
    val searchText: String = "",
    val isLoading: Boolean = true,
    val isLoadingMore: Boolean = false,
    val isRefreshing: Boolean = false,
    val errorMessage: String? = null,
    val hasMore: Boolean = false,
) {
    val isEmpty: Boolean get() = hotels.isEmpty() && !isLoading && errorMessage == null
    val activeFilterCount: Int
        get() = selectedAreas.size + selectedPriceRanges.size + (if (minRating != null) 1 else 0)
    val hasActiveFilters: Boolean get() = activeFilterCount > 0
}

/**
 * Hotels / Stay hub (ANDP-033): browse active hotels with area chips, price-tier
 * toggles, a star-rating floor, a sort menu, debounced search, an offline
 * first-page cache, and pagination. Mirrors iOS HotelsView.
 */
@HiltViewModel
class HotelsViewModel @Inject constructor(
    private val repository: HotelsRepository,
) : ViewModel() {

    private val _uiState = MutableStateFlow(HotelsUiState())
    val uiState: StateFlow<HotelsUiState> = _uiState.asStateFlow()

    private var loaded = 0
    private var searchJob: Job? = null

    init {
        loadAreas()
        reload(refresh = false)
    }

    private fun loadAreas() {
        viewModelScope.launch {
            repository.fetchAreas().onSuccess { areas ->
                _uiState.update { it.copy(areas = areas) }
            }
        }
    }

    fun onSearchTextChanged(text: String) {
        _uiState.update { it.copy(searchText = text) }
        searchJob?.cancel()
        searchJob = viewModelScope.launch {
            delay(SEARCH_DEBOUNCE_MS)
            reload(refresh = false)
        }
    }

    fun onToggleArea(area: String) {
        _uiState.update { state ->
            val next = state.selectedAreas.toMutableSet().apply {
                if (!add(area)) remove(area)
            }
            state.copy(selectedAreas = next)
        }
        reload(refresh = false)
    }

    fun onTogglePriceRange(price: String) {
        _uiState.update { state ->
            val next = state.selectedPriceRanges.toMutableSet().apply {
                if (!add(price)) remove(price)
            }
            state.copy(selectedPriceRanges = next)
        }
        reload(refresh = false)
    }

    fun onSelectMinRating(rating: Double?) {
        if (rating == _uiState.value.minRating) return
        _uiState.update { it.copy(minRating = rating) }
        reload(refresh = false)
    }

    fun onSelectSort(sort: HotelSort) {
        if (sort == _uiState.value.sort) return
        _uiState.update { it.copy(sort = sort) }
        reload(refresh = false)
    }

    fun clearFilters() {
        val state = _uiState.value
        if (!state.hasActiveFilters) return
        _uiState.update { it.copy(selectedAreas = emptySet(), selectedPriceRanges = emptySet(), minRating = null) }
        reload(refresh = false)
    }

    fun refresh() = reload(refresh = true)

    fun retry() = reload(refresh = false)

    private fun reload(refresh: Boolean) {
        loaded = 0
        _uiState.update { it.copy(isLoading = !refresh && it.hotels.isEmpty(), isRefreshing = refresh, errorMessage = null) }
        viewModelScope.launch {
            repository.fetchHotels(currentQuery(offset = 0))
                .onSuccess { resp ->
                    val check = PaginationGuard.validatePage(resp.hotels, PAGE_SIZE, emptySet()) { it.id }
                    if (check is PaginationGuard.Result.Invalid) {
                        _uiState.update { it.copy(isLoading = false, isRefreshing = false, errorMessage = "Couldn't load hotels. Tap to retry.") }
                        return@onSuccess
                    }
                    loaded = resp.hotels.size
                    _uiState.update {
                        it.copy(hotels = resp.hotels, hasMore = resp.hasMore, isLoading = false, isRefreshing = false, errorMessage = null)
                    }
                }
                .onFailure {
                    _uiState.update { it.copy(isLoading = false, isRefreshing = false, errorMessage = "Couldn't load hotels. Tap to retry.") }
                }
        }
    }

    fun loadMore() {
        val state = _uiState.value
        if (!state.hasMore || state.isLoadingMore || state.isLoading) return
        _uiState.update { it.copy(isLoadingMore = true) }
        viewModelScope.launch {
            repository.fetchHotels(currentQuery(offset = loaded))
                .onSuccess { resp ->
                    val existingIds = _uiState.value.hotels.mapTo(HashSet()) { it.id }
                    val check = PaginationGuard.validatePage(resp.hotels, PAGE_SIZE, existingIds) { it.id }
                    if (check is PaginationGuard.Result.Invalid) {
                        // Halt paging and surface a retry rather than appending corrupt data.
                        _uiState.update { it.copy(isLoadingMore = false, hasMore = false, errorMessage = "Couldn't load more. Tap to retry.") }
                        return@onSuccess
                    }
                    loaded += resp.hotels.size
                    _uiState.update { it.copy(hotels = it.hotels + resp.hotels, hasMore = resp.hasMore, isLoadingMore = false) }
                }
                .onFailure {
                    _uiState.update { it.copy(isLoadingMore = false, errorMessage = "Couldn't load more. Tap to retry.") }
                }
        }
    }

    private fun currentQuery(offset: Int): HotelsQuery = with(_uiState.value) {
        HotelsQuery(
            searchText = searchText.trim().ifEmpty { null },
            areas = selectedAreas.toList(),
            priceRanges = selectedPriceRanges.toList(),
            minRating = minRating,
            sort = sort,
            limit = PAGE_SIZE,
            offset = offset,
        )
    }

    companion object {
        private const val PAGE_SIZE = 20
        private const val SEARCH_DEBOUNCE_MS = 350L

        /** Price-tier toggles (parity with the web/iOS hub). */
        val PRICE_RANGES = listOf("$", "$$", "$$$", "$$$$")

        /** Star-rating floor options. */
        val RATING_OPTIONS = listOf(3.0, 3.5, 4.0, 4.5)
    }
}
