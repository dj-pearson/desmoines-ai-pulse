package com.desmoines.aipulse.ui.screens

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.desmoines.aipulse.data.repository.AuthRepository
import com.desmoines.aipulse.util.AppLogger
import com.desmoines.aipulse.util.SessionTimeoutService
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

/**
 * Surfaces [SessionTimeoutService] to the UI and acts on expiry.
 *
 * The service computed WARNING and EXPIRED and published `minutesRemaining`,
 * and nothing observed any of it (AND-AUDIT-006). This is the observer: it
 * drives the warning banner, and on EXPIRED it signs the admin out.
 */
@HiltViewModel
class SessionTimeoutViewModel @Inject constructor(
    private val sessionTimeoutService: SessionTimeoutService,
    private val authRepository: AuthRepository,
) : ViewModel() {

    val sessionState: StateFlow<SessionTimeoutService.SessionState> =
        sessionTimeoutService.sessionState

    val minutesRemaining: StateFlow<Int?> = sessionTimeoutService.minutesRemaining

    /**
     * Set once the session has been ended by a timeout, so the UI can say why
     * the user was signed out rather than dumping them at the auth screen with
     * no explanation. Cleared by [acknowledgeExpiry].
     */
    private val _expiredNotice = MutableStateFlow(false)
    val expiredNotice: StateFlow<Boolean> = _expiredNotice.asStateFlow()

    init {
        viewModelScope.launch {
            sessionTimeoutService.sessionState.collect { state ->
                if (state != SessionTimeoutService.SessionState.EXPIRED) return@collect
                AppLogger.auth.info("Admin session expired; signing out")
                _expiredNotice.value = true
                // AuthRepository.signOut() runs SignOutCleaner.tearDown(), which
                // calls stopTracking() -- so this does not re-enter.
                authRepository.signOut()
            }
        }
    }

    /**
     * Resets the idle timer. Called on navigation and when the user dismisses
     * the warning banner, both of which are someone actively using the app.
     */
    fun recordActivity() {
        sessionTimeoutService.recordActivity()
    }

    fun acknowledgeExpiry() {
        _expiredNotice.value = false
    }
}
