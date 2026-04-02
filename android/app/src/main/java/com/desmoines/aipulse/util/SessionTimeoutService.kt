package com.desmoines.aipulse.util

import android.app.Activity
import android.app.Application
import android.os.Bundle
import dagger.hilt.android.qualifiers.ApplicationContext
import android.content.Context
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Tracks user activity and enforces session timeouts.
 * Mirrors backend session_policies table (idle + absolute timeouts).
 *
 * - Regular users: 60-min idle timeout, 8-hour absolute timeout
 * - Admin users: 30-min idle timeout, 4-hour absolute timeout
 *
 * Resets idle timer on app resume (lifecycle activity callback).
 * Persists last activity timestamp in SecureStorage for app restart scenarios.
 */
@Singleton
class SessionTimeoutService @Inject constructor(
    @param:ApplicationContext private val context: Context,
    private val secureStorage: SecureStorage,
) {

    companion object {
        private const val KEY_LAST_ACTIVITY = "session_last_activity"
        private const val KEY_SESSION_START = "session_start_time"

        // User timeouts
        private const val USER_IDLE_TIMEOUT_MS = 60L * 60 * 1000       // 60 minutes
        private const val USER_ABSOLUTE_TIMEOUT_MS = 8L * 60 * 60 * 1000 // 8 hours

        // Admin timeouts (stricter)
        private const val ADMIN_IDLE_TIMEOUT_MS = 30L * 60 * 1000      // 30 minutes
        private const val ADMIN_ABSOLUTE_TIMEOUT_MS = 4L * 60 * 60 * 1000 // 4 hours

        // Warning before expiry
        private const val WARNING_BEFORE_MS = 5L * 60 * 1000           // 5 minutes

        // Check interval
        private const val CHECK_INTERVAL_MS = 30_000L                  // 30 seconds
    }

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main)
    private var checkJob: Job? = null
    private var isAdmin = false
    private var isActive = false

    private val _sessionState = MutableStateFlow(SessionState.ACTIVE)
    val sessionState: StateFlow<SessionState> = _sessionState.asStateFlow()

    private val _minutesRemaining = MutableStateFlow<Int?>(null)
    val minutesRemaining: StateFlow<Int?> = _minutesRemaining.asStateFlow()

    enum class SessionState {
        ACTIVE,
        WARNING,
        EXPIRED,
    }

    private val activityCallbacks = object : Application.ActivityLifecycleCallbacks {
        override fun onActivityResumed(activity: Activity) {
            recordActivity()
        }
        override fun onActivityCreated(activity: Activity, savedInstanceState: Bundle?) {}
        override fun onActivityStarted(activity: Activity) {}
        override fun onActivityPaused(activity: Activity) {}
        override fun onActivityStopped(activity: Activity) {}
        override fun onActivitySaveInstanceState(activity: Activity, outState: Bundle) {}
        override fun onActivityDestroyed(activity: Activity) {}
    }

    /**
     * Start tracking session timeouts. Call after successful authentication.
     *
     * @param isAdminUser Whether the authenticated user has admin role
     */
    fun startTracking(isAdminUser: Boolean) {
        isAdmin = isAdminUser
        isActive = true

        val now = System.currentTimeMillis()
        secureStorage.saveLong(KEY_SESSION_START, now)
        recordActivity()

        // Register lifecycle callbacks
        (context.applicationContext as? Application)?.registerActivityLifecycleCallbacks(activityCallbacks)

        // Start periodic timeout checks
        checkJob?.cancel()
        checkJob = scope.launch {
            while (isActive) {
                checkTimeouts()
                delay(CHECK_INTERVAL_MS)
            }
        }

        AppLogger.auth.info("Session timeout tracking started (admin=$isAdminUser)")
    }

    /**
     * Stop tracking session timeouts. Call on sign out.
     */
    fun stopTracking() {
        isActive = false
        checkJob?.cancel()
        checkJob = null
        _sessionState.value = SessionState.ACTIVE
        _minutesRemaining.value = null

        secureStorage.delete(KEY_LAST_ACTIVITY)
        secureStorage.delete(KEY_SESSION_START)

        (context.applicationContext as? Application)?.unregisterActivityLifecycleCallbacks(activityCallbacks)

        AppLogger.auth.info("Session timeout tracking stopped")
    }

    /**
     * Record user activity (resets idle timer).
     */
    fun recordActivity() {
        secureStorage.saveLong(KEY_LAST_ACTIVITY, System.currentTimeMillis())
        if (_sessionState.value == SessionState.WARNING) {
            _sessionState.value = SessionState.ACTIVE
            _minutesRemaining.value = null
        }
    }

    /**
     * Check if the session has timed out on app restart.
     * Returns true if the session is still valid.
     */
    fun isSessionValid(): Boolean {
        val lastActivity = secureStorage.loadLong(KEY_LAST_ACTIVITY)
        val sessionStart = secureStorage.loadLong(KEY_SESSION_START)

        if (lastActivity == 0L || sessionStart == 0L) return true // No tracking data

        val now = System.currentTimeMillis()
        val idleTimeout = if (isAdmin) ADMIN_IDLE_TIMEOUT_MS else USER_IDLE_TIMEOUT_MS
        val absoluteTimeout = if (isAdmin) ADMIN_ABSOLUTE_TIMEOUT_MS else USER_ABSOLUTE_TIMEOUT_MS

        val idleExpired = (now - lastActivity) > idleTimeout
        val absoluteExpired = (now - sessionStart) > absoluteTimeout

        return !idleExpired && !absoluteExpired
    }

    private fun checkTimeouts() {
        val lastActivity = secureStorage.loadLong(KEY_LAST_ACTIVITY)
        val sessionStart = secureStorage.loadLong(KEY_SESSION_START)
        val now = System.currentTimeMillis()

        if (lastActivity == 0L || sessionStart == 0L) return

        val idleTimeout = if (isAdmin) ADMIN_IDLE_TIMEOUT_MS else USER_IDLE_TIMEOUT_MS
        val absoluteTimeout = if (isAdmin) ADMIN_ABSOLUTE_TIMEOUT_MS else USER_ABSOLUTE_TIMEOUT_MS

        val idleElapsed = now - lastActivity
        val absoluteElapsed = now - sessionStart

        // Check absolute timeout first (non-resettable)
        if (absoluteElapsed >= absoluteTimeout) {
            _sessionState.value = SessionState.EXPIRED
            AppLogger.auth.warning("Session expired: absolute timeout reached")
            return
        }

        // Check idle timeout
        if (idleElapsed >= idleTimeout) {
            _sessionState.value = SessionState.EXPIRED
            AppLogger.auth.warning("Session expired: idle timeout reached")
            return
        }

        // Check warning threshold
        val idleRemaining = idleTimeout - idleElapsed
        val absoluteRemaining = absoluteTimeout - absoluteElapsed
        val minRemaining = minOf(idleRemaining, absoluteRemaining)

        if (minRemaining <= WARNING_BEFORE_MS) {
            _sessionState.value = SessionState.WARNING
            _minutesRemaining.value = (minRemaining / 60_000).toInt().coerceAtLeast(1)
        } else {
            _sessionState.value = SessionState.ACTIVE
            _minutesRemaining.value = null
        }
    }
}
