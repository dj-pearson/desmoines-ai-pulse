package com.desmoines.aipulse.util

import com.desmoines.aipulse.data.model.Event
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

/**
 * AND-AUDIT-033. Event detail and the Saved tab share through one builder, and
 * the text now carries the event's page (it ended "Found on Des Moines
 * Insider" with no link), the same SITE_URL/events/<id> iOS shares.
 */
class EventShareTextTest {

    private fun event(
        date: String,
        id: String = "3f2c9a10-1b2c-4d5e-8f90-123456789abc",
        timeTbd: Boolean? = null,
    ) = Event(
        id = id,
        title = "Hoyt Sherman show",
        date = date,
        venue = "Hoyt Sherman Place",
        timeTbd = timeTbd,
    )

    @Test
    fun `the url is the event page iOS shares`() {
        assertEquals(
            "https://desmoinesinsider.com/events/3f2c9a10-1b2c-4d5e-8f90-123456789abc",
            EventShareText.url("3f2c9a10-1b2c-4d5e-8f90-123456789abc"),
        )
    }

    @Test
    fun `an id that is not url-safe is encoded, spaces as percent-20`() {
        assertEquals("https://desmoinesinsider.com/events/a%20b%2Fc", EventShareText.url("a b/c"))
    }

    @Test
    fun `a timed event shares its Des Moines day and time, location, then the link`() {
        // 7:00pm CDT on Oct 3 is 00:00Z on Oct 4.
        val text = EventShareText.text(event("2026-10-04T00:00:00+00:00"))
        assertEquals(
            "Hoyt Sherman show - Oct 3, 2026 7:00 PM - at Hoyt Sherman Place\n\n" +
                "Found on Des Moines Insider: https://desmoinesinsider.com/events/3f2c9a10-1b2c-4d5e-8f90-123456789abc",
            text,
        )
    }

    @Test
    fun `a TBA row shares Time TBA, not the placeholder time`() {
        // The 19:31:58 no-time marker.
        val text = EventShareText.text(event("2026-10-04T00:31:58+00:00"))
        assertTrue(text.startsWith("Hoyt Sherman show - Oct 3, 2026 (Time TBA) - at Hoyt Sherman Place"), text)
        assertFalse(text.contains("7:31"), text)
    }

    @Test
    fun `a row whose date does not parse skips the day and keeps the link`() {
        val text = EventShareText.text(event("not a date"))
        assertTrue(text.startsWith("Hoyt Sherman show - at Hoyt Sherman Place\n\n"), text)
        assertTrue(text.endsWith("/events/3f2c9a10-1b2c-4d5e-8f90-123456789abc"), text)
    }
}
