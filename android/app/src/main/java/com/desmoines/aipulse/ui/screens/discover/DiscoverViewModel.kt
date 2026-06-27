package com.desmoines.aipulse.ui.screens.discover

import androidx.compose.runtime.Immutable
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.desmoines.aipulse.data.model.SwipeItem
import com.desmoines.aipulse.data.remote.EventsQuery
import com.desmoines.aipulse.data.remote.RestaurantsQuery
import com.desmoines.aipulse.data.repository.EventsRepository
import com.desmoines.aipulse.data.repository.RestaurantsRepository
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
) {
    val isEmpty: Boolean get() = items.isEmpty() && !isLoading && errorMessage == null
}

/**
 * Feeds the Discover swipe deck (ANDP-020). Loads a mixed event + restaurant
 * deck and advances it on each commit. Swipe persistence (like/skip/boost
 * signals) and the mode toggle land in later stories (ANDP-021/022) — here the
 * commits just pop the top card so the gesture/stack mechanics are exercised.
 */
@HiltViewModel
class DiscoverViewModel @Inject constructor(
    private val eventsRepository: EventsRepository,
    private val restaurantsRepository: RestaurantsRepository,
) : ViewModel() {

    private val _uiState = MutableStateFlow(DiscoverUiState())
    val uiState: StateFlow<DiscoverUiState> = _uiState.asStateFlow()

    init {
        load()
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
            val deck = interleave(events, restaurants)

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

    fun onLike(item: SwipeItem) = advancePast(item)
    fun onSkip(item: SwipeItem) = advancePast(item)
    fun onBoost(item: SwipeItem) = advancePast(item)

    /** Remove the committed card from the top of the deck. */
    private fun advancePast(item: SwipeItem) {
        _uiState.update { state -> state.copy(items = state.items.filterNot { it.id == item.id }) }
    }

    fun clearError() = _uiState.update { it.copy(errorMessage = null) }

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
