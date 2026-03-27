package com.desmoines.aipulse.ui.screens.eventdetail

import android.content.ContentValues
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.provider.CalendarContract
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.desmoines.aipulse.data.model.Event
import com.desmoines.aipulse.data.model.EventCategory
import com.desmoines.aipulse.data.model.SubscriptionTier
import com.desmoines.aipulse.data.repository.EventsRepository
import com.desmoines.aipulse.util.LocationService
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import java.time.ZoneOffset
import java.time.format.DateTimeFormatter
import javax.inject.Inject

/**
 * ViewModel for the Event Detail screen.
 * Mirrors iOS EventDetailViewModel.swift.
 */
@HiltViewModel
class EventDetailViewModel @Inject constructor(
    private val eventsRepository: EventsRepository,
    private val locationService: LocationService,
) : ViewModel() {

    private val _event = MutableStateFlow<Event?>(null)
    val event: StateFlow<Event?> = _event.asStateFlow()

    private val _relatedEvents = MutableStateFlow<List<Event>>(emptyList())
    val relatedEvents: StateFlow<List<Event>> = _relatedEvents.asStateFlow()

    private val _isLoading = MutableStateFlow(false)
    val isLoading: StateFlow<Boolean> = _isLoading.asStateFlow()

    private val _errorMessage = MutableStateFlow<String?>(null)
    val errorMessage: StateFlow<String?> = _errorMessage.asStateFlow()

    private val _calendarAdded = MutableStateFlow(false)
    val calendarAdded: StateFlow<Boolean> = _calendarAdded.asStateFlow()

    private val _calendarError = MutableStateFlow<String?>(null)
    val calendarError: StateFlow<String?> = _calendarError.asStateFlow()

    // MARK: - Load Event

    fun loadEvent(id: String) {
        viewModelScope.launch {
            _isLoading.value = true
            _errorMessage.value = null

            eventsRepository.fetchEvent(id)
                .onSuccess { event ->
                    _event.value = event
                    loadRelatedEvents(event.id, event.category)
                }
                .onFailure { error ->
                    _errorMessage.value = error.message
                }

            _isLoading.value = false
        }
    }

    private suspend fun loadRelatedEvents(eventId: String, category: String?) {
        if (category == null) return
        eventsRepository.fetchRelatedEvents(eventId, category)
            .onSuccess { _relatedEvents.value = it }
            .onFailure { _relatedEvents.value = emptyList() }
    }

    // MARK: - Favorites (placeholder — implemented in AND-024)

    // isFavorited will be wired in AND-024 when FavoritesService is built
    private val _isFavorited = MutableStateFlow(false)
    val isFavorited: StateFlow<Boolean> = _isFavorited.asStateFlow()

    fun toggleFavorite() {
        // Placeholder — will connect to FavoritesRepository in AND-024
        _isFavorited.value = !_isFavorited.value
    }

    /**
     * Formatted distance from user's location to this event.
     * Returns null if location unavailable or event has no coordinates.
     */
    fun formattedDistance(): String? {
        val coord = _event.value?.coordinate ?: return null
        return locationService.formattedDistance(coord.latitude, coord.longitude)
    }

    // MARK: - Calendar Integration

    /**
     * Creates a calendar insert intent for the event.
     * Uses CalendarContract for native calendar integration.
     */
    fun createCalendarIntent(): Intent? {
        val event = _event.value ?: return null
        val date = event.parsedDate ?: return null

        val startMillis = date.toInstant().toEpochMilli()
        val endMillis = date.plusHours(2).toInstant().toEpochMilli() // 2h default duration

        return Intent(Intent.ACTION_INSERT).apply {
            data = CalendarContract.Events.CONTENT_URI
            putExtra(CalendarContract.Events.TITLE, event.title)
            putExtra(CalendarContract.EXTRA_EVENT_BEGIN_TIME, startMillis)
            putExtra(CalendarContract.EXTRA_EVENT_END_TIME, endMillis)
            putExtra(CalendarContract.Events.EVENT_LOCATION, event.displayLocation)
            putExtra(CalendarContract.Events.DESCRIPTION, event.displayDescription)
        }
    }

    fun setCalendarAdded() {
        _calendarAdded.value = true
    }

    fun resetCalendarState() {
        _calendarAdded.value = false
        _calendarError.value = null
    }

    // MARK: - Share

    val shareText: String
        get() {
            val event = _event.value ?: return ""
            val parts = mutableListOf(event.title)
            event.parsedDate?.let { date ->
                val formatter = DateTimeFormatter.ofPattern("MMM d, yyyy h:mm a")
                parts.add(date.format(formatter))
            }
            parts.add("at ${event.displayLocation}")
            return parts.joinToString(" - ") + "\n\nFound on Des Moines Insider"
        }

    // MARK: - Directions

    fun createDirectionsIntent(): Intent? {
        val coord = _event.value?.coordinate ?: return null
        val uri = Uri.parse("google.navigation:q=${coord.latitude},${coord.longitude}")
        return Intent(Intent.ACTION_VIEW, uri).apply {
            setPackage("com.google.android.apps.maps")
        }
    }

    fun createDirectionsFallbackIntent(): Intent? {
        val coord = _event.value?.coordinate ?: return null
        val uri = Uri.parse("geo:${coord.latitude},${coord.longitude}?q=${coord.latitude},${coord.longitude}")
        return Intent(Intent.ACTION_VIEW, uri)
    }

    // MARK: - Insider Tips

    fun getInsiderTipText(): String {
        val event = _event.value ?: return ""
        val tips = mutableListOf<String>()

        if (event.isFree) {
            tips.add("This is a free event — arrive early for the best spots!")
        }

        val venue = event.venue
        if (venue != null && venue.lowercase().contains("downtown")) {
            tips.add("Parking can fill up fast downtown. Consider using the Des Moines Skywalk system or DART bus.")
        } else if (event.coordinate != null) {
            tips.add("Check the map for nearby parking options. Rideshare drops off nearby too.")
        }

        when (event.eventCategory) {
            EventCategory.MUSIC -> tips.add("Bring ear protection for indoor venues. Outdoor shows are great with a blanket or lawn chair.")
            EventCategory.FOOD -> tips.add("Come hungry! Many food events offer sample-size portions so you can try everything.")
            EventCategory.OUTDOOR -> tips.add("Check the weather forecast and dress in layers. Iowa weather can change quickly!")
            EventCategory.FAMILY -> tips.add("Most family events have activities for all ages. Strollers are usually welcome.")
            EventCategory.ART -> tips.add("Many art events feature local Des Moines artists. Ask about pieces — they love to talk about their work!")
            else -> tips.add("Get there a bit early to find your spot and enjoy the full experience.")
        }

        return tips.joinToString(" ")
    }
}
