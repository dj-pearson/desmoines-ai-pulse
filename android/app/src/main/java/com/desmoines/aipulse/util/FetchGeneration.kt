package com.desmoines.aipulse.util

/**
 * Monotonic per-endpoint request token that kills stale-result races (ANDP-061).
 *
 * A ViewModel keeps one instance per logical endpoint. When a newer request must
 * supersede any in-flight ones (filter change, pull-to-refresh, reload), it calls
 * [bump]. Each fetch captures [current] at its start and applies its result only
 * while [isCurrent] still holds — so a slow, superseded response can never clobber
 * fresher UI state. Continuation requests (load-more / pagination) capture [current]
 * without bumping, so they're dropped if a reset lands while they're in flight.
 *
 * Not thread-safe by itself; callers mutate it from a single ViewModel dispatcher.
 */
class FetchGeneration {
    private var value = 0

    /** Supersede every in-flight request and return the new current token. */
    fun bump(): Int {
        value += 1
        return value
    }

    /** The token an in-flight fetch should capture at its start. */
    fun current(): Int = value

    /** True only while [token] is still the most recently begun request. */
    fun isCurrent(token: Int): Boolean = token == value
}
