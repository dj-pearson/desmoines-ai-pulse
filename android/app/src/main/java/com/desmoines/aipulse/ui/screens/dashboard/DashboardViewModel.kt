package com.desmoines.aipulse.ui.screens.dashboard

import androidx.compose.runtime.Immutable
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.desmoines.aipulse.data.model.RecentItem
import com.desmoines.aipulse.data.model.TripPlan
import com.desmoines.aipulse.data.repository.AuthRepository
import com.desmoines.aipulse.data.repository.FavoritesRepository
import com.desmoines.aipulse.data.repository.TripPlannerRepository
import com.desmoines.aipulse.util.RecentlyViewedService
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

@Immutable
data class DashboardUiState(
    val isAuthenticated: Boolean = false,
    val trips: List<TripPlan> = emptyList(),
    val favoriteEvents: Int = 0,
    val favoriteDining: Int = 0,
    val recents: List<RecentItem> = emptyList(),
    val isLoading: Boolean = true,
    val isRefreshing: Boolean = false,
) {
    val totalFavorites: Int get() = favoriteEvents + favoriteDining
}

/**
 * Signed-in home base (ANDP-028): a personal hub of trips, favorites, saved
 * searches, recents, and recommendations. Composes existing repositories +
 * services; mirrors iOS DashboardView.
 */
@HiltViewModel
class DashboardViewModel @Inject constructor(
    private val authRepository: AuthRepository,
    private val tripPlannerRepository: TripPlannerRepository,
    private val favoritesRepository: FavoritesRepository,
    recentlyViewedService: RecentlyViewedService,
) : ViewModel() {

    private val _uiState = MutableStateFlow(DashboardUiState())
    val uiState: StateFlow<DashboardUiState> = _uiState.asStateFlow()

    init {
        // Recently-viewed is an on-device stream — reflect it live.
        viewModelScope.launch {
            recentlyViewedService.recent.collect { recents ->
                _uiState.update { it.copy(recents = recents) }
            }
        }
        load(refresh = false)
    }

    fun refresh() = load(refresh = true)

    fun load(refresh: Boolean) {
        val userId = authRepository.currentUserId
        if (userId == null) {
            _uiState.update { it.copy(isAuthenticated = false, isLoading = false, isRefreshing = false) }
            return
        }
        _uiState.update { it.copy(isAuthenticated = true, isLoading = !refresh, isRefreshing = refresh) }
        viewModelScope.launch {
            val (trips, favorites) = coroutineScope {
                val t = async { tripPlannerRepository.fetchSavedTrips(userId).getOrNull().orEmpty() }
                val f = async { favoritesRepository.loadFavorites(userId).getOrNull() }
                t.await() to f.await()
            }
            _uiState.update {
                it.copy(
                    trips = trips.take(3),
                    favoriteEvents = favorites?.favoriteEventIds?.size ?: it.favoriteEvents,
                    favoriteDining = favorites?.favoriteRestaurantIds?.size ?: it.favoriteDining,
                    isLoading = false,
                    isRefreshing = false,
                )
            }
        }
    }
}
