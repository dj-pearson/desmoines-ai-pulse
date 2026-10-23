package com.desmoines.aipulse.ui.screens.tripplanner

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.desmoines.aipulse.data.repository.TripPlannerAvailability
import com.desmoines.aipulse.data.repository.TripPlannerAvailabilityStore
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

/**
 * Exposes the process-wide Trip Planner availability to any screen that
 * promotes or opens the planner (Home, paywall, Dashboard, the planner
 * itself). Creating one starts the probe; the store runs it once per process.
 */
@HiltViewModel
class TripPlannerAvailabilityViewModel @Inject constructor(
    private val store: TripPlannerAvailabilityStore,
) : ViewModel() {

    val availability: StateFlow<TripPlannerAvailability> = store.state

    init {
        viewModelScope.launch { store.ensureProbed() }
    }
}
