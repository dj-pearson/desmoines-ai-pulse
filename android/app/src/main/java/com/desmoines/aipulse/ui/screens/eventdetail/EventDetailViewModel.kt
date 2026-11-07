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
import com.desmoines.aipulse.data.remote.BillingService
import com.desmoines.aipulse.data.repository.AuthRepository
import com.desmoines.aipulse.data.repository.EventsRepository
import com.desmoines.aipulse.data.repository.FavoritesRepository
import com.desmoines.aipulse.util.EventCalendarEntry
import com.desmoines.aipulse.util.EventReminderTiming
import com.desmoines.aipulse.util.EventTimeText
import com.desmoines.aipulse.util.LocalNotificationService
import com.desmoines.aipulse.util.LocationService
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import java.time.ZoneOffset
import javax.inject.Inject

/**
 * ViewModel for the Event Detail screen.
 * Mirrors iOS EventDetailViewModel.swift.
 */
@HiltViewModel
class EventDetailViewModel @Inject constructor(
    private val eventsRepository: EventsRepository,
    private val locationService: LocationService,
    private val favoritesRepository: FavoritesRepository,
    private val authRepository: AuthRepository,
    private val billingService: BillingService,
    private val localNotificationService: LocalNotificationService,
) : ViewModel() {

    /** Wall clock, swappable so tests can pin "now" relative to an event. */
    internal var nowMillis: () -> Long = { System.currentTimeMillis() }

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
                    refreshFavoriteState(event.id)
                    refreshReminderState(event)
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

    // MARK: - Favorites

    private val _isFavorited = MutableStateFlow(false)
    val isFavorited: StateFlow<Boolean> = _isFavorited.asStateFlow()

    private val _favoriteError = MutableStateFlow<String?>(null)
    val favoriteError: StateFlow<String?> = _favoriteError.asStateFlow()

    /**
     * Reads the persisted favorite state for [eventId].
     *
     * Until this was wired the heart was a local boolean that flipped on tap and
     * reset the moment the screen was reopened, so every save from a detail
     * screen was silently discarded.
     */
    private fun refreshFavoriteState(eventId: String) {
        val userId = authRepository.currentUserId
        if (userId == null) {
            _isFavorited.value = false
            return
        }
        viewModelScope.launch {
            favoritesRepository.loadFavorites(userId).onSuccess { state ->
                _isFavorited.value = eventId in state.favoriteEventIds
            }
        }
    }

    fun toggleFavorite() {
        val eventId = _event.value?.id ?: return
        val userId = authRepository.currentUserId
        if (userId == null) {
            _favoriteError.value = "Sign in to save events."
            return
        }

        viewModelScope.launch {
            val currentIds = if (_isFavorited.value) setOf(eventId) else emptySet()
            favoritesRepository.toggleEventFavorite(
                userId = userId,
                eventId = eventId,
                currentIds = currentIds,
                tier = billingService.currentTier.value,
            )
                .onSuccess { _isFavorited.value = it }
                .onFailure { _favoriteError.value = it.message }
        }
    }

    fun clearFavoriteError() {
        _favoriteError.value = null
    }

    // MARK: - Reminder

    private val _isReminderSet = MutableStateFlow(false)
    val isReminderSet: StateFlow<Boolean> = _isReminderSet.asStateFlow()

    private val _showReminderButton = MutableStateFlow(false)
    val showReminderButton: StateFlow<Boolean> = _showReminderButton.asStateFlow()

    private val _reminderMessage = MutableStateFlow<String?>(null)
    val reminderMessage: StateFlow<String?> = _reminderMessage.asStateFlow()

    /**
     * Reads the persisted reminder for [event] from [LocalNotificationService].
     *
     * The button used to hardcode "not set", so a reminder scheduled on an
     * earlier visit showed as "Remind Me" and there was no way to cancel it.
     */
    private fun refreshReminderState(event: Event) {
        val isSet = localNotificationService.isReminderSet(event.id)
        _isReminderSet.value = isSet
        _showReminderButton.value = isReminderButtonVisible(event, isSet, nowMillis())
    }

    /**
     * Sets or cancels the reminder for the loaded event.
     *
     * The caller is responsible for POST_NOTIFICATIONS on API 33+: it asks before
     * calling this, and calls [onNotificationPermissionDenied] instead when the
     * user says no, so nothing is scheduled that could never be shown.
     */
    fun toggleReminder() {
        val event = _event.value ?: return
        val startMillis = event.parsedDate?.toInstant()?.toEpochMilli() ?: return
        // A time-TBA row fires at 9am on its day, not an hour before a
        // placeholder time (AND-AUDIT-029).
        val fireAtMillis = EventReminderTiming.fireAtMillis(event) ?: return

        val nowSet = localNotificationService.toggleReminder(
            eventId = event.id,
            title = event.title,
            venue = event.venue,
            eventTimeMillis = startMillis,
            triggerAtMillis = fireAtMillis,
            isDayOf = !event.hasSpecificTime,
        )
        val wasSet = _isReminderSet.value
        _isReminderSet.value = nowSet
        _showReminderButton.value = isReminderButtonVisible(event, nowSet, nowMillis())

        // Asked to set one and it did not take: say why instead of leaving the
        // button looking like it ignored the tap.
        if (!wasSet && !nowSet) {
            _reminderMessage.value =
                if (fireAtMillis <= nowMillis()) {
                    if (event.hasSpecificTime) {
                        "This event starts in under an hour, too soon for a reminder."
                    } else {
                        "This event has no set time, so its reminder goes out at 9am that day, and that has passed."
                    }
                } else {
                    "Couldn't set the reminder. Please try again."
                }
        }
    }

    /** The user declined POST_NOTIFICATIONS; nothing is scheduled. */
    fun onNotificationPermissionDenied() {
        _reminderMessage.value =
            "Notifications are off for Des Moines Insider, so a reminder couldn't reach you. " +
                "Turn them on in Settings to use reminders."
    }

    fun clearReminderMessage() {
        _reminderMessage.value = null
    }

    companion object {
        /**
         * Whether the Remind Me button belongs on screen, matching iOS
         * EventDetailActions.swift: hidden once the event has started, since
         * there is nothing left to remind about, but kept while a reminder is
         * set so it can still be cancelled.
         *
         * A row with no real start time has no start to compare against, so
         * it shows until its 9am day-of reminder time has passed
         * (AND-AUDIT-029). Comparing the placeholder start kept the button on
         * screen into the evening of a SeatGeek row's day for a reminder that
         * could no longer be set.
         */
        internal fun isReminderButtonVisible(event: Event, isReminderSet: Boolean, nowMillis: Long): Boolean {
            val startMillis = event.parsedDate?.toInstant()?.toEpochMilli() ?: return false
            if (isReminderSet) return true
            if (!event.hasSpecificTime) {
                val fireAtMillis = EventReminderTiming.fireAtMillis(event) ?: return false
                return fireAtMillis > nowMillis
            }
            return startMillis >= nowMillis
        }
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
     * Creates a calendar insert intent for the event. The start, end, all-day
     * flag and time zone come from [EventCalendarEntry], the same rules iOS
     * uses (AND-AUDIT-027).
     */
    fun createCalendarIntent(): Intent? {
        val entry = _event.value?.let { EventCalendarEntry.from(it) } ?: return null
        return Intent(Intent.ACTION_INSERT).apply {
            data = CalendarContract.Events.CONTENT_URI
            putExtra(CalendarContract.Events.TITLE, entry.title)
            putExtra(CalendarContract.EXTRA_EVENT_BEGIN_TIME, entry.startMillis)
            putExtra(CalendarContract.EXTRA_EVENT_END_TIME, entry.endMillis)
            putExtra(CalendarContract.EXTRA_EVENT_ALL_DAY, entry.isAllDay)
            putExtra(CalendarContract.Events.EVENT_TIMEZONE, entry.timeZoneId)
            putExtra(CalendarContract.Events.EVENT_LOCATION, entry.location)
            putExtra(CalendarContract.Events.DESCRIPTION, entry.description)
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
            EventTimeText.dayText(event, "MMM d, yyyy")?.let { day ->
                val time = EventTimeText.timeText(event)
                parts.add(if (event.hasSpecificTime) "$day $time" else "$day (${EventTimeText.TIME_TBA})")
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
