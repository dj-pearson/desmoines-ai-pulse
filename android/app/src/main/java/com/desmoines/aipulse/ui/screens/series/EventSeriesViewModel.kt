package com.desmoines.aipulse.ui.screens.series

import androidx.compose.runtime.Immutable
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.desmoines.aipulse.data.repository.EventsRepository
import com.desmoines.aipulse.util.EventSeries
import com.desmoines.aipulse.util.EventSeriesDef
import com.desmoines.aipulse.util.EventSeriesSchedule
import com.desmoines.aipulse.util.SeriesSchedule
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import java.time.Instant
import javax.inject.Inject

@Immutable
data class EventSeriesUiState(
    /** Null only when the slug is not a series the app knows. */
    val def: EventSeriesDef? = null,
    val schedule: SeriesSchedule? = null,
    val isLoading: Boolean = true,
    /**
     * A failed read, kept apart from an empty schedule so an outage offers
     * Try again instead of "date not announced yet" (iOS loadError).
     */
    val loadError: String? = null,
)

/**
 * One annual event series, the native /events/series/<slug> page
 * (AND-AUDIT-042, slice 3b; iOS EventSeriesViewModel). Reads the series rows
 * the way the web's useEventSeriesPage does and groups them with
 * [EventSeriesSchedule.build], so the screen lists the editions the web lists.
 */
@HiltViewModel
class EventSeriesViewModel @Inject constructor(
    private val repository: EventsRepository,
) : ViewModel() {

    private val _uiState = MutableStateFlow(EventSeriesUiState())
    val uiState: StateFlow<EventSeriesUiState> = _uiState.asStateFlow()

    private var slug: String? = null

    fun load(slug: String) {
        this.slug = slug
        val def = EventSeries.forSlug(slug)
        if (def == null) {
            // DeepLinkHandler only routes known slugs here; this covers a
            // stale back stack after a series leaves the catalogue.
            _uiState.value = EventSeriesUiState(isLoading = false, loadError = "This series isn't available.")
            return
        }
        _uiState.update { it.copy(def = def, isLoading = true, loadError = null) }
        viewModelScope.launch {
            repository.fetchSeriesRows(def)
                .onSuccess { rows ->
                    _uiState.update {
                        it.copy(
                            schedule = EventSeriesSchedule.build(def, rows, Instant.now()),
                            isLoading = false,
                            loadError = null,
                        )
                    }
                }
                .onFailure {
                    // The repository logged it. A schedule from an earlier
                    // load stays on screen rather than blanking.
                    _uiState.update { it.copy(isLoading = false, loadError = "Couldn't load the dates.") }
                }
        }
    }

    fun retry() {
        slug?.let { load(it) }
    }
}
