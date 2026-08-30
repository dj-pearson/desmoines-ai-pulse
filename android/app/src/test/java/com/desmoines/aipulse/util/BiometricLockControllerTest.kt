package com.desmoines.aipulse.util

import io.mockk.every
import io.mockk.mockk
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test

/**
 * The lock has to survive a background cycle (AND-AUDIT-007 AC1, AC2).
 *
 * AC6 is explicit that the prompt itself can only be verified on a device. The
 * decision of WHETHER to re-raise the lock is the half that can be verified here,
 * and it is the half that was wrong: the gate lived in LaunchedEffect(Unit), so
 * it ran once per composition and the app stayed unlocked forever after the first
 * unlock.
 */
class BiometricLockControllerTest {

    private lateinit var biometric: BiometricAuthService

    @BeforeEach
    fun setup() {
        biometric = mockk(relaxed = true)
        every { biometric.isEnabled } returns true
        every { biometric.canUnlock } returns true
    }

    private fun controller() = BiometricLockController(biometric)

    // MARK: - shouldRelock, the pure decision

    @Test
    fun `returning from the background re-locks`() {
        assertTrue(BiometricLockController.shouldRelock(enabled = true, backgroundedAt = 1_000L, now = 1_000L))
    }

    @Test
    fun `a foreground event with no background before it does not lock`() {
        // A configuration change or the very first start. Locking here would
        // double-prompt on rotation.
        assertFalse(BiometricLockController.shouldRelock(enabled = true, backgroundedAt = null, now = 5_000L))
    }

    @Test
    fun `the lock being off means never`() {
        assertFalse(BiometricLockController.shouldRelock(enabled = false, backgroundedAt = 1_000L, now = 9_000L))
    }

    @Test
    fun `a grace period, if one is ever set, is honoured in both directions`() {
        // RELOCK_GRACE_MILLIS is 0 today and that is a decision, not an
        // oversight - see the class comment. This asserts the mechanism works so
        // raising it stays a one-line change.
        val grace = 30_000L
        assertFalse(
            BiometricLockController.shouldRelock(true, backgroundedAt = 0L, now = 29_999L, graceMillis = grace),
        )
        assertTrue(
            BiometricLockController.shouldRelock(true, backgroundedAt = 0L, now = 30_000L, graceMillis = grace),
        )
    }

    @Test
    fun `the shipped grace period is zero`() {
        assertTrue(BiometricLockController.shouldRelock(enabled = true, backgroundedAt = 100L, now = 100L))
    }

    // MARK: - The controller

    @Test
    fun `cold start locks when the lock is on`() {
        val c = controller()
        c.lockOnLaunch()
        assertTrue(c.isLocked.value)
    }

    @Test
    fun `cold start does not lock when the lock is off`() {
        every { biometric.isEnabled } returns false
        val c = controller()
        c.lockOnLaunch()
        assertFalse(c.isLocked.value)
    }

    @Test
    fun `a device that cannot present any prompt is never locked`() {
        // Locking a device with no working sensor and no PIN would strand the
        // user on a screen whose only other exit is signing out.
        every { biometric.canUnlock } returns false
        val c = controller()
        c.lockOnLaunch()
        assertFalse(c.isLocked.value)
    }

    @Test
    fun `unlocking then backgrounding then returning locks again`() {
        val c = controller()
        c.lockOnLaunch()
        c.onUnlocked()
        assertFalse(c.isLocked.value)

        c.onEnteredBackground(now = 1_000L)
        c.onEnteredForeground(now = 2_000L)

        // This is the bug the story is about, stated as an assertion.
        assertTrue(c.isLocked.value, "the app stayed unlocked across a background cycle")
    }

    @Test
    fun `a foreground event without a background does not re-lock`() {
        val c = controller()
        c.onUnlocked()
        c.onEnteredForeground(now = 9_999L)
        assertFalse(c.isLocked.value)
    }

    @Test
    fun `two returns need two backgrounds`() {
        // onEnteredForeground clears the timestamp, so a second ON_START without
        // an intervening ON_STOP must not re-lock.
        val c = controller()
        c.onUnlocked()
        c.onEnteredBackground(now = 1_000L)
        c.onEnteredForeground(now = 2_000L)
        c.onUnlocked()
        c.onEnteredForeground(now = 3_000L)
        assertFalse(c.isLocked.value)
    }

    @Test
    fun `a failed attempt is surfaced and cleared on success`() {
        val c = controller()
        c.lockOnLaunch()
        c.onUnlockFailed("nope")
        assertTrue(c.isLocked.value)
        assertTrue(c.lastFailure.value == "nope")

        c.onUnlocked()
        assertNull(c.lastFailure.value)
    }

    @Test
    fun `signing out releases the lock`() {
        // AC3's escape. Leaving it up after the session ends strands the user on
        // a lock screen protecting nothing.
        val c = controller()
        c.lockOnLaunch()
        c.onUnlockFailed("sensor failed")

        c.releaseForSignOut()

        assertFalse(c.isLocked.value)
        assertNull(c.lastFailure.value)
    }

    @Test
    fun `a stale failure message does not survive a re-lock`() {
        val c = controller()
        c.onUnlocked()
        c.onUnlockFailed("old news")
        c.onEnteredBackground(now = 1_000L)
        c.onEnteredForeground(now = 2_000L)

        assertTrue(c.isLocked.value)
        assertNull(c.lastFailure.value, "the new lock screen opened showing the last session's error")
    }
}
