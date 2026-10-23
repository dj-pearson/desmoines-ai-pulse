package com.desmoines.aipulse.util

import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.awaitCancellation
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.yield
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertSame
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows
import java.io.IOException

@OptIn(ExperimentalCoroutinesApi::class)
class SuspendRunCatchingTest {

    @Test
    fun `success is wrapped`() = runTest {
        val result = suspendRunCatching {
            yield()
            "ok"
        }
        assertEquals(Result.success("ok"), result)
    }

    @Test
    fun `other exceptions become Result failure`() = runTest {
        val boom = IOException("offline")
        val result = suspendRunCatching<String> {
            yield()
            throw boom
        }
        assertTrue(result.isFailure)
        assertSame(boom, result.exceptionOrNull())
    }

    @Test
    fun `a thrown CancellationException is rethrown, not wrapped`() = runTest {
        val thrown = assertThrows<CancellationException> {
            suspendRunCatching<String> { throw CancellationException("left the screen") }
        }
        assertEquals("left the screen", thrown.message)
    }

    @Test
    fun `cancelling the coroutine stops it instead of returning a failure`() = runTest {
        var reachedFailureHandling = false
        var observed: Result<Unit>? = null
        val started = CompletableDeferred<Unit>()

        val job = launch {
            observed = suspendRunCatching {
                started.complete(Unit)
                awaitCancellation()
            }
            // Only reachable if cancellation was swallowed into a Result.
            reachedFailureHandling = true
        }
        started.await()
        job.cancel()
        runCurrent()

        assertTrue(job.isCancelled)
        assertFalse(reachedFailureHandling)
        assertEquals(null, observed)
    }
}
