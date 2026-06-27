package com.desmoines.aipulse.ui.screens.weekend

import androidx.compose.runtime.Immutable
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.desmoines.aipulse.data.model.Attraction
import com.desmoines.aipulse.data.model.Event
import com.desmoines.aipulse.data.model.Restaurant
import com.desmoines.aipulse.data.remote.AttractionsQuery
import com.desmoines.aipulse.data.remote.EventsQuery
import com.desmoines.aipulse.data.remote.RestaurantsQuery
import com.desmoines.aipulse.data.repository.AttractionsRepository
import com.desmoines.aipulse.data.repository.EventsRepository
import com.desmoines.aipulse.data.repository.RestaurantsRepository
import com.desmoines.aipulse.util.NetworkMonitor
import com.desmoines.aipulse.util.QueryCache
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.serialization.builtins.ListSerializer
import java.time.DayOfWeek
import java.time.LocalDate
import java.time.format.DateTimeFormatter
import java.time.format.TextStyle
import java.util.Locale
import javax.inject.Inject

@Immutable
data class WeekendDay(
    val name: String,
    val date: LocalDate,
    val events: List<Event>,
) {
    val count: Int get() = events.size
}

@Immutable
data class WeekendUiState(
    val days: List<WeekendDay> = emptyList(),
    val featuredRestaurants: List<Restaurant> = emptyList(),
    val featuredAttractions: List<Attraction> = emptyList(),
    val isLoading: Boolean = true,
    val isRefreshing: Boolean = false,
    /** Full-screen error (offline cold-start with no cache, or a hard failure). */
    val errorMessage: String? = null,
    /** Inline, non-blocking banner when a featured rail failed but events loaded. */
    val railError: Boolean = false,
) {
    val isEmpty: Boolean
        get() = days.isEmpty() && featuredRestaurants.isEmpty() &&
            featuredAttractions.isEmpty() && !isLoading && errorMessage == null
}

/**
 * "This Weekend" guide (ANDP-025): events Fri→Sun grouped by day, plus featured
 * dining + attractions rails. Free feature. Events are cached under
 * `weekend-events` for offline cold-start; the rails fail soft. Mirrors iOS
 * WeekendView.
 */
@HiltViewModel
class WeekendViewModel @Inject constructor(
    private val eventsRepository: EventsRepository,
    private val restaurantsRepository: RestaurantsRepository,
    private val attractionsRepository: AttractionsRepository,
    private val queryCache: QueryCache,
    private val networkMonitor: NetworkMonitor,
) : ViewModel() {

    private val _uiState = MutableStateFlow(WeekendUiState())
    val uiState: StateFlow<WeekendUiState> = _uiState.asStateFlow()

    init {
        load(refresh = false)
    }

    fun refresh() = load(refresh = true)

    fun load(refresh: Boolean) {
        _uiState.update {
            it.copy(
                isLoading = !refresh && it.days.isEmpty(),
                isRefreshing = refresh,
                errorMessage = null,
                railError = false,
            )
        }
        viewModelScope.launch {
            val friday = weekendFriday(LocalDate.now())
            val monday = friday.plusDays(3)
            val connected = networkMonitor.isConnected.value

            // Events: fresh-or-cached, with offline cold-start from the cache.
            val fresh = eventsRepository.fetchEvents(
                EventsQuery(
                    dateStart = friday.atStartOfDay().format(ISO),
                    dateEnd = monday.atStartOfDay().format(ISO),
                    limit = 50,
                ),
            ).getOrNull()?.events
            val events: List<Event>? = if (fresh != null) {
                queryCache.set(CACHE_KEY, fresh, EVENTS_SERIALIZER)
                fresh
            } else {
                queryCache.get(CACHE_KEY, EVENTS_SERIALIZER, allowStale = !connected)
            }

            // Featured rails — each fails soft.
            val restResult = restaurantsRepository.fetchRestaurants(
                RestaurantsQuery(isFeatured = true, limit = 10),
            )
            val attrResult = attractionsRepository.fetchAttractions(
                AttractionsQuery(isFeatured = true, limit = 10),
            )
            val restaurants = restResult.getOrNull()?.restaurants.orEmpty()
            val attractions = attrResult.getOrNull()?.attractions.orEmpty()
            val railFailed = restResult.isFailure || attrResult.isFailure

            val days = groupEventsByDay(events.orEmpty(), friday)

            _uiState.update {
                it.copy(
                    days = days,
                    featuredRestaurants = restaurants,
                    featuredAttractions = attractions,
                    isLoading = false,
                    isRefreshing = false,
                    railError = railFailed && events != null,
                    errorMessage = when {
                        events != null -> null
                        !connected -> "You're offline and there's nothing saved yet."
                        else -> "Couldn't load this weekend's plan. Pull to refresh."
                    },
                )
            }
        }
    }

    companion object {
        private const val CACHE_KEY = "weekend-events"
        private val ISO: DateTimeFormatter = DateTimeFormatter.ISO_LOCAL_DATE_TIME
        private val EVENTS_SERIALIZER = ListSerializer(Event.serializer())

        /** The Friday anchoring the current/upcoming weekend window. Pure — testable. */
        fun weekendFriday(today: LocalDate): LocalDate {
            val dow = today.dayOfWeek.value // Mon=1 .. Sun=7
            val friday = DayOfWeek.FRIDAY.value // 5
            return if (dow >= friday) today.minusDays((dow - friday).toLong())
            else today.plusDays((friday - dow).toLong())
        }

        /** Group events into Fri/Sat/Sun buckets, dropping empty days. Pure — testable. */
        fun groupEventsByDay(events: List<Event>, friday: LocalDate): List<WeekendDay> {
            val byDate = events
                .sortedBy { it.parsedDate }
                .groupBy { it.parsedDate?.toLocalDate() }
            return (0..2L).mapNotNull { offset ->
                val day = friday.plusDays(offset)
                val dayEvents = byDate[day].orEmpty()
                if (dayEvents.isEmpty()) {
                    null
                } else {
                    WeekendDay(
                        name = day.dayOfWeek.getDisplayName(TextStyle.FULL, Locale.US),
                        date = day,
                        events = dayEvents,
                    )
                }
            }
        }
    }
}
