package com.desmoines.aipulse.ui.screens.map

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.util.Log
import androidx.core.content.ContextCompat
import com.desmoines.aipulse.data.model.Attraction
import com.desmoines.aipulse.data.model.Event
import com.desmoines.aipulse.data.model.Restaurant
import com.desmoines.aipulse.data.repository.AttractionsRepository
import com.desmoines.aipulse.data.repository.EventsRepository
import com.desmoines.aipulse.data.repository.RestaurantsRepository
import com.desmoines.aipulse.util.Config
import com.google.android.gms.location.FusedLocationProviderClient
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.Priority
import com.google.android.gms.maps.model.CameraPosition
import com.google.android.gms.maps.model.LatLng
import com.google.android.gms.tasks.CancellationTokenSource
import dagger.hilt.android.lifecycle.HiltViewModel
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import kotlinx.coroutines.suspendCancellableCoroutine
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import java.time.LocalDate
import java.time.OffsetDateTime
import java.time.temporal.ChronoUnit
import javax.inject.Inject
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException

private const val TAG = "MapViewModel"

/**
 * Map screen state holder.
 * Mirrors iOS MapViewModel.swift.
 */
data class MapScreenState(
    val events: List<Event> = emptyList(),
    val restaurants: List<Restaurant> = emptyList(),
    val attractions: List<Attraction> = emptyList(),
    val showEvents: Boolean = true,
    val showRestaurants: Boolean = true,
    val showAttractions: Boolean = true,
    val selectedEvent: Event? = null,
    val selectedRestaurant: Restaurant? = null,
    val selectedAttraction: Attraction? = null,
    val searchText: String = "",
    val isLoading: Boolean = false,
    val errorMessage: String? = null,
    val hasLoadedOnce: Boolean = false,
    val cameraPosition: CameraPosition = CameraPosition.fromLatLngZoom(
        LatLng(Config.DEFAULT_LATITUDE, Config.DEFAULT_LONGITUDE), 12f
    ),
) {
    /** Event annotations filtered by showEvents toggle and valid coordinates. */
    val eventAnnotations: List<EventAnnotation>
        get() = if (!showEvents) emptyList() else events.mapNotNull { event ->
            event.coordinate?.let { coord ->
                EventAnnotation(
                    event = event,
                    position = LatLng(coord.latitude, coord.longitude)
                )
            }
        }

    /** Restaurant annotations filtered by showRestaurants toggle and valid coordinates. */
    val restaurantAnnotations: List<RestaurantAnnotation>
        get() = if (!showRestaurants) emptyList() else restaurants.mapNotNull { restaurant ->
            restaurant.coordinate?.let { coord ->
                RestaurantAnnotation(
                    restaurant = restaurant,
                    position = LatLng(coord.latitude, coord.longitude)
                )
            }
        }

    /** Attraction annotations filtered by showAttractions toggle and valid coordinates. */
    val attractionAnnotations: List<AttractionAnnotation>
        get() = if (!showAttractions) emptyList() else attractions.mapNotNull { attraction ->
            attraction.coordinate?.let { coord ->
                AttractionAnnotation(
                    attraction = attraction,
                    position = LatLng(coord.latitude, coord.longitude)
                )
            }
        }

    val totalPinCount: Int
        get() = eventAnnotations.size + restaurantAnnotations.size + attractionAnnotations.size

    val isEmpty: Boolean
        get() = hasLoadedOnce && !isLoading && totalPinCount == 0
}

// region Annotation Models

data class EventAnnotation(
    val event: Event,
    val position: LatLng,
) {
    val id: String get() = event.id

    /** Pin tint color: red=today, orange=≤7 days, blue=future. Matches iOS. */
    val urgencyColor: PinColor
        get() {
            val date = event.parsedDate ?: return PinColor.BLUE
            val now = OffsetDateTime.now()
            val today = now.toLocalDate()
            val eventDate = date.toLocalDate()
            if (eventDate == today) return PinColor.RED
            val daysUntil = ChronoUnit.DAYS.between(today, eventDate)
            if (daysUntil in 1..7) return PinColor.ORANGE
            return PinColor.BLUE
        }
}

data class RestaurantAnnotation(
    val restaurant: Restaurant,
    val position: LatLng,
) {
    val id: String get() = restaurant.id
}

data class AttractionAnnotation(
    val attraction: Attraction,
    val position: LatLng,
) {
    val id: String get() = attraction.id
}

enum class PinColor { RED, ORANGE, BLUE }

// endregion

@HiltViewModel
class MapViewModel @Inject constructor(
    @param:ApplicationContext private val appContext: Context,
    private val eventsRepository: EventsRepository,
    private val restaurantsRepository: RestaurantsRepository,
    private val attractionsRepository: AttractionsRepository,
) : ViewModel() {

    // Data
    private val _events = MutableStateFlow<List<Event>>(emptyList())
    private val _restaurants = MutableStateFlow<List<Restaurant>>(emptyList())
    private val _attractions = MutableStateFlow<List<Attraction>>(emptyList())

    // Toggles
    private val _showEvents = MutableStateFlow(true)
    private val _showRestaurants = MutableStateFlow(true)
    private val _showAttractions = MutableStateFlow(true)

    // Selection
    private val _selectedEvent = MutableStateFlow<Event?>(null)
    private val _selectedRestaurant = MutableStateFlow<Restaurant?>(null)
    private val _selectedAttraction = MutableStateFlow<Attraction?>(null)

    // Search
    private val _searchText = MutableStateFlow("")

    // State
    private val _isLoading = MutableStateFlow(false)
    private val _errorMessage = MutableStateFlow<String?>(null)
    private val _hasLoadedOnce = MutableStateFlow(false)
    private val _cameraPosition = MutableStateFlow(
        CameraPosition.fromLatLngZoom(
            LatLng(Config.DEFAULT_LATITUDE, Config.DEFAULT_LONGITUDE), 12f
        )
    )

    private var currentLatitude = Config.DEFAULT_LATITUDE
    private var currentLongitude = Config.DEFAULT_LONGITUDE

    private val fusedLocationClient: FusedLocationProviderClient =
        LocationServices.getFusedLocationProviderClient(appContext)

    val uiState: StateFlow<MapScreenState> = combine(
        combine(_events, _restaurants, _attractions, _showEvents, _showRestaurants) { events, restaurants, attractions, showE, showR ->
            MapScreenState(
                events = events,
                restaurants = restaurants,
                attractions = attractions,
                showEvents = showE,
                showRestaurants = showR,
            )
        },
        combine(_showAttractions, _selectedEvent, _selectedRestaurant, _selectedAttraction, _searchText) { showA, selE, selR, selA, search ->
            MapScreenState(
                showAttractions = showA,
                selectedEvent = selE,
                selectedRestaurant = selR,
                selectedAttraction = selA,
                searchText = search,
            )
        },
        combine(_isLoading, _errorMessage, _hasLoadedOnce, _cameraPosition) { loading, error, loaded, cam ->
            MapScreenState(
                isLoading = loading,
                errorMessage = error,
                hasLoadedOnce = loaded,
                cameraPosition = cam,
            )
        }
    ) { dataState, selectionState, uiStateChunk ->
        MapScreenState(
            events = dataState.events,
            restaurants = dataState.restaurants,
            attractions = dataState.attractions,
            showEvents = dataState.showEvents,
            showRestaurants = dataState.showRestaurants,
            showAttractions = selectionState.showAttractions,
            selectedEvent = selectionState.selectedEvent,
            selectedRestaurant = selectionState.selectedRestaurant,
            selectedAttraction = selectionState.selectedAttraction,
            searchText = selectionState.searchText,
            isLoading = uiStateChunk.isLoading,
            errorMessage = uiStateChunk.errorMessage,
            hasLoadedOnce = uiStateChunk.hasLoadedOnce,
            cameraPosition = uiStateChunk.cameraPosition,
        )
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), MapScreenState())

    // region Public API

    fun loadNearbyContent() {
        viewModelScope.launch {
            _isLoading.value = true
            _errorMessage.value = null

            try {
                val location = getCurrentLocation()
                currentLatitude = location.latitude
                currentLongitude = location.longitude
                _cameraPosition.value = CameraPosition.fromLatLngZoom(location, 13f)
            } catch (e: Exception) {
                Log.d(TAG, "Location unavailable, using Des Moines default: ${e.message}")
                currentLatitude = Config.DEFAULT_LATITUDE
                currentLongitude = Config.DEFAULT_LONGITUDE
            }

            fetchAllContent()
            _isLoading.value = false
            _hasLoadedOnce.value = true
        }
    }

    fun search() {
        val query = _searchText.value.trim()
        if (query.isEmpty()) {
            // Clear search — reload nearby content
            viewModelScope.launch {
                _isLoading.value = true
                _errorMessage.value = null
                clearSelection()
                fetchAllContent()
                _isLoading.value = false
            }
            return
        }

        viewModelScope.launch {
            _isLoading.value = true
            _errorMessage.value = null
            clearSelection()

            // Search events by text (fuzzy)
            val searchedEvents = eventsRepository.fuzzySearchEvents(query)
                .getOrDefault(emptyList())

            // Search restaurants by text (fuzzy)
            val searchedRestaurants = restaurantsRepository.fuzzySearchRestaurants(query)
                .getOrDefault(emptyList())

            // Search attractions by text (ILIKE — no fuzzy RPC for attractions)
            val searchedAttractions = attractionsRepository.fetchAttractions(
                com.desmoines.aipulse.data.remote.AttractionsQuery(searchText = query, limit = 50)
            ).getOrNull()?.attractions ?: emptyList()

            _events.value = searchedEvents
            _restaurants.value = searchedRestaurants
            _attractions.value = searchedAttractions

            // Fit map to results with 30% padding
            val allCoords = buildList {
                searchedEvents.mapNotNull { it.coordinate }.forEach { add(LatLng(it.latitude, it.longitude)) }
                searchedRestaurants.mapNotNull { it.coordinate }.forEach { add(LatLng(it.latitude, it.longitude)) }
                searchedAttractions.mapNotNull { it.coordinate }.forEach { add(LatLng(it.latitude, it.longitude)) }
            }
            regionFitting(allCoords)?.let { _cameraPosition.value = it }

            if (searchedEvents.isEmpty() && searchedRestaurants.isEmpty() && searchedAttractions.isEmpty()) {
                _errorMessage.value = "No results found for \"$query\""
            }

            _isLoading.value = false
        }
    }

    fun retry() {
        loadNearbyContent()
    }

    fun setSearchText(text: String) {
        _searchText.value = text
    }

    fun toggleShowEvents() {
        _showEvents.value = !_showEvents.value
    }

    fun toggleShowRestaurants() {
        _showRestaurants.value = !_showRestaurants.value
    }

    fun toggleShowAttractions() {
        _showAttractions.value = !_showAttractions.value
    }

    fun selectEvent(event: Event) {
        clearSelection()
        _selectedEvent.value = event
    }

    fun selectRestaurant(restaurant: Restaurant) {
        clearSelection()
        _selectedRestaurant.value = restaurant
    }

    fun selectAttraction(attraction: Attraction) {
        clearSelection()
        _selectedAttraction.value = attraction
    }

    fun clearSelection() {
        _selectedEvent.value = null
        _selectedRestaurant.value = null
        _selectedAttraction.value = null
    }

    // endregion

    // region Private helpers

    /**
     * Fetch all content types independently — if one fails, others still load.
     * Matches iOS MapViewModel.fetchAllContent().
     */
    private suspend fun fetchAllContent() {
        val lat = currentLatitude
        val lng = currentLongitude

        val fetchedEvents = eventsRepository.fetchNearbyEvents(lat, lng)
            .getOrDefault(emptyList())

        val fetchedRestaurants = restaurantsRepository.fetchNearbyRestaurants(lat, lng)
            .getOrDefault(emptyList())

        val fetchedAttractions = attractionsRepository.fetchNearbyAttractions(lat, lng)
            .getOrDefault(emptyList())

        _events.value = fetchedEvents
        _restaurants.value = fetchedRestaurants
        _attractions.value = fetchedAttractions

        // Surface attractions (and events/restaurants) to on-device system search (ANDP-070).

        if (fetchedEvents.isEmpty() && fetchedRestaurants.isEmpty() && fetchedAttractions.isEmpty()) {
            _errorMessage.value = "No places found in this area. Try expanding your search."
        } else {
            _errorMessage.value = null
        }
    }

    /**
     * Get current device location using FusedLocationProviderClient.
     * Falls back to default if permission not granted.
     */
    private suspend fun getCurrentLocation(): LatLng {
        val hasPermission = ContextCompat.checkSelfPermission(
            appContext, Manifest.permission.ACCESS_FINE_LOCATION
        ) == PackageManager.PERMISSION_GRANTED || ContextCompat.checkSelfPermission(
            appContext, Manifest.permission.ACCESS_COARSE_LOCATION
        ) == PackageManager.PERMISSION_GRANTED

        if (!hasPermission) {
            throw SecurityException("Location permission not granted")
        }

        return suspendCancellableCoroutine { continuation ->
            val cancellationTokenSource = CancellationTokenSource()
            continuation.invokeOnCancellation { cancellationTokenSource.cancel() }

            fusedLocationClient.getCurrentLocation(
                Priority.PRIORITY_BALANCED_POWER_ACCURACY,
                cancellationTokenSource.token
            ).addOnSuccessListener { location ->
                if (location != null) {
                    continuation.resume(LatLng(location.latitude, location.longitude))
                } else {
                    continuation.resumeWithException(Exception("Location is null"))
                }
            }.addOnFailureListener { exception ->
                continuation.resumeWithException(exception)
            }
        }
    }

    /**
     * Calculate camera position that fits all coordinates with 30% padding.
     * Matches iOS MapViewModel.regionFitting().
     */
    private fun regionFitting(coordinates: List<LatLng>): CameraPosition? {
        if (coordinates.isEmpty()) return null

        var minLat = coordinates[0].latitude
        var maxLat = coordinates[0].latitude
        var minLng = coordinates[0].longitude
        var maxLng = coordinates[0].longitude

        for (coord in coordinates) {
            minLat = minOf(minLat, coord.latitude)
            maxLat = maxOf(maxLat, coord.latitude)
            minLng = minOf(minLng, coord.longitude)
            maxLng = maxOf(maxLng, coord.longitude)
        }

        val centerLat = (minLat + maxLat) / 2
        val centerLng = (minLng + maxLng) / 2
        val latSpan = maxOf((maxLat - minLat) * 1.3, 0.02)
        val lngSpan = maxOf((maxLng - minLng) * 1.3, 0.02)

        // Approximate zoom from span (rough heuristic — Google Maps doesn't use spans directly)
        val maxSpan = maxOf(latSpan, lngSpan)
        val zoom = when {
            maxSpan > 1.0 -> 9f
            maxSpan > 0.5 -> 10f
            maxSpan > 0.2 -> 11f
            maxSpan > 0.1 -> 12f
            maxSpan > 0.05 -> 13f
            else -> 14f
        }

        return CameraPosition.fromLatLngZoom(LatLng(centerLat, centerLng), zoom)
    }

    // endregion
}
