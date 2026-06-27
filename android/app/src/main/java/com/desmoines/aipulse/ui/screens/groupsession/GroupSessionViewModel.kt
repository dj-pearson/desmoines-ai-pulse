package com.desmoines.aipulse.ui.screens.groupsession

import androidx.compose.runtime.Immutable
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.desmoines.aipulse.data.model.ActiveGroupSession
import com.desmoines.aipulse.data.model.SessionParticipant
import com.desmoines.aipulse.data.model.SwipeSession
import com.desmoines.aipulse.data.model.SwipeSessionMatch
import com.desmoines.aipulse.data.repository.AuthRepository
import com.desmoines.aipulse.data.repository.GroupSessionManager
import com.desmoines.aipulse.data.repository.GroupSessionRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

@Immutable
data class GroupSessionUiState(
    val isAuthenticated: Boolean = false,
    val session: SwipeSession? = null,
    val isHost: Boolean = false,
    val participants: List<SessionParticipant> = emptyList(),
    val matches: List<SwipeSessionMatch> = emptyList(),
    val joinCode: String = "",
    val selectedMode: String = "mixed",
    val isCreating: Boolean = false,
    val isJoining: Boolean = false,
    val isRefreshing: Boolean = false,
    val errorMessage: String? = null,
) {
    val inSession: Boolean get() = session != null
    val isEnded: Boolean get() = session?.let { it.isEnded || it.isExpired() } == true
    val canJoin: Boolean get() = joinCode.trim().length >= 4 && !isJoining
}

/**
 * Group swipe sessions (ANDP-023): host or join a shared session, see who's in,
 * and view items everyone liked. Hosting/joining needs auth (free). Matches
 * come from get_swipe_session_matches. Mirrors iOS GroupSessionView.
 */
@HiltViewModel
class GroupSessionViewModel @Inject constructor(
    private val repository: GroupSessionRepository,
    private val authRepository: AuthRepository,
    private val groupSessionManager: GroupSessionManager,
) : ViewModel() {

    private val _uiState = MutableStateFlow(GroupSessionUiState())
    val uiState: StateFlow<GroupSessionUiState> = _uiState.asStateFlow()

    val modes = listOf("mixed", "events", "restaurants")

    init {
        _uiState.update { it.copy(isAuthenticated = authRepository.currentUserId != null) }
        // Restore an in-progress session if this device already joined one.
        groupSessionManager.activeSession?.let { active ->
            _uiState.update { it.copy(isHost = active.isHost) }
            loadLobby(active.sessionId)
        }
    }

    fun onModeSelected(mode: String) {
        _uiState.update { it.copy(selectedMode = mode) }
    }

    fun onJoinCodeChanged(code: String) {
        _uiState.update { it.copy(joinCode = code.uppercase()) }
    }

    fun createSession() {
        val userId = authRepository.currentUserId ?: return
        if (_uiState.value.isCreating) return
        _uiState.update { it.copy(isCreating = true, errorMessage = null) }
        viewModelScope.launch {
            repository.createSession(userId, _uiState.value.selectedMode)
                .onSuccess { session ->
                    groupSessionManager.setActive(ActiveGroupSession(session.id, session.code, session.mode, isHost = true))
                    _uiState.update { it.copy(session = session, isHost = true, isCreating = false) }
                    loadLobby(session.id)
                }
                .onFailure {
                    _uiState.update { it.copy(isCreating = false, errorMessage = "Couldn't start a session. Please try again.") }
                }
        }
    }

    fun joinSession() {
        val userId = authRepository.currentUserId ?: return
        val code = _uiState.value.joinCode.trim()
        if (code.isEmpty() || _uiState.value.isJoining) return
        _uiState.update { it.copy(isJoining = true, errorMessage = null) }
        viewModelScope.launch {
            repository.joinByCode(code, userId, displayName = null)
                .onSuccess { session ->
                    val host = session.hostUserId == userId
                    groupSessionManager.setActive(ActiveGroupSession(session.id, session.code, session.mode, isHost = host))
                    _uiState.update { it.copy(session = session, isHost = host, isJoining = false) }
                    loadLobby(session.id)
                }
                .onFailure { e ->
                    _uiState.update { it.copy(isJoining = false, errorMessage = e.message ?: "Couldn't join that session.") }
                }
        }
    }

    fun refresh() {
        val sessionId = _uiState.value.session?.id ?: return
        _uiState.update { it.copy(isRefreshing = true) }
        loadLobby(sessionId, refreshing = true)
    }

    private fun loadLobby(sessionId: String, refreshing: Boolean = false) {
        viewModelScope.launch {
            val session = repository.fetchSession(sessionId).getOrNull()
            val participants = repository.fetchParticipants(sessionId).getOrDefault(emptyList())
            val matches = repository.fetchMatches(sessionId).getOrDefault(emptyList())
            _uiState.update {
                it.copy(
                    session = session ?: it.session,
                    participants = participants,
                    matches = matches,
                    isRefreshing = false,
                )
            }
        }
    }

    fun endSession() {
        val session = _uiState.value.session ?: return
        if (!_uiState.value.isHost) return
        viewModelScope.launch {
            repository.endSession(session.id)
                .onSuccess { refresh() }
                .onFailure { _uiState.update { it.copy(errorMessage = "Couldn't end the session.") } }
        }
    }

    /** Leaves the session locally (clears swipe tagging) and returns to the start. */
    fun leaveSession() {
        groupSessionManager.clear()
        _uiState.update {
            GroupSessionUiState(isAuthenticated = it.isAuthenticated, selectedMode = it.selectedMode)
        }
    }

    fun clearError() {
        _uiState.update { it.copy(errorMessage = null) }
    }
}
