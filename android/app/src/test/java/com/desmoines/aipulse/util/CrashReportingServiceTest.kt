package com.desmoines.aipulse.util

import kotlinx.serialization.json.Json
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.io.TempDir
import java.io.File

class CrashReportingServiceTest {

    private val json = Json { ignoreUnknownKeys = true }

    private fun service(dir: File, now: () -> Long, maxRecords: Int = 200) =
        CrashReportingService(File(dir, "crashes"), json, maxRecords = maxRecords, clock = now)

    @Test
    fun `records non-fatal errors and lists them oldest-first`(@TempDir dir: File) {
        var now = 1_000L
        val svc = service(dir, { now })
        svc.recordError(IllegalStateException("first"))
        now += 1_000L
        svc.recordError(RuntimeException("second"), context = mapOf("screen" to "home"))

        val pending = svc.pendingRecords()
        assertEquals(2, pending.size)
        assertEquals("first", pending[0].message)
        assertEquals("second", pending[1].message)
        assertEquals("home", pending[1].context["screen"])
        assertTrue(pending.none { it.fatal })
    }

    @Test
    fun `flush drains the queue`(@TempDir dir: File) {
        var now = 1_000L
        val svc = service(dir, { now })
        svc.recordError(RuntimeException("x"))
        now += 1_000L
        val flushed = svc.flushPendingRecords()
        assertEquals(1, flushed.size)
        assertTrue(svc.pendingRecords().isEmpty())
    }

    @Test
    fun `enforces the record cap by dropping oldest`(@TempDir dir: File) {
        var now = 1_000L
        val svc = service(dir, { now }, maxRecords = 2)
        svc.recordError(RuntimeException("a"))
        now += 1_000L
        svc.recordError(RuntimeException("b"))
        now += 1_000L
        svc.recordError(RuntimeException("c"))

        val messages = svc.pendingRecords().map { it.message }
        assertEquals(2, messages.size)
        assertEquals(listOf("b", "c"), messages)
    }
}
