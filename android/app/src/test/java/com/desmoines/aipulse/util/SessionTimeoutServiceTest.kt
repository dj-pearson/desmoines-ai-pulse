package com.desmoines.aipulse.util

import android.content.Context
import io.mockk.every
import io.mockk.mockk
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

/**
 * Covers the app-restart guard (AND-AUDIT-006).
 *
 * isSessionValid() is what stops a session that expired while the app was
 * closed from being silently renewed on next launch, because startTracking()
 * resets the idle timer the moment it runs. It had no callers and no tests; now
 * it gates startTracking() in AuthViewModel, so the ordering it depends on is
 * worth pinning.
 *
 * Timeouts are the admin policy: 30 minutes idle, 4 hours absolute.
 */
class SessionTimeoutServiceTest {

    private val secureStorage: SecureStorage = mockk(relaxed = true)
    private val context: Context = mockk(relaxed = true)
    private val service = SessionTimeoutService(context, secureStorage)

    private val minute = 60L * 1000
    private val hour = 60 * minute

    private fun storedSession(lastActivityAgoMs: Long, startedAgoMs: Long) {
        val now = System.currentTimeMillis()
        every { secureStorage.loadLong("session_last_activity", any()) } returns now - lastActivityAgoMs
        every { secureStorage.loadLong("session_start_time", any()) } returns now - startedAgoMs
    }

    @Test
    fun `a session used a moment ago is valid`() {
        storedSession(lastActivityAgoMs = minute, startedAgoMs = hour)
        assertTrue(service.isSessionValid())
    }

    @Test
    fun `idle past thirty minutes is not valid`() {
        storedSession(lastActivityAgoMs = 31 * minute, startedAgoMs = hour)
        assertFalse(service.isSessionValid())
    }

    @Test
    fun `just inside the idle limit is still valid`() {
        storedSession(lastActivityAgoMs = 29 * minute, startedAgoMs = hour)
        assertTrue(service.isSessionValid())
    }

    @Test
    fun `the absolute limit is not resettable by recent activity`() {
        // Active seconds ago, but signed in five hours back. The absolute
        // timeout is the one a busy admin cannot keep pushing out.
        storedSession(lastActivityAgoMs = 10 * 1000, startedAgoMs = 5 * hour)
        assertFalse(service.isSessionValid())
    }

    @Test
    fun `no stored session is treated as valid`() {
        // loadLong returns 0 for an absent key. Nothing has been tracked, so
        // there is nothing to have expired -- failing closed here would sign out
        // every user who never had a tracked session in the first place.
        every { secureStorage.loadLong(any(), any()) } returns 0L
        assertTrue(service.isSessionValid())
    }
}
