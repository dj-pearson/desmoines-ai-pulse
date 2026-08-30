package com.desmoines.aipulse.util

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Holds the biometric lock state across the process lifetime (AND-AUDIT-007).
 *
 * The lock used to be raised inside `LaunchedEffect(Unit)` in MainActivity, which
 * runs once per composition. Background the app, come back, and it stayed
 * unlocked - so after the first unlock the protection was theatre. Everything
 * this class exists for is the "come back" half.
 *
 * WHY ON_STOP AND NOT ON_PAUSE, which is also the answer to the grace period AC2
 * asks about. ON_PAUSE fires for things that are not backgrounding: a dialog over
 * the activity, the biometric prompt itself. ON_STOP fires when the activity is
 * genuinely no longer visible, and pulling down the notification shade does not
 * stop the activity on modern Android. So the case the grace period was meant to
 * protect against - re-prompting after a glance at the shade - does not arise,
 * and RELOCK_GRACE_MILLIS is 0.
 *
 * That also matches iOS, which re-locks on a real `.background` and deliberately
 * ignores transient `.inactive` (IOS-AUDIT-SEC-016). Two clients with different
 * lock strengths would be the worse outcome. The constant is here, and read by a
 * pure function, so raising it is one line and one test if that call changes.
 */
@Singleton
class BiometricLockController @Inject constructor(
    private val biometricAuthService: BiometricAuthService,
) {

    companion object {
        /**
         * How long after backgrounding the app stays unlocked.
         *
         * Zero, deliberately - see the class comment. Not a placeholder.
         */
        const val RELOCK_GRACE_MILLIS = 0L

        /**
         * Whether returning to the foreground should re-raise the lock.
         *
         * Pure so the decision can be tested without a device, which matters
         * because AC6 of AND-AUDIT-007 is explicit that the prompt itself can
         * only be verified by hand. This is the part that can be verified.
         */
        fun shouldRelock(
            enabled: Boolean,
            backgroundedAt: Long?,
            now: Long,
            graceMillis: Long = RELOCK_GRACE_MILLIS,
        ): Boolean {
            if (!enabled) return false
            // Never backgrounded: a foreground event with no matching background
            // is a configuration change or the first start, not a return.
            val since = backgroundedAt ?: return false
            return now - since >= graceMillis
        }
    }

    private val _isLocked = MutableStateFlow(false)
    val isLocked: StateFlow<Boolean> = _isLocked.asStateFlow()

    /** Set when the last unlock attempt failed, so the lock screen can say so. */
    private val _lastFailure = MutableStateFlow<String?>(null)
    val lastFailure: StateFlow<String?> = _lastFailure.asStateFlow()

    private var backgroundedAt: Long? = null

    /**
     * Whether the lock is configured AND the device can satisfy it.
     *
     * Both halves matter. Raising a lock on a device that cannot present a
     * prompt strands the user on a screen with no way forward, which is the
     * failure AC3 is about.
     */
    private val canLock: Boolean
        get() = biometricAuthService.isEnabled && biometricAuthService.canUnlock

    /** Cold start. Locks before any content composes, unlike the old gate. */
    fun lockOnLaunch() {
        if (canLock) _isLocked.value = true
    }

    fun onEnteredBackground(now: Long = System.currentTimeMillis()) {
        backgroundedAt = now
    }

    fun onEnteredForeground(now: Long = System.currentTimeMillis()) {
        if (shouldRelock(canLock, backgroundedAt, now)) {
            _isLocked.value = true
            _lastFailure.value = null
        }
        backgroundedAt = null
    }

    fun onUnlocked() {
        _isLocked.value = false
        _lastFailure.value = null
        backgroundedAt = null
    }

    fun onUnlockFailed(message: String) {
        _lastFailure.value = message
    }

    /**
     * Drop the lock without authenticating.
     *
     * Only for the sign-out escape (AC3): there is nothing left to protect once
     * the session is gone, and leaving the lock up would strand the user on it.
     */
    fun releaseForSignOut() {
        _isLocked.value = false
        _lastFailure.value = null
        backgroundedAt = null
    }
}
