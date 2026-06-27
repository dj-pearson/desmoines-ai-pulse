package com.desmoines.aipulse.ui.screens.search

import androidx.compose.runtime.Immutable
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.desmoines.aipulse.data.model.SavedSearch
import com.desmoines.aipulse.data.model.SavedSearchFilters
import com.desmoines.aipulse.data.repository.AuthRepository
import com.desmoines.aipulse.data.repository.SavedSearchRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

@Immutable
data class SavedSearchUiState(
    val searches: List<SavedSearch> = emptyList(),
    val isLoading: Boolean = false,
    val errorMessage: String? = null,
)

/**
 * Saved searches CRUD + alert configuration (ANDP-050). Optimistic delete with
 * rollback, alert toggle mirrored into the alert pipeline columns, offline cache
 * via the repository. Mirrors iOS SavedSearchService + SavedSearch UI.
 */
@HiltViewModel
class SavedSearchViewModel @Inject constructor(
    private val repository: SavedSearchRepository,
    private val authRepository: AuthRepository,
) : ViewModel() {

    private val _uiState = MutableStateFlow(SavedSearchUiState())
    val uiState: StateFlow<SavedSearchUiState> = _uiState.asStateFlow()

    init {
        load()
    }

    fun load() {
        _uiState.update { it.copy(isLoading = true) }
        viewModelScope.launch {
            repository.fetch(authRepository.currentUserId)
                .onSuccess { searches -> _uiState.update { it.copy(searches = searches, isLoading = false) } }
                .onFailure { _uiState.update { it.copy(isLoading = false) } }
        }
    }

    /** Save the active query as a new saved search. */
    fun save(query: String, tab: String) {
        val userId = authRepository.currentUserId ?: return
        val trimmed = query.trim()
        if (trimmed.isEmpty()) return
        viewModelScope.launch {
            repository.create(
                userId = userId,
                name = trimmed.take(60),
                filters = SavedSearchFilters(query = trimmed, tab = tab, alertsEnabled = false),
            ).onSuccess { load() }
                .onFailure { _uiState.update { it.copy(errorMessage = "Couldn't save this search. Try again.") } }
        }
    }

    /** Toggle alerts; writes both filters and the top-level alert columns. */
    fun toggleAlerts(search: SavedSearch) {
        val updatedFilters = search.filters.copy(alertsEnabled = !search.alertsEnabled)
        val snapshot = _uiState.value.searches
        _uiState.update { state ->
            state.copy(searches = state.searches.map { if (it.id == search.id) it.copy(filters = updatedFilters) else it })
        }
        viewModelScope.launch {
            repository.update(search.id, updatedFilters).onFailure {
                _uiState.update { it.copy(searches = snapshot, errorMessage = "Couldn't update alerts. Try again.") }
            }
        }
    }

    /** Optimistically remove; restore from snapshot on failure (mirrors iOS audit). */
    fun delete(search: SavedSearch) {
        val snapshot = _uiState.value.searches
        _uiState.update { it.copy(searches = it.searches.filterNot { s -> s.id == search.id }) }
        viewModelScope.launch {
            repository.delete(search.id).onFailure {
                _uiState.update { it.copy(searches = snapshot, errorMessage = "Couldn't delete this search. Try again.") }
            }
        }
    }

    fun clearError() = _uiState.update { it.copy(errorMessage = null) }
}
