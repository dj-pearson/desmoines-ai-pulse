package com.desmoines.aipulse.util

import android.content.Intent
import android.net.Uri
import io.mockk.every
import io.mockk.mockk
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class ShortcutDispatcherTest {

    private fun uri(
        scheme: String?,
        host: String?,
        params: Map<String, String?> = emptyMap(),
    ): Uri = mockk {
        every { this@mockk.scheme } returns scheme
        every { this@mockk.host } returns host
        every { getQueryParameter(any()) } answers { params[firstArg()] }
    }

    private fun intentWith(data: Uri?): Intent = mockk { every { this@mockk.data } returns data }

    @Test
    fun `ask-pulse link parses the query`() {
        val dispatcher = ShortcutDispatcher()
        val intent = intentWith(uri("com.desmoines.aipulse", "ask-pulse", mapOf("q" to "live music")))

        assertTrue(dispatcher.handleIntent(intent))
        assertEquals(
            ShortcutDispatcher.Pending.AskPulse("live music"),
            dispatcher.pending.value,
        )
    }

    @Test
    fun `find-restaurants link parses cuisine area and openNow`() {
        val dispatcher = ShortcutDispatcher()
        val intent = intentWith(
            uri(
                "com.desmoines.aipulse",
                "find-restaurants",
                mapOf("cuisine" to "italian", "area" to "downtown", "openNow" to "true"),
            ),
        )

        assertTrue(dispatcher.handleIntent(intent))
        assertEquals(
            ShortcutDispatcher.Pending.FindRestaurants("italian", "downtown", true),
            dispatcher.pending.value,
        )
    }

    @Test
    fun `find-events link parses category and datePreset`() {
        val dispatcher = ShortcutDispatcher()
        val intent = intentWith(
            uri(
                "com.desmoines.aipulse",
                "find-events",
                mapOf("category" to "music", "datePreset" to "tonight"),
            ),
        )

        assertTrue(dispatcher.handleIntent(intent))
        assertEquals(
            ShortcutDispatcher.Pending.FindEvents("music", "tonight"),
            dispatcher.pending.value,
        )
    }

    @Test
    fun `missing optional params default to null and false`() {
        val dispatcher = ShortcutDispatcher()
        val intent = intentWith(uri("com.desmoines.aipulse", "find-restaurants"))

        assertTrue(dispatcher.handleIntent(intent))
        assertEquals(
            ShortcutDispatcher.Pending.FindRestaurants(null, null, false),
            dispatcher.pending.value,
        )
    }

    @Test
    fun `foreign scheme is ignored`() {
        val dispatcher = ShortcutDispatcher()
        val intent = intentWith(uri("https", "ask-pulse", mapOf("q" to "x")))

        assertFalse(dispatcher.handleIntent(intent))
        assertNull(dispatcher.pending.value)
    }

    @Test
    fun `consume clears the pending payload`() {
        val dispatcher = ShortcutDispatcher()
        dispatcher.handleIntent(intentWith(uri("com.desmoines.aipulse", "ask-pulse", mapOf("q" to "hi"))))

        val consumed = dispatcher.consume()
        assertEquals(ShortcutDispatcher.Pending.AskPulse("hi"), consumed)
        assertNull(dispatcher.pending.value)
    }

    @Test
    fun `intent without data is not handled`() {
        val dispatcher = ShortcutDispatcher()
        assertFalse(dispatcher.handleIntent(intentWith(null)))
    }
}
