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
 * Tracks admin activity and enforces session timeouts: 30 minutes idle,
 * 4 hours absolute.
 *
 * ADMIN SESSIONS ONLY. The backend `session_policies` table also defines a
 * 60-minute / 8-hour policy for regular users, and this class used to carry it
 * too. The client deliberately does not enforce that half (AND-AUDIT-006): this
 * is a consumer events and restaurant guide, and signing a browsing user out
 * mid-listing is a real cost against no threat model. A stale *admin* session is
 * where it actually matters. Callers gate on the admin role; [startTracking] is
 * only ever called for one.
 *
 * The idle timer is reset by [recordActivity], which callers fire on navigation
 * and on return to the foreground. Do not rely on the lifecycle callback below
 * alone: the app is single-Activity Compose, so `onActivityResumed` fires when
 * the app is re-entered and never while someone is using it. Wired to that
 * signal by itself, this class would sign an admin out mid-scroll.
 *
 * Last-activity and session-start timestamps persist in SecureStorage so
 * [isSessionValid] can catch a session that expired while the app was closed.
 */
@Singleton
class SessionTimeoutService @Inject constructor(
    @param:ApplicationContext private val context: Context,
    private val secureStorage: SecureStorage,
) {

    companion object {
        private const val KEY_LAST_ACTIVITY = "session_last_activity"
        private const val KEY_SESSION_START = "session_start_time"

        private const val IDLE_TIMEOUT_MS = 30L * 60 * 1000        // 30 minutes
        private const val ABSOLUTE_TIMEOUT_MS = 4L * 60 * 60 * 1000 // 4 hours

        // Warning before expiry
        private const val WARNING_BEFORE_MS = 5L * 60 * 1000           // 5 minutes

        // Check interval
        private const val CHECK_INTERVAL_MS = 30_000L                  // 30 seconds
    }

    // Reads and writes EncryptedSharedPreferences on every tick; the state it
    // publishes is a StateFlow, which is safe to update from any thread.
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private var checkJob: Job? = null

    // Named isTracking, not isActive. Inside scope.launch { } the lambda
    // receiver is CoroutineScope, which carries its own isActive extension
    // property, and that shadows a field of the same name -- so the loop below
    // read the coroutine's liveness and this flag was never actually consulted.
    @Volatile
    private var isTracking = false

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
     * Start tracking. Call after an authenticated user is confirmed to be an
     * admin; see the class doc for why non-admin sessions are not tracked.
     *
     * Resets the idle timer, so check [isSessionValid] first if you need to know
     * whether the previous session had already expired.
     */
    fun startTracking() {
        isTracking = true

        val now = System.currentTimeMillis()
        secureStorage.saveLong(KEY_SESSION_START, now)
        recordActivity()

        // Register lifecycle callbacks
        (context.applicationContext as? Application)?.registerActivityLifecycleCallbacks(activityCallbacks)

        // Start periodic timeout checks
        checkJob?.cancel()
        checkJob = scope.launch {
            while (isTracking) {
                checkTimeouts()
                delay(CHECK_INTERVAL_MS)
            }
        }

        AppLogger.auth.info("Admin session timeout tracking started")
    }

    /**
     * Stop tracking session timeouts. Call on sign out.
     */
    fun stopTracking() {
        isTracking = false
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
        val idleExpired = (now - lastActivity) > IDLE_TIMEOUT_MS
        val absoluteExpired = (now - sessionStart) > ABSOLUTE_TIMEOUT_MS

        return !idleExpired && !absoluteExpired
    }

    private fun checkTimeouts() {
        val lastActivity = secureStorage.loadLong(KEY_LAST_ACTIVITY)
        val sessionStart = secureStorage.loadLong(KEY_SESSION_START)
        val now = System.currentTimeMillis()

        if (lastActivity == 0L || sessionStart == 0L) return

        val idleElapsed = now - lastActivity
        val absoluteElapsed = now - sessionStart

        // Check absolute timeout first (non-resettable)
        if (absoluteElapsed >= ABSOLUTE_TIMEOUT_MS) {
            _sessionState.value = SessionState.EXPIRED
            AppLogger.auth.warning("Session expired: absolute timeout reached")
            return
        }

        // Check idle timeout
        if (idleElapsed >= IDLE_TIMEOUT_MS) {
            _sessionState.value = SessionState.EXPIRED
            AppLogger.auth.warning("Session expired: idle timeout reached")
            return
        }

        // Check warning threshold
        val idleRemaining = IDLE_TIMEOUT_MS - idleElapsed
        val absoluteRemaining = ABSOLUTE_TIMEOUT_MS - absoluteElapsed
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
