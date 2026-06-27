package com.desmoines.aipulse.data.repository

import com.desmoines.aipulse.data.model.ActiveGroupSession
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Holds the group swipe session this device is currently part of, so the
 * Discover deck can scope its swipes to it (every recorded swipe is tagged
 * with [ActiveGroupSession.sessionId]). Mirrors iOS SwipeSessionService's
 * active-session state.
 */
@Singleton
class GroupSessionManager @Inject constructor() {

    private val _active = MutableStateFlow<ActiveGroupSession?>(null)
    val active: StateFlow<ActiveGroupSession?> = _active.asStateFlow()

    /** Current active session snapshot, or null when not in a session. */
    val activeSession: ActiveGroupSession? get() = _active.value

    /** The active session id used to tag swipes, or null when not in a session. */
    val activeSessionId: String? get() = _active.value?.sessionId

    fun setActive(session: ActiveGroupSession) {
        _active.value = session
    }

    fun clear() {
        _active.value = null
    }
}
