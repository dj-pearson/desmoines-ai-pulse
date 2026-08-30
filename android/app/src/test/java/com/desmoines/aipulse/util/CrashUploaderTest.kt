package com.desmoines.aipulse.util

import kotlinx.serialization.json.jsonPrimitive
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Test

/**
 * XPLAT-004 AC1 -- the payload half of the crash upload path.
 *
 * The network half is deliberately untested here. What actually breaks in this
 * code is the mapping: log-error validates `source` and `userId` and silently
 * substitutes or drops what it does not accept, so a wrong field is invisible in
 * production rather than an error. That is what these assert.
 */
class CrashUploaderTest {

    private fun record(
        fatal: Boolean = false,
        type: String = "java.io.IOException",
        message: String = "offline",
        stackTrace: String = "",
    ) = CrashRecord(
        timestamp = 0L,
        fatal = fatal,
        type = type,
        message = message,
        stackTrace = stackTrace,
        userId = "0123456789abcdef",
        context = emptyMap(),
    )

    private fun field(record: CrashRecord, key: String): String? =
        CrashUploader.payload(record)[key]?.jsonPrimitive?.content

    // --- Field mapping ---

    @Test
    fun `uses the values the sink accepts`() {
        val payload = CrashUploader.payload(record())
        // source is validated against client | edge; anything else silently
        // becomes "client" at the sink, so send what we mean.
        assertEquals("client", payload["source"]?.jsonPrimitive?.content)
        assertEquals("android-crash", payload["component"]?.jsonPrimitive?.content)
        assertEquals("nonFatal", payload["action"]?.jsonPrimitive?.content)
    }

    @Test
    fun `never sends userId`() {
        // The record's hashed id is 16 characters. log-error requires a
        // 36-character UUID and drops anything else, so sending it would look
        // like attribution while attributing nothing.
        assertNull(CrashUploader.payload(record())["userId"])
    }

    @Test
    fun `severity separates fatal from recorded`() {
        assertEquals("critical", field(record(fatal = true), "severity"))
        assertEquals("error", field(record(fatal = false), "severity"))
    }

    @Test
    fun `message is truncated to what the sink stores`() {
        val long = "x".repeat(5000)
        assertEquals(2000, field(record(message = long), "message")?.length)
    }

    @Test
    fun `message falls back to the type when there is no message`() {
        assertEquals("java.io.IOException", field(record(message = ""), "message"))
    }

    // --- Frame reduction ---

    @Test
    fun `top symbol drops the source position`() {
        // Foo_kt colon 42 moves with any edit above it, and the cluster
        // signature is a hash of the message.
        val stack = """
            java.io.IOException: offline
                at java.net.Socket.connect(Socket.java:589)
                at com.desmoines.aipulse.data.remote.EventsRemoteDataSource.fetch(EventsRemoteDataSource.kt:42)
        """.trimIndent()
        assertEquals(
            "com.desmoines.aipulse.data.remote.EventsRemoteDataSource.fetch",
            CrashUploader.topSymbol(stack),
        )
    }

    @Test
    fun `top symbol skips framework frames`() {
        // The top frame of a crash stack is usually inside the framework and is
        // the same for unrelated crashes, which would collapse them into one
        // cluster.
        val stack = """
            java.lang.NullPointerException
                at java.net.Socket.connect(Socket.java:589)
                at android.os.Handler.dispatchMessage(Handler.java:106)
        """.trimIndent()
        assertNull(CrashUploader.topSymbol(stack))
    }

    @Test
    fun `top symbol returns null rather than guessing`() {
        assertNull(CrashUploader.topSymbol(""))
        assertNull(CrashUploader.topSymbol("not a stack trace"))
    }

    @Test
    fun `payload appends the symbol to the message`() {
        val stack = "\tat com.desmoines.aipulse.Boot.start(Boot.kt:12)"
        assertEquals(
            "java.io.IOException: offline @ com.desmoines.aipulse.Boot.start",
            field(record(stackTrace = stack), "message"),
        )
    }

    @Test
    fun `payload omits the symbol when there is no app frame`() {
        val stack = "\tat java.net.Socket.connect(Socket.java:589)"
        assertEquals("java.io.IOException: offline", field(record(stackTrace = stack), "message"))
    }
}
