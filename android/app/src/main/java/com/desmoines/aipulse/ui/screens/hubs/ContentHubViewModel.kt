package com.desmoines.aipulse.ui.screens.hubs

import androidx.compose.runtime.Immutable
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.desmoines.aipulse.data.model.Attraction
import com.desmoines.aipulse.data.model.ContentHub
import com.desmoines.aipulse.data.model.Event
import com.desmoines.aipulse.data.model.Restaurant
import com.desmoines.aipulse.data.remote.AttractionsQuery
import com.desmoines.aipulse.data.remote.EventsQuery
import com.desmoines.aipulse.data.remote.RestaurantsQuery
import com.desmoines.aipulse.data.repository.AttractionsRepository
import com.desmoines.aipulse.data.repository.EventsRepository
import com.desmoines.aipulse.data.repository.RestaurantsRepository
import com.desmoines.aipulse.util.NetworkMonitor
import com.desmoines.aipulse.util.QueryCache
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.serialization.builtins.ListSerializer
import javax.inject.Inject

@Immutable
data class ContentHubUiState(
    val hub: ContentHub? = null,
    val events: List<Event> = emptyList(),
    val attractions: List<Attraction> = emptyList(),
    val dining: List<Restaurant> = emptyList(),
    val isLoading: Boolean = true,
    /** Inline retry banner when the events spine is blank after a failure. */
    val errorMessage: String? = null,
) {
    val isEmpty: Boolean
        get() = events.isEmpty() && attractions.isEmpty() && dining.isEmpty() &&
            !isLoading && errorMessage == null
}

/**
 * Loads a Music/Sports/Outdoors content hub (ANDP-027): an events spine
 * (critical path, cached for offline cold-start) plus fail-soft attractions
 * and featured-dining rails. Mirrors iOS ContentHubViewModel.
 */
@HiltViewModel
class ContentHubViewModel @Inject constructor(
    private val eventsRepository: EventsRepository,
    private val restaurantsRepository: RestaurantsRepository,
    private val attractionsRepository: AttractionsRepository,
    private val queryCache: QueryCache,
    private val networkMonitor: NetworkMonitor,
) : ViewModel() {

    private val _uiState = MutableStateFlow(ContentHubUiState())
    val uiState: StateFlow<ContentHubUiState> = _uiState.asStateFlow()

    private var hub: ContentHub? = null

    fun load(hubId: String) {
        val resolved = ContentHub.byId(hubId)
        hub = resolved
        _uiState.update { it.copy(hub = resolved, isLoading = true, errorMessage = null) }
        if (resolved == null) {
            _uiState.update { it.copy(isLoading = false) }
            return
        }
        viewModelScope.launch {
            val connected = networkMonitor.isConnected.value
            val cacheKey = "hub-events-${resolved.id}"

            val (rawEvents, attractions, dining) = coroutineScope {
                val e = async { eventsRepository.fetchEvents(EventsQuery(limit = 80)).getOrNull()?.events }
                val a = async {
                    attractionsRepository.fetchAttractions(AttractionsQuery(limit = 60))
                        .getOrNull()?.attractions.orEmpty()
                }
                val d = async {
                    restaurantsRepository.fetchRestaurants(RestaurantsQuery(isFeatured = true, limit = 10))
                        .getOrNull()?.restaurants.orEmpty()
                }
                Triple(e.await(), a.await(), d.await())
            }

            // Events spine: filter to the hub, cache the spine, fall back to cache offline.
            val events: List<Event> = if (rawEvents != null) {
                val spine = rawEvents.filter { resolved.matchesEvent(it) }.take(20)
                queryCache.set(cacheKey, spine, EVENTS_SERIALIZER)
                spine
            } else {
                queryCache.get(cacheKey, EVENTS_SERIALIZER, allowStale = !connected).orEmpty()
            }

            _uiState.update {
                it.copy(
                    events = events,
                    attractions = attractions.filter { a -> resolved.matchesAttraction(a) }.take(12),
                    dining = dining,
                    isLoading = false,
                    errorMessage = if (events.isEmpty() && rawEvents == null) {
                        "Couldn't load this hub. Tap to retry."
                    } else null,
                )
            }
        }
    }

    fun retry() {
        hub?.let { load(it.id) }
    }

    companion object {
        private val EVENTS_SERIALIZER = ListSerializer(Event.serializer())
    }
}
