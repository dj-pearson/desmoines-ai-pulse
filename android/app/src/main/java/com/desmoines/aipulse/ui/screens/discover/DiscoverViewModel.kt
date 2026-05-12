package com.desmoines.aipulse.ui.screens.discover

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.desmoines.aipulse.data.model.DateFilterPreset
import com.desmoines.aipulse.data.model.Event
import com.desmoines.aipulse.data.model.EventCategory
import com.desmoines.aipulse.data.model.Restaurant
import com.desmoines.aipulse.data.model.RestaurantSortOption
import com.desmoines.aipulse.data.remote.EventsQuery
import com.desmoines.aipulse.data.remote.RestaurantsQuery
import com.desmoines.aipulse.data.remote.SwipeInteractionService
import com.desmoines.aipulse.data.repository.EventsRepository
import com.desmoines.aipulse.data.repository.RestaurantsRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import java.time.format.DateTimeFormatter
import javax.inject.Inject

enum class DiscoverMode(val title: String) {
    MIXED("Tonight"),
    EVENTS("Events"),
    RESTAURANTS("Dining");
}

sealed class SwipeItem {
    abstract val id: String
    abstract val rawId: String
    abstract val imageUrl: String?
    abstract val title: String
    abstract val subtitle: String
    abstract val locationText: String
    abstract val typeLabel: String

    data class EventItem(val event: Event) : SwipeItem() {
        override val id: String = "event-${event.id}"
        override val rawId: String = event.id
        override val imageUrl: String? = event.imageUrl
        override val title: String = event.title
        override val subtitle: String = event.parsedDate?.let {
            it.format(DateTimeFormatter.ofPattern("EEE, MMM d"))
        } ?: event.eventCategory.displayName
        override val locationText: String = event.displayLocation
        override val typeLabel: String = event.eventCategory.displayName
    }

    data class RestaurantItem(val restaurant: Restaurant) : SwipeItem() {
        override val id: String = "restaurant-${restaurant.id}"
        override val rawId: String = restaurant.id
        override val imageUrl: String? = restaurant.imageUrl
        override val title: String = restaurant.name
        override val subtitle: String = listOfNotNull(restaurant.cuisine, restaurant.priceRange)
            .joinToString(" · ")
        override val locationText: String = restaurant.displayLocation
        override val typeLabel: String = restaurant.cuisine ?: "Restaurant"
    }
}

data class DiscoverFilterContext(
    val cuisines: List<String> = emptyList(),
    val locations: List<String> = emptyList(),
    val priceRanges: List<String> = emptyList(),
    val minRating: Double = 0.0,
    val openNow: Boolean = false,
    val eventCategory: EventCategory? = null,
    val datePreset: DateFilterPreset? = null,
    val freeOnly: Boolean = false,
) {
    val isEmpty: Boolean
        get() = cuisines.isEmpty() && locations.isEmpty() && priceRanges.isEmpty() &&
            minRating == 0.0 && !openNow &&
            eventCategory == null && datePreset == null && !freeOnly

    fun toSourceContext(): Map<String, List<String>>? {
        val ctx = mutableMapOf<String, List<String>>()
        if (cuisines.isNotEmpty()) ctx["cuisines"] = cuisines
        if (locations.isNotEmpty()) ctx["locations"] = locations
        if (priceRanges.isNotEmpty()) ctx["priceRanges"] = priceRanges
        eventCategory?.let { ctx["category"] = listOf(it.displayName) }
        datePreset?.let { ctx["datePreset"] = listOf(it.name) }
        if (openNow) ctx["openNow"] = listOf("true")
        if (freeOnly) ctx["freeOnly"] = listOf("true")
        if (minRating > 0) ctx["minRating"] = listOf(minRating.toString())
        return ctx.takeIf { it.isNotEmpty() }
    }
}

data class DiscoverState(
    val mode: DiscoverMode = DiscoverMode.MIXED,
    val filter: DiscoverFilterContext = DiscoverFilterContext(),
    val deck: List<SwipeItem> = emptyList(),
    val isLoading: Boolean = false,
    val totalSwipes: Int = 0,
    val likedCount: Int = 0,
)

@HiltViewModel
class DiscoverViewModel @Inject constructor(
    private val eventsRepository: EventsRepository,
    private val restaurantsRepository: RestaurantsRepository,
    private val swipeService: SwipeInteractionService,
) : ViewModel() {

    private val pageSize = 20
    private val prefetchThreshold = 4

    private var eventOffset = 0
    private var restaurantOffset = 0
    private var hasMoreEvents = true
    private var hasMoreRestaurants = true
    private var isPrefetching = false

    private val _state = MutableStateFlow(DiscoverState())
    val state: StateFlow<DiscoverState> = _state.asStateFlow()

    fun initialize(mode: DiscoverMode = DiscoverMode.MIXED, filter: DiscoverFilterContext = DiscoverFilterContext()) {
        if (_state.value.deck.isNotEmpty()) return
        _state.update { it.copy(mode = mode, filter = filter) }
        viewModelScope.launch { reload() }
    }

    fun setMode(mode: DiscoverMode) {
        if (_state.value.mode == mode) return
        _state.update { it.copy(mode = mode) }
        viewModelScope.launch { reload() }
    }

    fun updateFilter(filter: DiscoverFilterContext) {
        if (_state.value.filter == filter) return
        _state.update { it.copy(filter = filter) }
        viewModelScope.launch { reload() }
    }

    suspend fun reload() {
        _state.update { it.copy(isLoading = true, deck = emptyList()) }
        eventOffset = 0
        restaurantOffset = 0
        hasMoreEvents = true
        hasMoreRestaurants = true
        fetchMore()
        _state.update { it.copy(isLoading = false) }
    }

    fun like(item: SwipeItem) {
        advance()
        viewModelScope.launch {
            swipeService.record(
                SwipeInteractionService.Action.LIKE,
                supabaseType(item),
                item.rawId,
                _state.value.filter.toSourceContext(),
            )
            _state.update { it.copy(likedCount = it.likedCount + 1) }
        }
    }

    fun skip(item: SwipeItem) {
        advance()
        viewModelScope.launch {
            swipeService.record(
                SwipeInteractionService.Action.SKIP,
                supabaseType(item),
                item.rawId,
                _state.value.filter.toSourceContext(),
            )
        }
    }

    fun boost(item: SwipeItem) {
        // Re-shape the filter and refetch.
        val boostedFilter = applyBoostFilter(_state.value.filter, item)
        _state.update {
            it.copy(
                deck = emptyList(),
                totalSwipes = it.totalSwipes + 1,
                filter = boostedFilter,
            )
        }
        eventOffset = 0
        restaurantOffset = 0
        hasMoreEvents = true
        hasMoreRestaurants = true
        viewModelScope.launch {
            swipeService.record(
                SwipeInteractionService.Action.BOOST,
                supabaseType(item),
                item.rawId,
                boostedFilter.toSourceContext(),
            )
            fetchMore()
        }
    }

    fun recordDetailTap(item: SwipeItem) {
        viewModelScope.launch {
            swipeService.record(
                SwipeInteractionService.Action.DETAIL,
                supabaseType(item),
                item.rawId,
                _state.value.filter.toSourceContext(),
            )
        }
    }

    private fun advance() {
        _state.update {
            val newDeck = if (it.deck.isNotEmpty()) it.deck.drop(1) else it.deck
            it.copy(deck = newDeck, totalSwipes = it.totalSwipes + 1)
        }
        if (_state.value.deck.size <= prefetchThreshold) {
            viewModelScope.launch { fetchMore() }
        }
    }

    private suspend fun fetchMore() {
        if (isPrefetching) return
        isPrefetching = true
        try {
            when (_state.value.mode) {
                DiscoverMode.EVENTS -> fetchEventBatch()
                DiscoverMode.RESTAURANTS -> fetchRestaurantBatch()
                DiscoverMode.MIXED -> coroutineScope {
                    awaitAll(
                        async { fetchEventBatch() },
                        async { fetchRestaurantBatch() },
                    )
                }
            }
        } finally {
            isPrefetching = false
        }
    }

    private suspend fun fetchEventBatch() {
        if (!hasMoreEvents) return
        val filter = _state.value.filter
        val mode = _state.value.mode

        // For Mixed mode without an explicit preset, narrow to next 7 days
        val effectivePreset = filter.datePreset
            ?: if (mode == DiscoverMode.MIXED) DateFilterPreset.THIS_WEEK else null

        val dateRange = effectivePreset?.dateRange
        val dtFmt = DateTimeFormatter.ISO_LOCAL_DATE_TIME

        val query = EventsQuery(
            category = filter.eventCategory?.displayName,
            cities = filter.locations.takeIf { it.isNotEmpty() },
            freeOnly = filter.freeOnly,
            dateStart = dateRange?.first?.format(dtFmt),
            dateEnd = dateRange?.second?.format(dtFmt),
            limit = pageSize,
            offset = eventOffset,
        )

        eventsRepository.fetchEvents(query)
            .onSuccess { response ->
                val swiped = swipeService.swipedItemKeys.value
                val fresh = response.events
                    .filter { e -> !swiped.contains("event:${e.id}") }
                    .map { SwipeItem.EventItem(it) }
                appendUnique(fresh)
                eventOffset += response.events.size
                hasMoreEvents = response.hasMore
            }
            .onFailure {
                hasMoreEvents = false
            }
    }

    private suspend fun fetchRestaurantBatch() {
        if (!hasMoreRestaurants) return
        val filter = _state.value.filter
        val query = RestaurantsQuery(
            cuisines = filter.cuisines.takeIf { it.isNotEmpty() },
            locations = filter.locations.takeIf { it.isNotEmpty() },
            priceRanges = filter.priceRanges.takeIf { it.isNotEmpty() },
            minRating = filter.minRating.takeIf { it > 0 },
            sortBy = RestaurantSortOption.POPULARITY,
            limit = pageSize,
            offset = restaurantOffset,
        )
        restaurantsRepository.fetchRestaurants(query)
            .onSuccess { response ->
                val swiped = swipeService.swipedItemKeys.value
                val filtered = if (filter.openNow) {
                    response.restaurants.filter { it.isOpenNow() == true }
                } else response.restaurants
                val mapped = filtered
                    .filter { r -> !swiped.contains("restaurant:${r.id}") }
                    .map { SwipeItem.RestaurantItem(it) }
                appendUnique(mapped)
                restaurantOffset += response.restaurants.size
                hasMoreRestaurants = response.hasMore
            }
            .onFailure {
                hasMoreRestaurants = false
            }
    }

    private fun appendUnique(items: List<SwipeItem>) {
        _state.update { current ->
            val existing = current.deck.map { it.id }.toSet()
            val unique = items.filter { it.id !in existing }
            val toAdd = if (current.mode == DiscoverMode.MIXED) unique.shuffled() else unique
            current.copy(deck = current.deck + toAdd)
        }
    }

    private fun applyBoostFilter(current: DiscoverFilterContext, item: SwipeItem): DiscoverFilterContext =
        when (item) {
            is SwipeItem.EventItem -> current.copy(eventCategory = item.event.eventCategory)
            is SwipeItem.RestaurantItem -> {
                val c = item.restaurant.cuisine?.takeIf { it.isNotBlank() }
                if (c != null) current.copy(cuisines = listOf(c)) else current
            }
        }

    private fun supabaseType(item: SwipeItem): SwipeInteractionService.ItemType = when (item) {
        is SwipeItem.EventItem -> SwipeInteractionService.ItemType.EVENT
        is SwipeItem.RestaurantItem -> SwipeInteractionService.ItemType.RESTAURANT
    }
}
