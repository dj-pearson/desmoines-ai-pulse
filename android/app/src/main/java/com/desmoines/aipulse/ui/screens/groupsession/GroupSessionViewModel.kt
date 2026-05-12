package com.desmoines.aipulse.ui.screens.groupsession

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.desmoines.aipulse.data.remote.SupabaseClientProvider
import com.desmoines.aipulse.data.remote.SwipeSessionService
import dagger.hilt.android.lifecycle.HiltViewModel
import io.github.jan.supabase.auth.auth
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

data class GroupSessionState(
    val isAuthenticated: Boolean = false,
    val isWorking: Boolean = false,
    val joinCode: String = "",
    val hostedSession: SwipeSessionService.Session? = null,
    val errorMessage: String? = null,
)

@HiltViewModel
class GroupSessionViewModel @Inject constructor(
    private val service: SwipeSessionService,
) : ViewModel() {

    private val _state = MutableStateFlow(GroupSessionState(isAuthenticated = computeAuth()))
    val state: StateFlow<GroupSessionState> = _state.asStateFlow()

    private fun computeAuth(): Boolean =
        runCatching { SupabaseClientProvider.client?.auth?.currentSessionOrNull() != null }
            .getOrDefault(false)

    fun setJoinCode(code: String) {
        _state.update { it.copy(joinCode = code) }
    }

    fun startHosting() {
        if (_state.value.isWorking) return
        _state.update { it.copy(isWorking = true, errorMessage = null) }
        viewModelScope.launch {
            try {
                val session = service.startSession()
                _state.update { it.copy(hostedSession = session, isWorking = false) }
            } catch (e: Exception) {
                _state.update { it.copy(isWorking = false, errorMessage = e.message ?: "Failed to host") }
            }
        }
    }

    fun endHosting() {
        val session = _state.value.hostedSession ?: return
        _state.update { it.copy(isWorking = true) }
        viewModelScope.launch {
            try {
                service.endSession(session)
                _state.update { GroupSessionState(isAuthenticated = computeAuth()) }
            } catch (e: Exception) {
                _state.update { it.copy(isWorking = false, errorMessage = e.message ?: "Failed to end session") }
            }
        }
    }

    fun join(onJoined: () -> Unit) {
        val code = _state.value.joinCode.trim()
        if (code.isEmpty()) return
        _state.update { it.copy(isWorking = true, errorMessage = null) }
        viewModelScope.launch {
            try {
                val session = service.lookupSession(byCode = code)
                service.join(session)
                _state.update { it.copy(isWorking = false) }
                onJoined()
            } catch (e: Exception) {
                _state.update { it.copy(isWorking = false, errorMessage = e.message ?: "Couldn't join session") }
            }
        }
    }
}
