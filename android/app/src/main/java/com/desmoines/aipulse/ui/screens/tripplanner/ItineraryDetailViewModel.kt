package com.desmoines.aipulse.ui.screens.tripplanner

import com.desmoines.aipulse.util.UiFormatLocale
import androidx.compose.runtime.Immutable
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.desmoines.aipulse.data.model.TripPlan
import com.desmoines.aipulse.data.model.TripPlanItem
import com.desmoines.aipulse.data.repository.TripPlannerRepository
import com.desmoines.aipulse.util.NetworkMonitor
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

/** One "Day N" section of the itinerary. */
@Immutable
data class DaySection(
    val day: Int,
    val items: List<TripPlanItem>,
)

@Immutable
data class ItineraryDetailUiState(
    val title: String = "",
    val description: String? = null,
    val dateRange: String? = null,
    val totalEstimatedCost: String? = null,
    val days: List<DaySection> = emptyList(),
    val tips: List<String> = emptyList(),
    val packingList: List<String> = emptyList(),
    val isLoading: Boolean = true,
    val loadFailed: Boolean = false,
    /** True when the failure is because the device is offline (drives the error copy). */
    val isOffline: Boolean = false,
    val reorderMode: Boolean = false,
    /** One-shot toast, e.g. when a reorder save fails and is rolled back. */
    val message: String? = null,
) {
    /** Unique, non-blank stop locations for the map preview. */
    val mapLocations: List<String>
        get() = days.flatMap { it.items }.mapNotNull { it.location?.takeIf(String::isNotBlank) }.distinct()
}

/**
 * Day-by-day itinerary detail with reorder. Mirrors iOS ItineraryDetailView:
 * loads the trip header + items (get_trip_itinerary), groups by day, and persists
 * reordering to trip_plan_items.order_index — reloading server truth on partial failure.
 */
@HiltViewModel
class ItineraryDetailViewModel @Inject constructor(
    private val repository: TripPlannerRepository,
    private val networkMonitor: NetworkMonitor,
) : ViewModel() {

    private val _uiState = MutableStateFlow(ItineraryDetailUiState())
    val uiState: StateFlow<ItineraryDetailUiState> = _uiState.asStateFlow()

    private var tripId: String? = null

    fun load(tripId: String) {
        this.tripId = tripId
        _uiState.update { it.copy(isLoading = true, loadFailed = false, isOffline = false) }
        viewModelScope.launch {
            val header = repository.fetchTrip(tripId)
            val items = repository.fetchItems(tripId)
            if (header.isFailure || items.isFailure) {
                _uiState.update {
                    it.copy(
                        isLoading = false,
                        loadFailed = true,
                        isOffline = !networkMonitor.isConnected.value,
                    )
                }
                return@launch
            }
            val trip = header.getOrThrow()
            _uiState.update {
                it.copy(
                    title = trip.title,
                    description = trip.description,
                    dateRange = dateRange(trip.startDate, trip.endDate),
                    totalEstimatedCost = trip.totalEstimatedCost,
                    days = groupByDay(items.getOrThrow()),
                    tips = trip.tips,
                    packingList = trip.packingList,
                    isLoading = false,
                    loadFailed = false,
                )
            }
        }
    }

    fun retry() {
        tripId?.let { load(it) }
    }

    fun toggleReorderMode() {
        _uiState.update { it.copy(reorderMode = !it.reorderMode) }
    }

    /** Move the stop at [index] within [day] up (delta = -1) or down (delta = +1), then persist. */
    fun move(day: Int, index: Int, delta: Int) {
        val section = _uiState.value.days.firstOrNull { it.day == day } ?: return
        val target = index + delta
        if (index !in section.items.indices || target !in section.items.indices) return

        val reordered = section.items.toMutableList().apply { add(target, removeAt(index)) }
        _uiState.update { state ->
            state.copy(days = state.days.map { if (it.day == day) it.copy(items = reordered) else it })
        }

        viewModelScope.launch {
            if (!repository.persistOrder(reordered)) {
                // Don't let the visible order silently diverge from the server.
                _uiState.update { it.copy(message = "Couldn't save the new order. Restored.") }
                refetchItems()
            }
        }
    }

    private suspend fun refetchItems() {
        val id = tripId ?: return
        repository.fetchItems(id).onSuccess { items ->
            _uiState.update { it.copy(days = groupByDay(items)) }
        }
    }

    fun consumeMessage() = _uiState.update { it.copy(message = null) }

    private fun groupByDay(items: List<TripPlanItem>): List<DaySection> =
        items.sortedWith(compareBy({ it.dayNumber }, { it.orderIndex }))
            .groupBy { it.dayNumber }
            .toSortedMap()
            .map { (day, dayItems) -> DaySection(day = day, items = dayItems) }

    companion object {
        private val isoDate = java.time.format.DateTimeFormatter.ISO_LOCAL_DATE
        private val prettyDate = java.time.format.DateTimeFormatter.ofPattern("MMM d", UiFormatLocale)

        private fun fmt(value: String?): String? =
            value?.let { runCatching { java.time.LocalDate.parse(it.take(10), isoDate).format(prettyDate) }.getOrNull() ?: it }

        fun dateRange(start: String?, end: String?): String? {
            val s = fmt(start)
            val e = fmt(end)
            return when {
                s != null && e != null && s != e -> "$s – $e"
                s != null -> s
                e != null -> e
                else -> null
            }
        }
    }
}
