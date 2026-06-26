package com.desmoines.aipulse.util

import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.runTest
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import java.io.IOException

@OptIn(ExperimentalCoroutinesApi::class)
class NetworkRetryTest {

    @Test
    fun `retries transient failures then succeeds`() = runTest {
        var attempts = 0
        val result = NetworkRetry.withRetry(maxAttempts = 3, baseDelayMs = 1) {
            attempts++
            if (attempts < 3) throw IOException("transient")
            "ok"
        }
        assertEquals("ok", result)
        assertEquals(3, attempts)
    }

    @Test
    fun `does not retry non-retryable errors`() = runTest {
        var attempts = 0
        val error = runCatching {
            NetworkRetry.withRetry(maxAttempts = 3, baseDelayMs = 1) {
                attempts++
                throw IllegalStateException("client error")
            }
        }.exceptionOrNull()
        assertTrue(error is IllegalStateException)
        assertEquals(1, attempts)
    }

    @Test
    fun `propagates cancellation without retrying`() = runTest {
        var attempts = 0
        val error = runCatching {
            NetworkRetry.withRetry(maxAttempts = 3, baseDelayMs = 1) {
                attempts++
                throw CancellationException("cancelled")
            }
        }.exceptionOrNull()
        assertTrue(error is CancellationException)
        assertEquals(1, attempts)
    }

    @Test
    fun `throws last error after exhausting attempts`() = runTest {
        var attempts = 0
        val error = runCatching {
            NetworkRetry.withRetry(maxAttempts = 2, baseDelayMs = 1) {
                attempts++
                throw IOException("always")
            }
        }.exceptionOrNull()
        assertTrue(error is IOException)
        assertEquals(2, attempts)
    }
}
