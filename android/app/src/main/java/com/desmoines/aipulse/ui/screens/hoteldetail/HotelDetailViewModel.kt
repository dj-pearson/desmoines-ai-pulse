package com.desmoines.aipulse.ui.screens.hoteldetail

import android.content.Intent
import android.net.Uri
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.desmoines.aipulse.data.model.Hotel
import com.desmoines.aipulse.data.repository.HotelsRepository
import com.desmoines.aipulse.util.LocationService
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import java.util.Locale
import javax.inject.Inject

/**
 * ViewModel for the Hotel Detail screen (ANDP-034). Loads a hotel by id and
 * builds the booking / directions / call intents. Mirrors iOS HotelDetailView.
 */
@HiltViewModel
class HotelDetailViewModel @Inject constructor(
    private val hotelsRepository: HotelsRepository,
    private val locationService: LocationService,
) : ViewModel() {

    private val _hotel = MutableStateFlow<Hotel?>(null)
    val hotel: StateFlow<Hotel?> = _hotel.asStateFlow()

    private val _isLoading = MutableStateFlow(false)
    val isLoading: StateFlow<Boolean> = _isLoading.asStateFlow()

    private val _errorMessage = MutableStateFlow<String?>(null)
    val errorMessage: StateFlow<String?> = _errorMessage.asStateFlow()

    private var lastId: String? = null

    fun load(id: String) {
        lastId = id
        viewModelScope.launch {
            _isLoading.value = true
            _errorMessage.value = null

            hotelsRepository.fetchById(id)
                .onSuccess { fetched ->
                    if (fetched != null) {
                        _hotel.value = fetched
                    } else {
                        _errorMessage.value = "Hotel not found."
                    }
                }
                .onFailure { _errorMessage.value = "Couldn't load this hotel. Tap to retry." }

            _isLoading.value = false
        }
    }

    fun retry() {
        lastId?.let { load(it) }
    }

    /** Distance from the user to this hotel, or null when unavailable. */
    fun formattedDistance(): String? {
        val hotel = _hotel.value ?: return null
        val lat = hotel.latitude ?: return null
        val lng = hotel.longitude ?: return null
        return locationService.formattedDistance(lat, lng)
    }

    // MARK: - Intents

    /**
     * Opens the affiliate booking link (or the hotel's own site). The safe
     * external-link launcher + affiliate allowlist hardening lands in
     * ANDP-063 (#249) / ANDP-065 (#265); for now this is a plain ACTION_VIEW,
     * consistent with the other detail screens' website buttons.
     */
    fun createBookingIntent(): Intent? {
        val url = _hotel.value?.bookingUrl ?: return null
        return Intent(Intent.ACTION_VIEW, Uri.parse(url))
    }

    fun createCallIntent(): Intent? {
        val phone = _hotel.value?.phone?.trim()?.takeIf { it.isNotEmpty() } ?: return null
        return Intent(Intent.ACTION_DIAL, Uri.parse("tel:$phone"))
    }

    fun createDirectionsIntent(): Intent? {
        val hotel = _hotel.value ?: return null
        val lat = hotel.latitude ?: return null
        val lng = hotel.longitude ?: return null
        val name = Uri.encode(hotel.name)
        val uri = Uri.parse("google.navigation:q=$lat,$lng&q=$name")
        return Intent(Intent.ACTION_VIEW, uri).apply {
            setPackage("com.google.android.apps.maps")
        }
    }

    fun createDirectionsFallbackIntent(): Intent? {
        val hotel = _hotel.value ?: return null
        val lat = hotel.latitude ?: return null
        val lng = hotel.longitude ?: return null
        val name = Uri.encode(hotel.name)
        val uri = Uri.parse("geo:$lat,$lng?q=$lat,$lng($name)")
        return Intent(Intent.ACTION_VIEW, uri)
    }

    /** Share text matching the other detail screens. */
    val shareText: String
        get() {
            val hotel = _hotel.value ?: return ""
            var text = hotel.name
            hotel.area?.takeIf { it.isNotBlank() }?.let { text += " — $it" }
            hotel.starRating?.let { text += " ⭐ ${String.format(Locale.US, "%.1f", it)}" }
            text += "\n\nFound on Des Moines Insider"
            return text
        }
}
