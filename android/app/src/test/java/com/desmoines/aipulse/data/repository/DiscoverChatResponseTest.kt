package com.desmoines.aipulse.data.repository

import kotlinx.serialization.json.Json
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Test

/**
 * discover-chat sends `usage.remaining` as EITHER an Int or the string
 * "unlimited", depending on tier. A decoder that handles one shape throws for
 * exactly one tier, and it would be the paying one - which is why this needs a
 * custom serializer and why every branch of it is asserted here (XPLAT-009).
 */
class DiscoverChatResponseTest {

    private val json = Json { ignoreUnknownKeys = true }

    private fun decode(body: String) =
        json.decodeFromString(DiscoverChatResponse.serializer(), body)

    @Test
    fun `free tier remaining decodes as a count`() {
        val response = decode(
            """{"picks":[],"followUpSuggestions":[],"usage":{"remaining":3,"tier":"free"}}""",
        )
        assertEquals(RemainingValue.Count(3), response.usage?.remaining)
        assertEquals("free", response.usage?.tier)
        assertEquals("3 left today", response.usage?.remaining?.displayString)
    }

    @Test
    fun `vip tier remaining decodes as unlimited`() {
        val response = decode(
            """{"picks":[],"followUpSuggestions":[],"usage":{"remaining":"unlimited","tier":"vip"}}""",
        )
        assertEquals(RemainingValue.Unlimited, response.usage?.remaining)
        assertEquals("unlimited", response.usage?.remaining?.displayString)
    }

    @Test
    fun `zero remaining still decodes rather than failing`() {
        val response = decode(
            """{"picks":[],"followUpSuggestions":[],"usage":{"remaining":0,"tier":"free"}}""",
        )
        assertEquals(RemainingValue.Count(0), response.usage?.remaining)
        assertEquals("0 left today", response.usage?.remaining?.displayString)
    }

    @Test
    fun `an unrecognised remaining value falls to zero instead of throwing`() {
        // A shape nobody planned for must not take down a response that also
        // carries picks - the picks are the point of the call.
        val response = decode(
            """{"picks":[{"itemType":"event","itemId":"e1","reason":"r"}],
               "followUpSuggestions":[],"usage":{"remaining":"soon","tier":"free"}}""",
        )
        assertEquals(RemainingValue.Count(0), response.usage?.remaining)
        assertEquals(1, response.picks.size)
    }

    @Test
    fun `usage is optional so an older function version still decodes`() {
        val response = decode("""{"picks":[],"followUpSuggestions":["again?"]}""")
        assertNull(response.usage)
        assertEquals(listOf("again?"), response.followUpSuggestions)
    }

    @Test
    fun `tier is optional`() {
        val response = decode(
            """{"picks":[],"followUpSuggestions":[],"usage":{"remaining":7}}""",
        )
        assertEquals(RemainingValue.Count(7), response.usage?.remaining)
        assertEquals("", response.usage?.tier)
    }
}
