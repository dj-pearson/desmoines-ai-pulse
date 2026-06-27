package com.desmoines.aipulse.ui.screens.home

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.desmoines.aipulse.data.model.Recommendation
import com.desmoines.aipulse.data.repository.AuthRepository
import com.desmoines.aipulse.data.repository.ForYouRepository
import com.desmoines.aipulse.data.repository.ForYouSource
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

data class ForYouUiState(
    val source: ForYouSource = ForYouSource.TRENDING,
    val items: List<Recommendation> = emptyList(),
    val isLoading: Boolean = false,
) {
    val hasContent: Boolean get() = items.isNotEmpty()
}

/**
 * Drives the Home "For You / Trending now" rail. Mirrors iOS ForYouService usage:
 * personalized for engaged users, trending as cold-start. Errors hide the rail.
 */
@HiltViewModel
class ForYouViewModel @Inject constructor(
    private val repository: ForYouRepository,
    private val authRepository: AuthRepository,
) : ViewModel() {

    private val _uiState = MutableStateFlow(ForYouUiState())
    val uiState: StateFlow<ForYouUiState> = _uiState.asStateFlow()

    private var hasLoaded = false

    /** Load once per ViewModel lifetime (the rail re-composes across scrolls). */
    fun loadIfNeeded() {
        if (hasLoaded) return
        hasLoaded = true
        load()
    }

    fun refresh() = load()

    private fun load() {
        _uiState.update { it.copy(isLoading = true) }
        viewModelScope.launch {
            repository.fetchForYou(userId = authRepository.currentUserId)
                .onSuccess { result ->
                    _uiState.update {
                        it.copy(source = result.source, items = result.items, isLoading = false)
                    }
                }
                .onFailure {
                    // Mirror iOS: log + hide the rail (no error UI).
                    _uiState.update { it.copy(isLoading = false, items = emptyList()) }
                }
        }
    }
}
