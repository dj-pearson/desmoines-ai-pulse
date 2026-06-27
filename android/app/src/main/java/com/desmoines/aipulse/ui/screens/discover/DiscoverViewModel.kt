package com.desmoines.aipulse.ui.screens.discover

import androidx.compose.runtime.Immutable
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.desmoines.aipulse.data.model.PaywallContext
import com.desmoines.aipulse.data.model.SwipeItem
import com.desmoines.aipulse.data.model.SwipeItemType
import com.desmoines.aipulse.data.remote.EventsQuery
import com.desmoines.aipulse.data.remote.FavoritesException
import com.desmoines.aipulse.data.remote.RestaurantsQuery
import com.desmoines.aipulse.data.repository.AuthRepository
import com.desmoines.aipulse.data.repository.EventsRepository
import com.desmoines.aipulse.data.repository.FavoritesRepository
import com.desmoines.aipulse.data.repository.RestaurantsRepository
import com.desmoines.aipulse.util.SoftPaywallService
import com.desmoines.aipulse.util.SwipeInteractionService
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import java.time.format.DateTimeFormatter
import javax.inject.Inject

@Immutable
data class DiscoverUiState(
    val items: List<SwipeItem> = emptyList(),
    val isLoading: Boolean = true,
    val errorMessage: String? = null,
    /** Number of items saved (liked) this session — drives the saved-count badge. */
    val savedCount: Int = 0,
    val mode: DiscoverMode = DiscoverMode.MIXED,
    /** Filter chips shown above the deck (boost narrowing or a typed pre-filter). */
    val filterTags: List<String> = emptyList(),
    /** True when a typed pre-filter locks the mode toggle. */
    val modeLocked: Boolean = false,
) {
    val isEmpty: Boolean get() = items.isEmpty() && !isLoading && errorMessage == null
}

/**
 * Feeds + scopes the Discover swipe deck (ANDP-020/021/022). Owns the mode
 * toggle, filter context, independent paged fetches with a stale-result
 * generation guard, background prefetch, and "more like this" boost narrowing —
 * plus swipe persistence (records signals, dedupes, likes → favorites).
 * Mirrors iOS DiscoverViewModel.
 */
@HiltViewModel
class DiscoverViewModel @Inject constructor(
    private val eventsRepository: EventsRepository,
    private val restaurantsRepository: RestaurantsRepository,
    private val favoritesRepository: FavoritesRepository,
    private val authRepository: AuthRepository,
    private val swipeInteractionService: SwipeInteractionService,
    private val softPaywallService: SoftPaywallService,
) : ViewModel() {

    private val _uiState = MutableStateFlow(DiscoverUiState())
    val uiState: StateFlow<DiscoverUiState> = _uiState.asStateFlow()

    private var filter = DiscoverFilterContext()

    private var favoriteEventIds: Set<String> = emptySet()
    private var favoriteRestaurantIds: Set<String> = emptySet()

    // Paging + stale-result guard.
    private var eventOffset = 0
    private var restaurantOffset = 0
    private var hasMoreEvents = true
    private var hasMoreRestaurants = true
    private var fetchGeneration = 0
    private var fetchErrored = false
    private val fetchMutex = Mutex()

    init {
        loadFavorites()
        reload()
    }

    private fun loadFavorites() {
        val userId = authRepository.currentUserId ?: return
        viewModelScope.launch {
            favoritesRepository.loadFavorites(userId).onSuccess { state ->
                favoriteEventIds = state.favoriteEventIds
                favoriteRestaurantIds = state.favoriteRestaurantIds
            }
        }
    }

    fun setMode(mode: DiscoverMode) {
        if (mode == _uiState.value.mode || _uiState.value.modeLocked) return
        _uiState.update { it.copy(mode = mode) }
        reload()
    }

    fun clearFilter() {
        if (filter.isEmpty || _uiState.value.modeLocked) return
        filter = DiscoverFilterContext()
        reload()
    }

    fun reload() {
        _uiState.update { it.copy(isLoading = true, items = emptyList(), errorMessage = null, filterTags = filter.tags()) }
        resetPaging()
        fetchGeneration++
        viewModelScope.launch {
            fetchMore()
            _uiState.update {
                it.copy(
                    isLoading = false,
                    errorMessage = if (it.items.isEmpty() && fetchErrored) {
                        "Couldn't load the discovery deck. Try again."
                    } else null,
                )
            }
        }
    }

    fun onLike(item: SwipeItem) {
        record(SwipeInteractionService.Action.LIKE, item)
        advancePast(item)
        saveFavorite(item)
    }

    fun onSkip(item: SwipeItem) {
        record(SwipeInteractionService.Action.SKIP, item)
        advancePast(item)
    }

    /** Boost = strong positive + "show me more like this": narrow the filter and refetch. */
    fun onBoost(item: SwipeItem) {
        record(SwipeInteractionService.Action.BOOST, item)
        applyBoostFilter(item)
        reload()
    }

    /** Detail tap records a weak-positive signal; navigation is handled by the caller. */
    fun onDetail(item: SwipeItem) {
        record(SwipeInteractionService.Action.DETAIL, item)
    }

    fun clearError() = _uiState.update { it.copy(errorMessage = null) }

    // MARK: - Internals

    private fun applyBoostFilter(item: SwipeItem) {
        filter = when (item.itemType) {
            SwipeItemType.EVENT -> filter.copy(eventCategory = item.eventCategory ?: filter.eventCategory)
            SwipeItemType.RESTAURANT ->
                item.cuisine?.let { filter.copy(cuisines = listOf(it)) } ?: filter
        }
    }

    private fun record(action: SwipeInteractionService.Action, item: SwipeItem) {
        viewModelScope.launch {
            swipeInteractionService.record(action, itemTypeString(item), item.rawId, filter.toSourceContext())
        }
    }

    private fun saveFavorite(item: SwipeItem) {
        val userId = authRepository.currentUserId ?: return
        viewModelScope.launch {
            val result = when (item.itemType) {
                SwipeItemType.EVENT ->
                    favoritesRepository.toggleEventFavorite(userId, item.rawId, favoriteEventIds)
                SwipeItemType.RESTAURANT ->
                    favoritesRepository.toggleRestaurantFavorite(userId, item.rawId, favoriteRestaurantIds)
            }
            result
                .onSuccess { favorited ->
                    if (favorited) {
                        when (item.itemType) {
                            SwipeItemType.EVENT -> favoriteEventIds = favoriteEventIds + item.rawId
                            SwipeItemType.RESTAURANT -> favoriteRestaurantIds = favoriteRestaurantIds + item.rawId
                        }
                        _uiState.update { it.copy(savedCount = it.savedCount + 1) }
                    }
                }
                .onFailure { error ->
                    // At the free cap, soft-fail to the paywall rather than show a
                    // Discover-specific error; other failures are logged, not surfaced.
                    if (error is FavoritesException.LimitReached) {
                        softPaywallService.maybePresent(PaywallContext.FAVORITES)
                    }
                }
        }
    }

    /** Remove the committed card; prefetch the next page when the deck runs low. */
    private fun advancePast(item: SwipeItem) {
        _uiState.update { state -> state.copy(items = state.items.filterNot { it.id == item.id }) }
        if (_uiState.value.items.size <= PREFETCH_THRESHOLD && !fetchMutex.isLocked) {
            viewModelScope.launch { fetchMore() }
        }
    }

    private fun resetPaging() {
        eventOffset = 0
        restaurantOffset = 0
        hasMoreEvents = true
        hasMoreRestaurants = true
    }

    private suspend fun fetchMore() {
        fetchMutex.withLock {
            fetchErrored = false
            val generation = fetchGeneration
            when (_uiState.value.mode) {
                DiscoverMode.EVENTS -> fetchEventBatch(generation)
                DiscoverMode.RESTAURANTS -> fetchRestaurantBatch(generation)
                DiscoverMode.MIXED -> coroutineScope {
                    val events = async { fetchEventBatch(generation) }
                    val restaurants = async { fetchRestaurantBatch(generation) }
                    events.await()
                    restaurants.await()
                }
            }
        }
    }

    private suspend fun fetchEventBatch(generation: Int) {
        if (!hasMoreEvents) return
        // "Tonight" (mixed) with no explicit preset shows the next 7 days so the
        // deck isn't empty, without pulling events weeks out.
        val preset = filter.datePreset
            ?: if (_uiState.value.mode == DiscoverMode.MIXED) com.desmoines.aipulse.data.model.DateFilterPreset.THIS_WEEK else null
        val range = preset?.dateRange
        val query = EventsQuery(
            category = filter.eventCategory,
            dateStart = range?.first?.format(ISO),
            dateEnd = range?.second?.format(ISO),
            limit = PAGE_SIZE,
            offset = eventOffset,
        )
        eventsRepository.fetchEvents(query)
            .onSuccess { response ->
                if (generation != fetchGeneration) return
                val fresh = response.events
                    .filterNot { swipeInteractionService.hasSwiped("event", it.id) }
                    .map(SwipeItem::from)
                appendUnique(fresh)
                eventOffset += response.events.size
                hasMoreEvents = response.hasMore
            }
            .onFailure {
                if (generation != fetchGeneration) return
                hasMoreEvents = false
                fetchErrored = true
            }
    }

    private suspend fun fetchRestaurantBatch(generation: Int) {
        if (!hasMoreRestaurants) return
        val query = RestaurantsQuery(
            cuisines = filter.cuisines.ifEmpty { null },
            priceRanges = filter.priceRanges.ifEmpty { null },
            locations = filter.locations.ifEmpty { null },
            minRating = filter.minRating.takeIf { it > 0 },
            limit = PAGE_SIZE,
            offset = restaurantOffset,
        )
        restaurantsRepository.fetchRestaurants(query)
            .onSuccess { response ->
                if (generation != fetchGeneration) return
                val fresh = response.restaurants
                    .let { list -> if (filter.openNow) list.filter { it.isOpenNow() == true } else list }
                    .filterNot { swipeInteractionService.hasSwiped("restaurant", it.id) }
                    .map(SwipeItem::from)
                appendUnique(fresh)
                restaurantOffset += response.restaurants.size
                hasMoreRestaurants = response.hasMore
            }
            .onFailure {
                if (generation != fetchGeneration) return
                hasMoreRestaurants = false
                fetchErrored = true
            }
    }

    private fun appendUnique(newItems: List<SwipeItem>) {
        _uiState.update { state ->
            val existing = state.items.mapTo(HashSet()) { it.id }
            val unique = newItems.filterNot { existing.contains(it.id) }
            // Mixed mode: shuffle the new batch so events and restaurants interleave
            // instead of arriving in two solid blocks.
            val toAppend = if (state.mode == DiscoverMode.MIXED) unique.shuffled() else unique
            state.copy(items = state.items + toAppend)
        }
    }

    private fun itemTypeString(item: SwipeItem): String = when (item.itemType) {
        SwipeItemType.EVENT -> "event"
        SwipeItemType.RESTAURANT -> "restaurant"
    }

    companion object {
        private const val PAGE_SIZE = 20
        private const val PREFETCH_THRESHOLD = 4
        private val ISO: DateTimeFormatter = DateTimeFormatter.ISO_LOCAL_DATE_TIME
    }
}
