package com.desmoines.aipulse.ui.screens.bestof

import androidx.compose.runtime.Immutable
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.desmoines.aipulse.data.model.LeaderboardEntry
import com.desmoines.aipulse.data.model.Nominee
import com.desmoines.aipulse.data.model.VotingCategory
import com.desmoines.aipulse.data.repository.AuthRepository
import com.desmoines.aipulse.data.repository.BestOfRepository
import com.desmoines.aipulse.data.repository.BestOfWinnersStore
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

@Immutable
data class BestOfCategoryUiState(
    val category: VotingCategory? = null,
    val isAuthenticated: Boolean = false,
    val currentVoteLabel: String? = null,
    val yourPickKey: String? = null,
    val searchText: String = "",
    val results: List<Nominee> = emptyList(),
    val isSearching: Boolean = false,
    val isWriteIn: Boolean = false,
    val writeInText: String = "",
    val isCasting: Boolean = false,
    val isLoading: Boolean = true,
    val leaderboard: List<LeaderboardEntry> = emptyList(),
    val isLeaderboardLoading: Boolean = false,
    val errorMessage: String? = null,
) {
    val hasVoted: Boolean get() = currentVoteLabel != null
    val canSubmitWriteIn: Boolean get() = writeInText.trim().isNotEmpty() && !isCasting
    val totalVotes: Int get() = leaderboard.sumOf { it.voteCount }
}

/**
 * Best Of voting booth + live leaderboard (ANDP-038 / ANDP-039). Casting needs
 * auth (soft funnel, no hard paywall) and is one atomic upsert on
 * (category_id, user_id). Standings update optimistically and revert on
 * failure. Mirrors iOS BestOfCategoryView + leaderboard.
 */
@HiltViewModel
class BestOfCategoryViewModel @Inject constructor(
    private val repository: BestOfRepository,
    private val authRepository: AuthRepository,
    private val winnersStore: BestOfWinnersStore,
) : ViewModel() {

    private val _uiState = MutableStateFlow(BestOfCategoryUiState())
    val uiState: StateFlow<BestOfCategoryUiState> = _uiState.asStateFlow()

    private var categoryId: String? = null
    private var searchJob: Job? = null

    fun load(categoryId: String) {
        this.categoryId = categoryId
        val userId = authRepository.currentUserId
        _uiState.update { it.copy(isLoading = true, isAuthenticated = userId != null, errorMessage = null) }
        viewModelScope.launch {
            val category = repository.fetchCategory(categoryId).getOrNull()
            _uiState.update { it.copy(category = category, isLoading = false) }
            if (userId != null) refreshUserVote(categoryId, userId)
            refreshLeaderboard(categoryId)
        }
    }

    private suspend fun refreshUserVote(categoryId: String, userId: String) {
        val vote = repository.fetchUserVote(categoryId, userId).getOrNull()
        val label = when {
            vote == null -> null
            vote.isCustom -> vote.customEntry
            vote.entityId != null -> repository.resolveEntityName(vote.entityType, vote.entityId) ?: "your pick"
            else -> "your pick"
        }
        val key = when {
            vote == null -> null
            vote.entityId != null -> vote.entityId
            else -> "custom:${vote.customEntry?.trim()?.lowercase().orEmpty()}"
        }
        _uiState.update { it.copy(currentVoteLabel = label, yourPickKey = key) }
    }

    private suspend fun refreshLeaderboard(categoryId: String) {
        _uiState.update { it.copy(isLeaderboardLoading = it.leaderboard.isEmpty()) }
        repository.fetchResults(categoryId)
            .onSuccess { res -> _uiState.update { it.copy(leaderboard = res, isLeaderboardLoading = false) } }
            .onFailure { _uiState.update { it.copy(isLeaderboardLoading = false) } }
    }

    fun onSearchTextChanged(text: String) {
        _uiState.update { it.copy(searchText = text) }
        searchJob?.cancel()
        val query = text.trim()
        if (query.length < MIN_QUERY) {
            _uiState.update { it.copy(results = emptyList(), isSearching = false) }
            return
        }
        searchJob = viewModelScope.launch {
            delay(SEARCH_DEBOUNCE_MS)
            _uiState.update { it.copy(isSearching = true) }
            repository.searchNominees(query)
                .onSuccess { nominees -> _uiState.update { it.copy(results = nominees, isSearching = false) } }
                .onFailure { _uiState.update { it.copy(isSearching = false) } }
        }
    }

    fun toggleWriteIn() {
        _uiState.update { it.copy(isWriteIn = !it.isWriteIn) }
    }

    fun onWriteInChanged(text: String) {
        _uiState.update { it.copy(writeInText = text) }
    }

    fun voteFor(nominee: Nominee) {
        cast(entityType = nominee.entityType, entityId = nominee.id, customEntry = null, label = nominee.name)
    }

    fun submitWriteIn() {
        val entry = _uiState.value.writeInText.trim()
        if (entry.isEmpty()) return
        cast(entityType = "custom", entityId = null, customEntry = entry, label = entry)
    }

    private fun cast(entityType: String, entityId: String?, customEntry: String?, label: String) {
        val catId = categoryId ?: return
        val userId = authRepository.currentUserId ?: return
        if (_uiState.value.isCasting) return

        val snapshot = _uiState.value
        val newKey = entityId ?: "custom:${customEntry?.trim()?.lowercase().orEmpty()}"
        val optimisticBoard = applyOptimistic(snapshot, newKey, entityType, entityId, customEntry, label)

        _uiState.update {
            it.copy(
                isCasting = true,
                errorMessage = null,
                currentVoteLabel = label,
                yourPickKey = newKey,
                leaderboard = optimisticBoard,
                searchText = "",
                results = emptyList(),
            )
        }

        viewModelScope.launch {
            repository.castVote(catId, userId, entityType, entityId, customEntry)
                .onSuccess {
                    _uiState.update { it.copy(isCasting = false, isWriteIn = false, writeInText = "") }
                    // Reconcile with authoritative counts/images, then refresh winner badges.
                    refreshLeaderboard(catId)
                    winnersStore.refresh()
                }
                .onFailure {
                    // Revert to the pre-cast snapshot.
                    _uiState.value = snapshot.copy(
                        isCasting = false,
                        errorMessage = "Couldn't record your vote. Please try again.",
                    )
                }
        }
    }

    /** Optimistic standings: decrement the old pick, increment/insert the new, re-sort. */
    private fun applyOptimistic(
        state: BestOfCategoryUiState,
        newKey: String,
        entityType: String,
        entityId: String?,
        customEntry: String?,
        label: String,
    ): List<LeaderboardEntry> {
        val old = state.yourPickKey
        if (old == newKey) return state.leaderboard // re-affirming the same pick: no count change

        val list = state.leaderboard.toMutableList()
        if (old != null) {
            val idx = list.indexOfFirst { it.key == old }
            if (idx >= 0) {
                val e = list[idx]
                if (e.voteCount <= 1) list.removeAt(idx) else list[idx] = e.copy(voteCount = e.voteCount - 1)
            }
        }
        val idx = list.indexOfFirst { it.key == newKey }
        if (idx >= 0) {
            val e = list[idx]
            list[idx] = e.copy(voteCount = e.voteCount + 1)
        } else {
            list.add(LeaderboardEntry(newKey, entityType, entityId, customEntry, label, null, 1))
        }
        return list.sortedWith(compareByDescending<LeaderboardEntry> { it.voteCount }.thenBy { it.name.lowercase() })
    }

    fun retry() {
        categoryId?.let { load(it) }
    }

    fun consumeError() {
        _uiState.update { it.copy(errorMessage = null) }
    }

    companion object {
        private const val MIN_QUERY = 2
        private const val SEARCH_DEBOUNCE_MS = 300L
    }
}
