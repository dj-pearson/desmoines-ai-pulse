package com.desmoines.aipulse.ui.screens.bestof

import androidx.compose.runtime.Immutable
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.desmoines.aipulse.data.model.VotingCategory
import com.desmoines.aipulse.data.repository.BestOfRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

@Immutable
data class BestOfUiState(
    val categories: List<VotingCategory> = emptyList(),
    val isLoading: Boolean = true,
    val isRefreshing: Boolean = false,
    val errorMessage: String? = null,
) {
    val isEmpty: Boolean get() = categories.isEmpty() && !isLoading && errorMessage == null
}

/**
 * Best Of hub (ANDP-037): browse active community voting categories with vote
 * counts. Reading is free. Mirrors iOS BestOfView. The per-category voting
 * booth lands in ANDP-038 (#276); winner badges in ANDP-039 (#292).
 */
@HiltViewModel
class BestOfViewModel @Inject constructor(
    private val repository: BestOfRepository,
) : ViewModel() {

    private val _uiState = MutableStateFlow(BestOfUiState())
    val uiState: StateFlow<BestOfUiState> = _uiState.asStateFlow()

    init {
        load(refresh = false)
    }

    fun refresh() = load(refresh = true)

    fun retry() = load(refresh = false)

    private fun load(refresh: Boolean) {
        _uiState.update { it.copy(isLoading = !refresh && it.categories.isEmpty(), isRefreshing = refresh, errorMessage = null) }
        viewModelScope.launch {
            repository.fetchCategories()
                .onSuccess { categories ->
                    _uiState.update { it.copy(categories = categories, isLoading = false, isRefreshing = false, errorMessage = null) }
                }
                .onFailure {
                    _uiState.update { it.copy(isLoading = false, isRefreshing = false, errorMessage = "Couldn't load categories. Tap to retry.") }
                }
        }
    }
}
