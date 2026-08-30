package com.desmoines.aipulse.ui.screens.favorites

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.desmoines.aipulse.data.model.Event
import com.desmoines.aipulse.data.model.Restaurant
import com.desmoines.aipulse.data.model.SubscriptionTier
import com.desmoines.aipulse.data.repository.FavoritesRepository
import com.desmoines.aipulse.data.repository.AuthRepository
import com.desmoines.aipulse.data.remote.BillingService
import com.desmoines.aipulse.util.FetchGeneration
import com.desmoines.aipulse.util.NetworkMonitor
import com.desmoines.aipulse.util.RECONNECT_DEBOUNCE_MS
import com.desmoines.aipulse.util.onReconnect
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import java.time.OffsetDateTime
import javax.inject.Inject

private const val TAG = "FavoritesViewModel"

/**
 * ViewModel for the Favorites/Saved screen.
 * Mirrors iOS FavoritesViewModel.swift — supports events (upcoming + past) and restaurants.
 */
@HiltViewModel
class FavoritesViewModel @Inject constructor(
    private val favoritesRepository: FavoritesRepository,
    private val authRepository: AuthRepository,
    private val networkMonitor: NetworkMonitor,
    private val billingService: BillingService,
) : ViewModel() {

    private val _upcomingEvents = MutableStateFlow<List<Event>>(emptyList())
    private val _pastEvents = MutableStateFlow<List<Event>>(emptyList())
    private val _favoriteRestaurants = MutableStateFlow<List<Restaurant>>(emptyList())
    private val _favoriteEventIds = MutableStateFlow<Set<String>>(emptySet())
    private val _favoriteRestaurantIds = MutableStateFlow<Set<String>>(emptySet())
    private val _isLoading = MutableStateFlow(false)
    private val _isRefreshing = MutableStateFlow(false)
    private val _errorMessage = MutableStateFlow<String?>(null)
    private val _isAuthenticated = MutableStateFlow(false)
    private val _currentTier = MutableStateFlow(SubscriptionTier.FREE)

    val uiState: StateFlow<FavoritesScreenState> = combine(
        _upcomingEvents,
        _pastEvents,
        _favoriteRestaurants,
        _isLoading,
        _isRefreshing,
    ) { upcoming, past, restaurants, loading, refreshing ->
        FavoritesScreenState(
            upcomingEvents = upcoming,
            pastEvents = past,
            favoriteRestaurants = restaurants,
            isLoading = loading,
            isRefreshing = refreshing,
        )
    }.combine(
        combine(
            _errorMessage,
            _isAuthenticated,
            _favoriteEventIds,
            _favoriteRestaurantIds,
            _currentTier,
        ) { error, authed, eventIds, restaurantIds, tier ->
            FavoritesStateExtra(error, authed, eventIds, restaurantIds, tier)
        }
    ) { state, extra ->
        state.copy(
            errorMessage = extra.errorMessage,
            isAuthenticated = extra.isAuthenticated,
            favoriteEventIds = extra.favoriteEventIds,
            favoriteRestaurantIds = extra.favoriteRestaurantIds,
            currentTier = extra.currentTier,
        )
    }.stateIn(
        viewModelScope,
        SharingStarted.WhileSubscribed(5_000),
        FavoritesScreenState(),
    )

    private var hasLoadedInitialData = false

    // Stale-result guard: a refresh supersedes any in-flight favorites load (ANDP-061).
    private val favoritesFetch = FetchGeneration()

    init {
        // Mirror the live entitlement so premium surfaces reflect what the user
        // actually paid for. This was a MutableStateFlow pinned to FREE, so
        // paying subscribers saw the free-tier UI everywhere it was read.
        viewModelScope.launch {
            billingService.currentTier.collect { _currentTier.value = it }
        }

        // Auto-refetch favorites when connectivity returns (ANDP-069).
        viewModelScope.launch {
            networkMonitor.isConnected.onReconnect().collect {
                delay(RECONNECT_DEBOUNCE_MS)
                if (hasLoadedInitialData && networkMonitor.isConnected.value) refresh()
            }
        }
    }

    fun loadFavorites() {
        if (hasLoadedInitialData) return
        hasLoadedInitialData = true
        loadFavoritesInternal()
    }

    fun refresh() {
        _isRefreshing.value = true
        loadFavoritesInternal()
    }

    private fun loadFavoritesInternal() {
        val userId = getCurrentUserId()
        _isAuthenticated.value = userId != null

        if (userId == null) {
            _upcomingEvents.value = emptyList()
            _pastEvents.value = emptyList()
            _favoriteRestaurants.value = emptyList()
            _favoriteEventIds.value = emptySet()
            _favoriteRestaurantIds.value = emptySet()
            _isLoading.value = false
            _isRefreshing.value = false
            return
        }

        // A concurrent refresh supersedes this load so a slow response can't clobber it.
        val token = favoritesFetch.bump()

        viewModelScope.launch {
            _isLoading.value = true
            _errorMessage.value = null

            // Load favorite IDs
            favoritesRepository.loadFavorites(userId).onSuccess { state ->
                if (!favoritesFetch.isCurrent(token)) return@launch
                _favoriteEventIds.value = state.favoriteEventIds
                _favoriteRestaurantIds.value = state.favoriteRestaurantIds
            }.onFailure {
                if (!favoritesFetch.isCurrent(token)) return@launch
                _errorMessage.value = it.message
            }

            // Fetch full event objects and split into upcoming/past
            favoritesRepository.fetchFavoriteEvents(_favoriteEventIds.value).onSuccess { allEvents ->
                if (!favoritesFetch.isCurrent(token)) return@launch
                val now = OffsetDateTime.now()
                _upcomingEvents.value = allEvents.filter { event ->
                    val date = event.parsedDate ?: return@filter true
                    !date.isBefore(now)
                }
                _pastEvents.value = allEvents.filter { event ->
                    val date = event.parsedDate ?: return@filter false
                    date.isBefore(now)
                }
            }.onFailure {
                if (!favoritesFetch.isCurrent(token)) return@launch
                _errorMessage.value = it.message
            }

            // Fetch full restaurant objects
            favoritesRepository.fetchFavoriteRestaurants(_favoriteRestaurantIds.value).onSuccess { restaurants ->
                if (!favoritesFetch.isCurrent(token)) return@launch
                _favoriteRestaurants.value = restaurants
            }.onFailure {
                if (!favoritesFetch.isCurrent(token)) return@launch
                // Restaurant favorites table may not exist yet — that's OK
                _favoriteRestaurants.value = emptyList()
            }

            // Only the latest load owns the loading flags.
            if (favoritesFetch.isCurrent(token)) {
                _isLoading.value = false
                _isRefreshing.value = false
            }
        }
    }

    fun removeEventFavorite(eventId: String) {
        val userId = getCurrentUserId() ?: return
        viewModelScope.launch {
            favoritesRepository.toggleEventFavorite(
                userId, eventId, _favoriteEventIds.value, _currentTier.value,
            )
                .onSuccess {
                    _favoriteEventIds.value = _favoriteEventIds.value - eventId
                    _upcomingEvents.value = _upcomingEvents.value.filter { it.id != eventId }
                    _pastEvents.value = _pastEvents.value.filter { it.id != eventId }
                }
                .onFailure { _errorMessage.value = it.message }
        }
    }

    fun removeRestaurantFavorite(restaurantId: String) {
        val userId = getCurrentUserId() ?: return
        viewModelScope.launch {
            favoritesRepository.toggleRestaurantFavorite(
                userId, restaurantId, _favoriteRestaurantIds.value, _currentTier.value,
            )
                .onSuccess {
                    _favoriteRestaurantIds.value = _favoriteRestaurantIds.value - restaurantId
                    _favoriteRestaurants.value = _favoriteRestaurants.value.filter { it.id != restaurantId }
                }
                .onFailure { _errorMessage.value = it.message }
        }
    }

    private fun getCurrentUserId(): String? = authRepository.currentUserId
}

/**
 * UI state for the Favorites/Saved screen.
 */
data class FavoritesScreenState(
    val upcomingEvents: List<Event> = emptyList(),
    val pastEvents: List<Event> = emptyList(),
    val favoriteRestaurants: List<Restaurant> = emptyList(),
    val isLoading: Boolean = false,
    val isRefreshing: Boolean = false,
    val errorMessage: String? = null,
    val isAuthenticated: Boolean = false,
    val favoriteEventIds: Set<String> = emptySet(),
    val favoriteRestaurantIds: Set<String> = emptySet(),
    val currentTier: SubscriptionTier = SubscriptionTier.FREE,
) {
    val totalFavoriteCount: Int
        get() = favoriteEventIds.size + favoriteRestaurantIds.size

    val hasAnyFavorites: Boolean
        get() = upcomingEvents.isNotEmpty() || pastEvents.isNotEmpty() || favoriteRestaurants.isNotEmpty()
}

/**
 * Helper to combine extra state fields (avoids combine arity issues).
 */
private data class FavoritesStateExtra(
    val errorMessage: String?,
    val isAuthenticated: Boolean,
    val favoriteEventIds: Set<String>,
    val favoriteRestaurantIds: Set<String>,
    val currentTier: SubscriptionTier,
)
