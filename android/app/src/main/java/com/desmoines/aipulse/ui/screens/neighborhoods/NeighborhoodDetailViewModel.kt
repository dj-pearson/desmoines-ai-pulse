package com.desmoines.aipulse.ui.screens.neighborhoods

import androidx.compose.runtime.Immutable
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.desmoines.aipulse.data.model.Attraction
import com.desmoines.aipulse.data.model.Event
import com.desmoines.aipulse.data.model.Neighborhood
import com.desmoines.aipulse.data.model.Restaurant
import com.desmoines.aipulse.data.remote.AttractionsQuery
import com.desmoines.aipulse.data.remote.EventsQuery
import com.desmoines.aipulse.data.remote.RestaurantsQuery
import com.desmoines.aipulse.data.repository.AttractionsRepository
import com.desmoines.aipulse.data.repository.EventsRepository
import com.desmoines.aipulse.data.repository.RestaurantsRepository
import com.desmoines.aipulse.util.LocationService
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.withTimeoutOrNull
import javax.inject.Inject
import kotlin.math.atan2
import kotlin.math.cos
import kotlin.math.sin
import kotlin.math.sqrt

@Immutable
data class NeighborhoodDetailUiState(
    val neighborhood: Neighborhood? = null,
    val restaurants: List<Restaurant> = emptyList(),
    val attractions: List<Attraction> = emptyList(),
    val events: List<Event> = emptyList(),
    val isLoading: Boolean = true,
    val isSorting: Boolean = false,
    val sortedByDistance: Boolean = false,
) {
    val isEmpty: Boolean
        get() = restaurants.isEmpty() && attractions.isEmpty() && events.isEmpty() && !isLoading
}

/**
 * Neighborhood detail (ANDP-026): fetches dining/attractions/events in parallel,
 * filters client-side to the area by name match, and optionally sorts nearest-
 * first from the device location (≤8s wait). Mirrors iOS NeighborhoodDetailView.
 */
@HiltViewModel
class NeighborhoodDetailViewModel @Inject constructor(
    private val eventsRepository: EventsRepository,
    private val restaurantsRepository: RestaurantsRepository,
    private val attractionsRepository: AttractionsRepository,
    private val locationService: LocationService,
) : ViewModel() {

    private val _uiState = MutableStateFlow(NeighborhoodDetailUiState())
    val uiState: StateFlow<NeighborhoodDetailUiState> = _uiState.asStateFlow()

    fun load(slug: String) {
        val neighborhood = Neighborhood.bySlug(slug)
        _uiState.update { it.copy(neighborhood = neighborhood, isLoading = true, sortedByDistance = false) }
        if (neighborhood == null) {
            _uiState.update { it.copy(isLoading = false) }
            return
        }
        viewModelScope.launch {
            val (restaurants, attractions, events) = coroutineScope {
                val r = async {
                    restaurantsRepository.fetchRestaurants(RestaurantsQuery(limit = 60))
                        .getOrNull()?.restaurants.orEmpty()
                }
                val a = async {
                    attractionsRepository.fetchAttractions(AttractionsQuery(limit = 60))
                        .getOrNull()?.attractions.orEmpty()
                }
                val e = async {
                    eventsRepository.fetchEvents(EventsQuery(limit = 60))
                        .getOrNull()?.events.orEmpty()
                }
                Triple(r.await(), a.await(), e.await())
            }
            _uiState.update {
                it.copy(
                    restaurants = restaurants.filter { r -> neighborhood.matches(r.city) || neighborhood.matches(r.location) },
                    attractions = attractions.filter { a -> neighborhood.matches(a.location) },
                    events = events.filter { ev ->
                        neighborhood.matches(ev.displayLocation) || neighborhood.matches(ev.city) || neighborhood.matches(ev.venue)
                    },
                    isLoading = false,
                )
            }
        }
    }

    /** Sort listings nearest-first using the device location; keeps order on failure. */
    fun sortByNearby() {
        if (_uiState.value.sortedByDistance || _uiState.value.isSorting) return
        _uiState.update { it.copy(isSorting = true) }
        viewModelScope.launch {
            val location = withTimeoutOrNull(LOCATION_TIMEOUT_MS) {
                runCatching { locationService.getCurrentLocation() }.getOrNull()
            }
            if (location == null) {
                _uiState.update { it.copy(isSorting = false) }
                return@launch
            }
            val lat = location.latitude
            val lon = location.longitude
            _uiState.update { state ->
                state.copy(
                    restaurants = state.restaurants.sortedBy { distanceOrMax(lat, lon, it.latitude, it.longitude) },
                    attractions = state.attractions.sortedBy { distanceOrMax(lat, lon, it.latitude, it.longitude) },
                    events = state.events.sortedBy { distanceOrMax(lat, lon, it.latitude, it.longitude) },
                    isSorting = false,
                    sortedByDistance = true,
                )
            }
        }
    }

    private fun distanceOrMax(lat: Double, lon: Double, itemLat: Double?, itemLon: Double?): Double =
        if (itemLat != null && itemLon != null) haversineMeters(lat, lon, itemLat, itemLon) else Double.MAX_VALUE

    companion object {
        private const val LOCATION_TIMEOUT_MS = 8_000L

        /** Great-circle distance in meters between two coordinates. Pure — testable. */
        fun haversineMeters(lat1: Double, lon1: Double, lat2: Double, lon2: Double): Double {
            val r = 6_371_000.0
            val dLat = Math.toRadians(lat2 - lat1)
            val dLon = Math.toRadians(lon2 - lon1)
            val a = sin(dLat / 2) * sin(dLat / 2) +
                cos(Math.toRadians(lat1)) * cos(Math.toRadians(lat2)) *
                sin(dLon / 2) * sin(dLon / 2)
            return r * 2 * atan2(sqrt(a), sqrt(1 - a))
        }
    }
}
