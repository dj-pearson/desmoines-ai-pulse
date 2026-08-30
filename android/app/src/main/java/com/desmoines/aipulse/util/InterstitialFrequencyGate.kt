package com.desmoines.aipulse.util

/**
 * Caps governing how often a full-screen interstitial may appear (ANDP-044).
 * Tuned to be unobtrusive — none for new users, rare thereafter.
 */
data class InterstitialCaps(
    /** Most interstitials allowed in a single app session. */
    val maxPerSession: Int = 2,
    /** No interstitials at all during the first N sessions (let users settle in). */
    val warmupSessions: Int = 2,
    /** Minimum wall-clock gap between two interstitials. */
    val minIntervalMs: Long = 3 * 60_000L,
    /** Minimum number of nav boundaries crossed since the last interstitial. */
    val minBoundariesBetween: Int = 3,
)

/**
 * The persisted + in-session counters the gate reasons over.
 *
 * @param sessionNumber 1-based count of app sessions ever (this launch included)
 * @param shownThisSession interstitials already shown this session
 * @param lastShownMs epoch ms of the last interstitial, or 0 if never
 * @param boundariesSinceLastShow stable nav boundaries crossed since the last show
 */
data class InterstitialState(
    val sessionNumber: Int,
    val shownThisSession: Int,
    val lastShownMs: Long,
    val boundariesSinceLastShow: Int,
)

/**
 * Pure interstitial frequency policy — no Android deps, fully unit-testable.
 * Mirrors the iOS InterstitialAdService caps. The service layer owns persistence
 * and premium gating; this only answers "do the caps permit a show right now?".
 */
object InterstitialFrequencyGate {

    fun canPresent(caps: InterstitialCaps, state: InterstitialState, nowMs: Long): Boolean {
        // Warm-up: nothing during the first N sessions.
        if (state.sessionNumber <= caps.warmupSessions) return false
        // Per-session ceiling.
        if (state.shownThisSession >= caps.maxPerSession) return false
        // Enough boundaries since the last show.
        if (state.boundariesSinceLastShow < caps.minBoundariesBetween) return false
        // Enough wall-clock time since the last show.
        if (state.lastShownMs > 0L && nowMs - state.lastShownMs < caps.minIntervalMs) return false
        return true
    }
}
