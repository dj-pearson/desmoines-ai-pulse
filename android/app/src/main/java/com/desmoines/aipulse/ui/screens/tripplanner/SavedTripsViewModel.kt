package com.desmoines.aipulse.ui.screens.tripplanner

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.desmoines.aipulse.data.model.TripPlan
import com.desmoines.aipulse.data.repository.AuthRepository
import com.desmoines.aipulse.data.repository.TripPlannerRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

data class SavedTripsUiState(
    val trips: List<TripPlan> = emptyList(),
    val isLoading: Boolean = false,
    val errorMessage: String? = null,
    /** One-shot: set when a share URL is ready for the share sheet. */
    val shareUrl: String? = null,
) {
    val isEmpty: Boolean get() = trips.isEmpty() && !isLoading
}

/** Lists the user's saved itineraries with share + optimistic delete. Mirrors iOS saved-trips. */
@HiltViewModel
class SavedTripsViewModel @Inject constructor(
    private val repository: TripPlannerRepository,
    private val authRepository: AuthRepository,
) : ViewModel() {

    private val _uiState = MutableStateFlow(SavedTripsUiState())
    val uiState: StateFlow<SavedTripsUiState> = _uiState.asStateFlow()

    fun load() {
        _uiState.update { it.copy(isLoading = true, errorMessage = null) }
        viewModelScope.launch {
            repository.fetchSavedTrips(authRepository.currentUserId)
                .onSuccess { trips -> _uiState.update { it.copy(trips = trips, isLoading = false) } }
                .onFailure {
                    _uiState.update { it.copy(isLoading = false, errorMessage = "Couldn't load your trips. Pull to retry.") }
                }
        }
    }

    fun share(tripId: String) {
        viewModelScope.launch {
            repository.shareTrip(tripId)
                .onSuccess { url -> _uiState.update { it.copy(shareUrl = url) } }
                .onFailure {
                    _uiState.update { it.copy(errorMessage = "Couldn't create a share link. Try again.") }
                }
        }
    }

    fun consumeShareUrl() = _uiState.update { it.copy(shareUrl = null) }

    /** Optimistically remove the trip; restore from snapshot on failure (mirrors iOS audit). */
    fun delete(tripId: String) {
        val snapshot = _uiState.value.trips
        _uiState.update { it.copy(trips = it.trips.filterNot { trip -> trip.id == tripId }) }
        viewModelScope.launch {
            repository.deleteTrip(tripId).onFailure {
                _uiState.update {
                    it.copy(trips = snapshot, errorMessage = "Couldn't delete the itinerary. Please try again.")
                }
            }
        }
    }

    fun clearError() = _uiState.update { it.copy(errorMessage = null) }
}
