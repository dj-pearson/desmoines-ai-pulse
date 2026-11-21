package com.desmoines.aipulse.util

import com.desmoines.aipulse.data.model.Event
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import java.time.Instant

/**
 * AND-AUDIT-044: event detail decides "past" as the web's event page
 * does (`!timing.isOver && !archived`), so a past edition opened from the
 * series screen or Saved stops offering Add to Calendar.
 */
class EventPastStateTest {

    /** 7 pm Central on 2026-10-01 (00:00 UTC on the 2nd). */
    private fun timed(endDate: String? = null, archivedAt: String? = null) = Event(
        id = "e1",
        title = "Show",
        date = "2026-10-02T00:00:00+00:00",
        eventStartUtc = "2026-10-02T00:00:00+00:00",
        endDate = endDate,
        archivedAt = archivedAt,
    )

    @Test
    fun `a timed show is current until three hours after its start`() {
        val event = timed()
        assertFalse(EventPastState.isPast(event, Instant.parse("2026-10-02T02:59:00Z")))
        assertTrue(EventPastState.isPast(event, Instant.parse("2026-10-02T03:01:00Z")))
    }

    @Test
    fun `day two of a multi-day run is not past`() {
        val run = timed(endDate = "2026-10-04T03:00:00+00:00")
        assertFalse(EventPastState.isPast(run, Instant.parse("2026-10-03T18:00:00Z")))
        assertTrue(EventPastState.isPast(run, Instant.parse("2026-10-04T03:01:00Z")))
    }

    @Test
    fun `an untimed row stays current until its Des Moines day ends`() {
        // The ingest's no-time marker, 19:31:58 Central on 2026-10-01.
        val tba = Event(
            id = "e2",
            title = "TBA",
            date = "2026-10-02T00:31:58+00:00",
            eventStartUtc = "2026-10-02T00:31:58+00:00",
            timeTbd = true,
        )
        // 11:30 pm Central on the 1st.
        assertFalse(EventPastState.isPast(tba, Instant.parse("2026-10-02T04:30:00Z")))
        // 12:00 am Central on the 2nd.
        assertTrue(EventPastState.isPast(tba, Instant.parse("2026-10-02T05:00:00Z")))
    }

    @Test
    fun `an archived row is past whatever its dates say`() {
        val archived = timed(archivedAt = "2026-10-05T08:00:00+00:00")
        assertTrue(EventPastState.isPast(archived, Instant.parse("2026-09-01T00:00:00Z")))
        assertFalse(EventPastState.isPast(timed(archivedAt = ""), Instant.parse("2026-09-01T00:00:00Z")))
    }

    @Test
    fun `Add to Calendar needs a date and a row that is not past`() {
        val event = timed()
        assertTrue(EventPastState.offersAddToCalendar(event, isPast = false))
        assertFalse(EventPastState.offersAddToCalendar(event, isPast = true))
        val undated = Event(id = "e3", title = "Undated", date = "not a date")
        assertFalse(EventPastState.offersAddToCalendar(undated, isPast = false))
    }

    @Test
    fun `archived_at decodes from the events row`() {
        val json = kotlinx.serialization.json.Json { ignoreUnknownKeys = true }
        val event = json.decodeFromString(
            Event.serializer(),
            """{"id":"e4","title":"Old","date":"2024-08-30","archived_at":"2024-09-15T08:00:00+00:00"}""",
        )
        assertEquals("2024-09-15T08:00:00+00:00", event.archivedAt)
        assertTrue(EventPastState.isPast(event, Instant.parse("2024-08-01T00:00:00Z")))
    }

    @Test
    fun `the banner says what iOS says`() {
        assertEquals("This event has already happened", EventPastState.BANNER_TEXT)
    }
}
