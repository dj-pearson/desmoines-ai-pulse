package com.desmoines.aipulse.ui.screens.surpriseme

import androidx.compose.runtime.Immutable
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.desmoines.aipulse.data.model.PaywallContext
import com.desmoines.aipulse.data.model.SurprisePick
import com.desmoines.aipulse.data.remote.FavoritesException
import com.desmoines.aipulse.data.repository.AuthRepository
import com.desmoines.aipulse.data.repository.FavoritesRepository
import com.desmoines.aipulse.data.repository.SurpriseMeException
import com.desmoines.aipulse.data.repository.SurpriseMeRepository
import com.desmoines.aipulse.util.SoftPaywallService
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

@Immutable
data class SurpriseMeUiState(
    val isRolling: Boolean = true,
    val pick: SurprisePick? = null,
    val errorMessage: String? = null,
    val rollCount: Int = 0,
    /** One-shot: a save succeeded (or hit the cap) — the screen should dismiss. */
    val dismiss: Boolean = false,
)

/**
 * Surprise Me single-pick engine (ANDP-024). Rolls a curated pick from
 * get_surprise_pick, tracks shown/saved/tried_another/opened outcomes, and saves
 * to favorites (cap → silent dismiss + soft paywall). Mirrors iOS SurpriseMeView.
 */
@HiltViewModel
class SurpriseMeViewModel @Inject constructor(
    private val repository: SurpriseMeRepository,
    private val favoritesRepository: FavoritesRepository,
    private val authRepository: AuthRepository,
    private val softPaywallService: SoftPaywallService,
) : ViewModel() {

    private val _uiState = MutableStateFlow(SurpriseMeUiState())
    val uiState: StateFlow<SurpriseMeUiState> = _uiState.asStateFlow()

    private var favoriteEventIds: Set<String> = emptySet()
    private var favoriteRestaurantIds: Set<String> = emptySet()

    init {
        loadFavorites()
        roll()
    }

    private fun loadFavorites() {
        val userId = authRepository.currentUserId ?: return
        viewModelScope.launch {
            favoritesRepository.loadFavorites(userId).onSuccess { state ->
                favoriteEventIds = state.favoriteEventIds
                favoriteRestaurantIds = state.favoriteRestaurantIds
            }
        }
    }

    fun roll() {
        _uiState.update { it.copy(isRolling = true, pick = null, errorMessage = null) }
        viewModelScope.launch {
            repository.surprise()
                .onSuccess { pick ->
                    _uiState.update { it.copy(isRolling = false, pick = pick, errorMessage = null) }
                    launch { repository.track(pick, OUTCOME_SHOWN) }
                }
                .onFailure { error ->
                    _uiState.update {
                        it.copy(
                            isRolling = false,
                            pick = null,
                            errorMessage = (error as? SurpriseMeException)?.message
                                ?: "Couldn't roll a pick. Check your connection and try again.",
                        )
                    }
                }
        }
    }

    /** Reroll, tracking the dismissed pick as tried_another. */
    fun tryAnother() {
        _uiState.value.pick?.let { dismissed ->
            viewModelScope.launch { repository.track(dismissed, OUTCOME_TRIED_ANOTHER) }
        }
        _uiState.update { it.copy(rollCount = it.rollCount + 1) }
        roll()
    }

    /** Save the current pick to favorites; cap soft-fails to the paywall + dismisses. */
    fun save() {
        val pick = _uiState.value.pick ?: return
        val userId = authRepository.currentUserId ?: return
        viewModelScope.launch {
            val result = if (pick.isEvent) {
                favoritesRepository.toggleEventFavorite(userId, pick.itemId, favoriteEventIds)
            } else {
                favoritesRepository.toggleRestaurantFavorite(userId, pick.itemId, favoriteRestaurantIds)
            }
            result
                .onSuccess {
                    repository.track(pick, OUTCOME_SAVED)
                    _uiState.update { it.copy(dismiss = true) }
                }
                .onFailure { error ->
                    if (error is FavoritesException.LimitReached) {
                        // Silent: let the app paywall surface, then dismiss.
                        softPaywallService.maybePresent(PaywallContext.FAVORITES)
                        _uiState.update { it.copy(dismiss = true) }
                    }
                }
        }
    }

    /** Opening the pick's detail records a weaker positive signal. */
    fun onOpened() {
        _uiState.value.pick?.let { pick ->
            viewModelScope.launch { repository.track(pick, OUTCOME_OPENED) }
        }
    }

    fun consumeDismiss() = _uiState.update { it.copy(dismiss = false) }

    companion object {
        private const val OUTCOME_SHOWN = "shown"
        private const val OUTCOME_SAVED = "saved"
        private const val OUTCOME_TRIED_ANOTHER = "tried_another"
        private const val OUTCOME_OPENED = "opened"
    }
}
