package com.desmoines.aipulse.util

import com.desmoines.aipulse.data.model.Event
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import java.time.Instant

/**
 * AND-AUDIT-027. The Add to Calendar intent was built inline in
 * EventDetailViewModel with a fixed two-hour block at whatever `date` held,
 * so a TBA row became a 7:31pm or 3:30am appointment and a festival's
 * end_date was ignored. These pin the iOS EventCalendarEntry rules.
 */
class EventCalendarEntryTest {

    private fun event(
        date: String,
        endDate: String? = null,
        timeTbd: Boolean? = null,
        eventStartLocal: String? = null,
        source: String? = null,
        sourceUrl: String? = null,
    ) = Event(
        id = "e1",
        title = "Jazz in July",
        date = date,
        venue = "Simon Estes Amphitheater",
        city = "Des Moines",
        description = "Outdoor show.",
        endDate = endDate,
        timeTbd = timeTbd,
        eventStartLocal = eventStartLocal,
        source = source,
        sourceUrl = sourceUrl,
    )

    private fun millis(iso: String) = Instant.parse(iso).toEpochMilli()

    @Test
    fun `a timed row with no end runs three hours in Des Moines time`() {
        // 7:00pm CDT
        val entry = EventCalendarEntry.from(event("2026-07-10T00:00:00+00:00"))!!
        assertFalse(entry.isAllDay)
        assertEquals(millis("2026-07-10T00:00:00Z"), entry.startMillis)
        assertEquals(millis("2026-07-10T03:00:00Z"), entry.endMillis)
        assertEquals("America/Chicago", entry.timeZoneId)
        assertEquals("Jazz in July", entry.title)
        assertEquals("Simon Estes Amphitheater, Des Moines", entry.location)
        assertEquals("Outdoor show.", entry.description)
    }

    @Test
    fun `a timed row ends at end_date when that is after the start`() {
        val entry = EventCalendarEntry.from(
            event("2026-07-10T00:00:00+00:00", endDate = "2026-07-12T04:00:00+00:00"),
        )!!
        assertEquals(millis("2026-07-12T04:00:00Z"), entry.endMillis)
    }

    @Test
    fun `an end_date before the start falls back to three hours`() {
        val entry = EventCalendarEntry.from(
            event("2026-07-10T00:00:00+00:00", endDate = "2026-07-09T00:00:00+00:00"),
        )!!
        assertEquals(millis("2026-07-10T03:00:00Z"), entry.endMillis)
    }

    @Test
    fun `time_tbd makes an all-day entry on the Des Moines day`() {
        // 2026-07-10T03:30:00Z is 10:30pm on July 9 in Des Moines.
        val entry = EventCalendarEntry.from(event("2026-07-10T03:30:00+00:00", timeTbd = true))!!
        assertTrue(entry.isAllDay)
        assertEquals(millis("2026-07-09T00:00:00Z"), entry.startMillis)
        assertEquals(millis("2026-07-10T00:00:00Z"), entry.endMillis)
        assertEquals("UTC", entry.timeZoneId)
    }

    @Test
    fun `the 19_31_58 no-time marker is all-day, not a 7_31pm block`() {
        // 19:31:58 CDT
        val entry = EventCalendarEntry.from(event("2026-07-11T00:31:58+00:00"))!!
        assertTrue(entry.isAllDay)
        assertEquals(millis("2026-07-10T00:00:00Z"), entry.startMillis)
    }

    @Test
    fun `event_start_local carrying the marker is all-day`() {
        val entry = EventCalendarEntry.from(
            event("2026-07-11T00:31:58+00:00", eventStartLocal = "2026-07-10T19:31:58"),
        )!!
        assertTrue(entry.isAllDay)
    }

    @Test
    fun `a SeatGeek row at 03_30 is all-day, any other source at 03_30 is timed`() {
        val placeholder = "2026-07-10T08:30:00+00:00" // 03:30 CDT
        assertTrue(EventCalendarEntry.from(event(placeholder, source = "seatgeek"))!!.isAllDay)
        assertTrue(
            EventCalendarEntry.from(event(placeholder, sourceUrl = "https://seatgeek.com/x"))!!.isAllDay,
        )
        assertFalse(EventCalendarEntry.from(event(placeholder, source = "eventbrite"))!!.isAllDay)
    }

    @Test
    fun `a bare date is all-day on that date, not the evening before`() {
        val entry = EventCalendarEntry.from(event("2026-07-10"))!!
        assertTrue(entry.isAllDay)
        assertEquals(millis("2026-07-10T00:00:00Z"), entry.startMillis)
        assertEquals(millis("2026-07-11T00:00:00Z"), entry.endMillis)
    }

    @Test
    fun `an untimed multi-day run covers through its last day`() {
        val entry = EventCalendarEntry.from(
            event(
                "2026-08-13T05:00:00+00:00",
                timeTbd = true,
                endDate = "2026-08-23T05:00:00+00:00", // 00:00 CDT Aug 23
            ),
        )!!
        assertEquals(millis("2026-08-13T00:00:00Z"), entry.startMillis)
        assertEquals(millis("2026-08-24T00:00:00Z"), entry.endMillis)
    }

    @Test
    fun `an untimed end_date before the start is ignored`() {
        val entry = EventCalendarEntry.from(
            event("2026-08-13T05:00:00+00:00", timeTbd = true, endDate = "2026-08-01T05:00:00+00:00"),
        )!!
        assertEquals(millis("2026-08-14T00:00:00Z"), entry.endMillis)
    }

    @Test
    fun `no parseable date means no entry`() {
        assertNull(EventCalendarEntry.from(event("TBA")))
    }

    // AND-AUDIT-028: the Saved tab's row action.

    @Test
    fun `an upcoming saved row offers the same entry event detail builds`() {
        val e = event("2026-08-13T05:00:00+00:00", timeTbd = true)
        assertEquals(EventCalendarEntry.from(e), EventCalendarEntry.forSavedRow(e, isPast = false))
        val timed = event("2026-07-10T00:00:00+00:00", endDate = "2026-07-12T04:00:00+00:00")
        assertEquals(EventCalendarEntry.from(timed), EventCalendarEntry.forSavedRow(timed, isPast = false))
    }

    @Test
    fun `a past saved row offers no calendar entry`() {
        assertNull(EventCalendarEntry.forSavedRow(event("2026-07-10T00:00:00+00:00"), isPast = true))
    }

    @Test
    fun `a saved row with no parseable date offers no calendar entry`() {
        assertNull(EventCalendarEntry.forSavedRow(event("TBA"), isPast = false))
    }

    @Test
    fun `parsedDate still reads the offset-less forms as UTC`() {
        assertEquals(millis("2026-07-10T19:00:00Z"), event("2026-07-10T19:00:00").parsedDate!!.toInstant().toEpochMilli())
        assertEquals(millis("2026-07-10T19:00:00Z"), event("2026-07-10 19:00:00").parsedDate!!.toInstant().toEpochMilli())
        assertEquals(millis("2026-07-10T00:00:00Z"), event("2026-07-10").parsedDate!!.toInstant().toEpochMilli())
    }
}
