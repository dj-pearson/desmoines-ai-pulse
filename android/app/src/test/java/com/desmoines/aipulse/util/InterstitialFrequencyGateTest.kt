package com.desmoines.aipulse.util

import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class InterstitialFrequencyGateTest {

    private val caps = InterstitialCaps(
        maxPerSession = 2,
        warmupSessions = 2,
        minIntervalMs = 180_000L,
        minBoundariesBetween = 3,
    )
    private val now = 1_000_000_000L

    /** A state that satisfies every cap; individual tests violate one at a time. */
    private fun eligible() = InterstitialState(
        sessionNumber = 3,
        shownThisSession = 0,
        lastShownMs = 0L,
        boundariesSinceLastShow = 3,
    )

    @Test
    fun `eligible state presents`() {
        assertTrue(InterstitialFrequencyGate.canPresent(caps, eligible(), now))
    }

    @Test
    fun `no interstitial during warm-up sessions`() {
        assertFalse(InterstitialFrequencyGate.canPresent(caps, eligible().copy(sessionNumber = 1), now))
        assertFalse(InterstitialFrequencyGate.canPresent(caps, eligible().copy(sessionNumber = 2), now))
        assertTrue(InterstitialFrequencyGate.canPresent(caps, eligible().copy(sessionNumber = 3), now))
    }

    @Test
    fun `per-session ceiling blocks further shows`() {
        assertFalse(InterstitialFrequencyGate.canPresent(caps, eligible().copy(shownThisSession = 2), now))
    }

    @Test
    fun `must cross enough boundaries since the last show`() {
        assertFalse(InterstitialFrequencyGate.canPresent(caps, eligible().copy(boundariesSinceLastShow = 2), now))
    }

    @Test
    fun `must wait the minimum interval since the last show`() {
        val recent = eligible().copy(shownThisSession = 1, lastShownMs = now - 60_000L)
        assertFalse(InterstitialFrequencyGate.canPresent(caps, recent, now))

        val pastInterval = recent.copy(lastShownMs = now - caps.minIntervalMs)
        assertTrue(InterstitialFrequencyGate.canPresent(caps, pastInterval, now))
    }

    @Test
    fun `first ever show ignores the interval gate`() {
        // lastShownMs == 0 means never shown — the time gate must not block it.
        assertTrue(InterstitialFrequencyGate.canPresent(caps, eligible().copy(lastShownMs = 0L), now))
    }
}
