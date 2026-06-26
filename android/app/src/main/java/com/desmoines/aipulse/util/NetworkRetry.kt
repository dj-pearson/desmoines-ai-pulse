package com.desmoines.aipulse.util

import io.ktor.client.plugins.ResponseException
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.delay
import java.io.IOException
import kotlin.random.Random

/**
 * Global async retry wrapper with exponential backoff + jitter.
 * Mirrors iOS NetworkRetry.swift.
 *
 * Retries only transient failures (5xx, 429, transport-level IO errors).
 * Never retries 4xx client errors (except 429) or coroutine cancellation —
 * cancellation is always rethrown to honour structured concurrency.
 *
 * Usage:
 *   val events = NetworkRetry.withRetry { remote.fetchEvents(query) }
 */
object NetworkRetry {

    const val DEFAULT_MAX_ATTEMPTS = 3
    const val DEFAULT_BASE_DELAY_MS = 1_000L
    const val DEFAULT_MAX_JITTER_MS = 500L

    /**
     * Classifies whether a throwable is worth retrying. Exposed so callers/tests
     * can override the policy; the default covers the common transient cases.
     */
    fun defaultIsRetryable(throwable: Throwable): Boolean = when (throwable) {
        is CancellationException -> false
        is ResponseException -> {
            val status = throwable.response.status.value
            status == 429 || status in 500..599
        }
        // Timeouts, connection reset, DNS failures, TLS handshake failures
        is IOException -> true
        else -> false
    }

    /**
     * Runs [block], retrying transient failures with exponential backoff.
     *
     * @param maxAttempts total attempts including the first (>= 1)
     * @param baseDelayMs base backoff; delay = baseDelayMs * 2^attempt + jitter
     * @param maxJitterMs upper bound of the random jitter added to each delay
     * @param isRetryable policy deciding which throwables to retry
     */
    suspend fun <T> withRetry(
        maxAttempts: Int = DEFAULT_MAX_ATTEMPTS,
        baseDelayMs: Long = DEFAULT_BASE_DELAY_MS,
        maxJitterMs: Long = DEFAULT_MAX_JITTER_MS,
        isRetryable: (Throwable) -> Boolean = ::defaultIsRetryable,
        block: suspend () -> T,
    ): T {
        require(maxAttempts >= 1) { "maxAttempts must be >= 1" }
        var lastError: Throwable? = null
        for (attempt in 0 until maxAttempts) {
            try {
                return block()
            } catch (cancellation: CancellationException) {
                // Never swallow cancellation — propagate immediately.
                throw cancellation
            } catch (error: Throwable) {
                lastError = error
                val isLastAttempt = attempt == maxAttempts - 1
                if (isLastAttempt || !isRetryable(error)) {
                    throw error
                }
                val backoff = baseDelayMs * (1L shl attempt)
                val jitter = if (maxJitterMs > 0) Random.nextLong(0, maxJitterMs) else 0L
                val totalDelay = backoff + jitter
                AppLogger.network.warning(
                    "Retry ${attempt + 1}/${maxAttempts - 1} after ${totalDelay}ms: ${error.message}"
                )
                delay(totalDelay)
            }
        }
        // Unreachable in practice — the loop either returns or throws.
        throw lastError ?: IllegalStateException("withRetry exhausted without a result")
    }
}
