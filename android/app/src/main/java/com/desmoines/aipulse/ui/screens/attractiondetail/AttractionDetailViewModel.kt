package com.desmoines.aipulse.ui.screens.attractiondetail

import android.content.Intent
import android.net.Uri
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.desmoines.aipulse.data.model.Attraction
import com.desmoines.aipulse.data.repository.AttractionsRepository
import com.desmoines.aipulse.util.LocationService
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import java.util.Locale
import javax.inject.Inject

/**
 * ViewModel for the Attraction Detail screen.
 * Mirrors iOS AttractionDetailView.swift logic (no separate ViewModel in iOS).
 */
@HiltViewModel
class AttractionDetailViewModel @Inject constructor(
    private val attractionsRepository: AttractionsRepository,
    private val locationService: LocationService,
) : ViewModel() {

    private val _attraction = MutableStateFlow<Attraction?>(null)
    val attraction: StateFlow<Attraction?> = _attraction.asStateFlow()

    private val _isLoading = MutableStateFlow(false)
    val isLoading: StateFlow<Boolean> = _isLoading.asStateFlow()

    private val _errorMessage = MutableStateFlow<String?>(null)
    val errorMessage: StateFlow<String?> = _errorMessage.asStateFlow()

    fun loadAttraction(id: String) {
        viewModelScope.launch {
            _isLoading.value = true
            _errorMessage.value = null

            attractionsRepository.fetchAttraction(id)
                .onSuccess { _attraction.value = it }
                .onFailure { _errorMessage.value = it.message }

            _isLoading.value = false
        }
    }

    /**
     * Formatted distance from user's location to this attraction.
     * Returns null if location unavailable or attraction has no coordinates.
     */
    fun formattedDistance(): String? {
        val coord = _attraction.value?.coordinate ?: return null
        return locationService.formattedDistance(coord.latitude, coord.longitude)
    }

    // MARK: - Intents

    fun createWebsiteIntent(): Intent? {
        val uri = _attraction.value?.websiteUri ?: return null
        return Intent(Intent.ACTION_VIEW, uri)
    }

    fun createDirectionsIntent(): Intent? {
        val coord = _attraction.value?.coordinate ?: return null
        val name = _attraction.value?.name?.let { Uri.encode(it) } ?: ""
        val uri = Uri.parse("google.navigation:q=${coord.latitude},${coord.longitude}&q=$name")
        return Intent(Intent.ACTION_VIEW, uri).apply {
            setPackage("com.google.android.apps.maps")
        }
    }

    fun createDirectionsFallbackIntent(): Intent? {
        val coord = _attraction.value?.coordinate ?: return null
        val name = _attraction.value?.name?.let { Uri.encode(it) } ?: ""
        val uri = Uri.parse("geo:${coord.latitude},${coord.longitude}?q=${coord.latitude},${coord.longitude}($name)")
        return Intent(Intent.ACTION_VIEW, uri)
    }

    /** Share text matching iOS: "Name (Type) - Location ⭐ Rating\n\nFound on Des Moines Insider" */
    val shareText: String
        get() {
            val attraction = _attraction.value ?: return ""
            var text = "${attraction.name} (${attraction.type})"
            attraction.location?.let { text += " - $it" }
            attraction.rating?.let { text += " \u2B50 ${String.format(Locale.US, "%.1f", it)}" }
            text += "\n\nFound on Des Moines Insider"
            return text
        }
}
