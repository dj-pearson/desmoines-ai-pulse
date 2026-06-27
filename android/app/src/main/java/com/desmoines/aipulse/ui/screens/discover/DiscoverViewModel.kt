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
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

@Immutable
data class DiscoverUiState(
    val items: List<SwipeItem> = emptyList(),
    val isLoading: Boolean = true,
    val errorMessage: String? = null,
    /** Number of items saved (liked) this session — drives the saved-count badge. */
    val savedCount: Int = 0,
) {
    val isEmpty: Boolean get() = items.isEmpty() && !isLoading && errorMessage == null
}

/**
 * Feeds the Discover swipe deck (ANDP-020) and persists swipe signals (ANDP-022).
 * Likes/skips/boosts/detail-taps are recorded to `swipe_interactions` (fire-and-
 * forget), already-swiped items are filtered out, and a like also saves to
 * favorites — soft-failing to the paywall at the free cap. Mirrors iOS Discover.
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

    private var favoriteEventIds: Set<String> = emptySet()
    private var favoriteRestaurantIds: Set<String> = emptySet()

    init {
        loadFavorites()
        load()
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

    fun load() {
        _uiState.update { it.copy(isLoading = true, errorMessage = null) }
        viewModelScope.launch {
            val eventsDeferred = async {
                eventsRepository.fetchEvents(EventsQuery(limit = 30)).getOrNull()?.events.orEmpty()
            }
            val restaurantsDeferred = async {
                restaurantsRepository.fetchRestaurants(RestaurantsQuery(limit = 30)).getOrNull()?.restaurants.orEmpty()
            }
            val events = eventsDeferred.await().map(SwipeItem::from)
            val restaurants = restaurantsDeferred.await().map(SwipeItem::from)
            // Skip anything the user already swiped on (dedupe).
            val swiped = swipeInteractionService.swipedKeys.value
            val deck = interleave(events, restaurants).filterNot { swiped.contains(swipeKey(it)) }

            _uiState.update {
                if (deck.isEmpty()) {
                    it.copy(
                        isLoading = false,
                        errorMessage = "Couldn't load the discovery deck. Try again.",
                    )
                } else {
                    it.copy(items = deck, isLoading = false, errorMessage = null)
                }
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

    fun onBoost(item: SwipeItem) {
        record(SwipeInteractionService.Action.BOOST, item)
        advancePast(item)
    }

    /** Detail tap records a weak-positive signal; navigation is handled by the caller. */
    fun onDetail(item: SwipeItem) {
        record(SwipeInteractionService.Action.DETAIL, item)
    }

    fun clearError() = _uiState.update { it.copy(errorMessage = null) }

    private fun record(action: SwipeInteractionService.Action, item: SwipeItem) {
        viewModelScope.launch {
            swipeInteractionService.record(action, itemTypeString(item), item.rawId)
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

    /** Remove the committed card from the top of the deck. */
    private fun advancePast(item: SwipeItem) {
        _uiState.update { state -> state.copy(items = state.items.filterNot { it.id == item.id }) }
    }

    private fun itemTypeString(item: SwipeItem): String = when (item.itemType) {
        SwipeItemType.EVENT -> "event"
        SwipeItemType.RESTAURANT -> "restaurant"
    }

    private fun swipeKey(item: SwipeItem): String = "${itemTypeString(item)}:${item.rawId}"

    /** Alternate events and restaurants so the deck mixes content types. */
    private fun interleave(a: List<SwipeItem>, b: List<SwipeItem>): List<SwipeItem> {
        val result = ArrayList<SwipeItem>(a.size + b.size)
        val max = maxOf(a.size, b.size)
        for (i in 0 until max) {
            if (i < a.size) result.add(a[i])
            if (i < b.size) result.add(b[i])
        }
        return result
    }
}
