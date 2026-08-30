package com.desmoines.aipulse.util

import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.builtins.serializer
import kotlinx.serialization.json.Json
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.io.TempDir
import java.io.File

@OptIn(ExperimentalCoroutinesApi::class)
class QueryCacheTest {

    private val json = Json { ignoreUnknownKeys = true }
    private val stringSerializer = String.serializer()

    private fun cache(dir: File, now: () -> Long, maxBytes: Long = QueryCache.DEFAULT_MAX_BYTES) =
        QueryCache(File(dir, "qc"), json, maxBytes = maxBytes, clock = now)

    @Test
    fun `set then get returns the stored value`(@TempDir dir: File) = runTest {
        var now = 1_000L
        val qc = cache(dir, { now })
        qc.set("k", "hello", stringSerializer, ttlMinutes = 5)
        assertEquals("hello", qc.get("k", stringSerializer))
    }

    @Test
    fun `expired entry returns null unless allowStale`(@TempDir dir: File) = runTest {
        var now = 1_000L
        val qc = cache(dir, { now })
        qc.set("k", "hello", stringSerializer, ttlMinutes = 1)
        now += 61_000L // 61s > 1 min TTL
        assertNull(qc.get("k", stringSerializer))
        assertEquals("hello", qc.get("k", stringSerializer, allowStale = true))
    }

    @Test
    fun `missing key returns null`(@TempDir dir: File) = runTest {
        val qc = cache(dir, { 0L })
        assertNull(qc.get("nope", stringSerializer))
    }

    @Test
    fun `enforces budget by evicting least-recently-used`(@TempDir dir: File) = runTest {
        var now = 1_000L
        // Tiny budget so only the newest envelope survives each write.
        val qc = cache(dir, { now }, maxBytes = 150L)
        qc.set("a", "first", stringSerializer)
        now += 1_000L
        qc.set("b", "second", stringSerializer)
        now += 1_000L
        qc.set("c", "third", stringSerializer)
        // Oldest evicted, newest retained.
        assertNull(qc.get("a", stringSerializer, allowStale = true))
        assertEquals("third", qc.get("c", stringSerializer, allowStale = true))
    }

    @Test
    fun `clear removes all entries`(@TempDir dir: File) = runTest {
        val qc = cache(dir, { 0L })
        qc.set("a", "x", stringSerializer)
        qc.set("b", "y", stringSerializer)
        qc.clear()
        assertNull(qc.get("a", stringSerializer, allowStale = true))
        assertNull(qc.get("b", stringSerializer, allowStale = true))
    }

    @Test
    fun `prune drops entries older than the hard limit`(@TempDir dir: File) = runTest {
        var now = 1_000L
        val qc = cache(dir, { now })
        qc.set("old", "x", stringSerializer, ttlMinutes = 60)
        now += 25L * 3_600_000L // 25h later
        qc.prune(hardLimitHours = 24)
        assertNull(qc.get("old", stringSerializer, allowStale = true))
    }

    @Test
    fun `corrupt entry is dropped on read`(@TempDir dir: File) = runTest {
        val qcDir = File(dir, "qc").apply { mkdirs() }
        val qc = cache(dir, { 0L })
        qc.set("k", "hello", stringSerializer)
        // Corrupt every file in the cache dir.
        qcDir.listFiles()?.forEach { it.writeText("not json") }
        assertNull(qc.get("k", stringSerializer, allowStale = true))
        assertTrue(qcDir.listFiles()?.isEmpty() ?: true)
    }
}
