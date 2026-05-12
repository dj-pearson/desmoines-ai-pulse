package com.desmoines.aipulse.ui.screens.surpriseme

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.desmoines.aipulse.data.remote.SurpriseMeService
import com.desmoines.aipulse.util.LocationService
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

data class SurpriseMeState(
    val pick: SurpriseMeService.Pick? = null,
    val isLoading: Boolean = true,
    val errorMessage: String? = null,
)

@HiltViewModel
class SurpriseMeViewModel @Inject constructor(
    private val service: SurpriseMeService,
    private val location: LocationService,
) : ViewModel() {

    private val _state = MutableStateFlow(SurpriseMeState())
    val state: StateFlow<SurpriseMeState> = _state.asStateFlow()

    fun load() {
        _state.update { it.copy(isLoading = true, errorMessage = null, pick = null) }
        viewModelScope.launch {
            try {
                val loc = runCatching { location.getCurrentLocation() }.getOrNull()
                val pick = service.surprise(latitude = loc?.latitude, longitude = loc?.longitude)
                _state.update { it.copy(pick = pick, isLoading = false) }
            } catch (e: Exception) {
                _state.update { it.copy(isLoading = false, errorMessage = e.message ?: "Couldn't roll the dice") }
            }
        }
    }

    fun save() {
        val pick = _state.value.pick ?: return
        viewModelScope.launch {
            runCatching { service.track(pick, SurpriseMeService.Outcome.SAVED) }
        }
    }

    fun tryAnother() {
        val pick = _state.value.pick
        viewModelScope.launch {
            pick?.let { runCatching { service.track(it, SurpriseMeService.Outcome.TRIED_ANOTHER) } }
            load()
        }
    }
}
