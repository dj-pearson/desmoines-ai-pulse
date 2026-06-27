package com.desmoines.aipulse.ui.screens.deals

import androidx.compose.runtime.Immutable
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.desmoines.aipulse.data.model.Deal
import com.desmoines.aipulse.data.repository.DealsRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

@Immutable
data class DealsUiState(
    val deals: List<Deal> = emptyList(),
    /** null = "All". */
    val entityType: String? = null,
    val activeNowOnly: Boolean = false,
    val searchText: String = "",
    val isLoading: Boolean = true,
    val errorMessage: String? = null,
) {
    val isEmpty: Boolean get() = deals.isEmpty() && !isLoading && errorMessage == null
    /** True when the deck is empty only because of an active filter/search. */
    val isFiltered: Boolean get() = entityType != null || activeNowOnly || searchText.isNotBlank()
}

/**
 * Deals hub (ANDP-032): browse active deals with entity-type chips, an
 * "active now" toggle, and title/business/description search. Best-effort
 * redemption tracking on display. Mirrors iOS DealsView.
 */
@HiltViewModel
class DealsViewModel @Inject constructor(
    private val repository: DealsRepository,
) : ViewModel() {

    private val _uiState = MutableStateFlow(DealsUiState())
    val uiState: StateFlow<DealsUiState> = _uiState.asStateFlow()

    private var allDeals: List<Deal> = emptyList()
    private val redeemed = mutableSetOf<String>()

    init {
        load()
    }

    fun load() {
        _uiState.update { it.copy(isLoading = true, errorMessage = null) }
        viewModelScope.launch {
            repository.fetchDeals()
                .onSuccess { deals ->
                    allDeals = deals
                    applyFilters()
                    _uiState.update { it.copy(isLoading = false, errorMessage = null) }
                    redeemOnDisplay(deals)
                }
                .onFailure {
                    _uiState.update { it.copy(isLoading = false, errorMessage = "Couldn't load deals. Tap to retry.") }
                }
        }
    }

    fun retry() = load()

    fun onEntityTypeSelected(type: String?) {
        _uiState.update { it.copy(entityType = type) }
        applyFilters()
    }

    fun onToggleActiveNow() {
        _uiState.update { it.copy(activeNowOnly = !it.activeNowOnly) }
        applyFilters()
    }

    fun onSearchTextChanged(text: String) {
        _uiState.update { it.copy(searchText = text) }
        applyFilters()
    }

    private fun applyFilters() {
        val state = _uiState.value
        val query = state.searchText.trim().lowercase()
        val filtered = allDeals.filter { deal ->
            (state.entityType == null || deal.entityType == state.entityType) &&
                (!state.activeNowOnly || deal.isActiveNow()) &&
                (query.isEmpty() || deal.matchesQuery(query))
        }
        _uiState.update { it.copy(deals = filtered) }
    }

    /** Best-effort redemption ping per deal, once per session. */
    private fun redeemOnDisplay(deals: List<Deal>) {
        viewModelScope.launch {
            deals.forEach { deal ->
                if (redeemed.add(deal.id)) repository.claimDeal(deal.id)
            }
        }
    }

    private fun Deal.matchesQuery(q: String): Boolean =
        title.lowercase().contains(q) ||
            businessName.lowercase().contains(q) ||
            (description?.lowercase()?.contains(q) == true)

    companion object {
        /** Entity-type chips (parity with the web/iOS hub). */
        val ENTITY_TYPES = listOf("restaurant", "attraction", "event", "hotel")
    }
}
