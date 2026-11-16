package com.desmoines.aipulse.util

import com.desmoines.aipulse.data.model.Event
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import java.time.LocalDate

/**
 * AND-AUDIT-046. /events/date-night runs the web's rule natively. The literal
 * below is the web's DATE_NIGHT_FILTER; src/lib/__tests__/androidDateNightParity.test.ts
 * reads DateNightFilter.kt and compares it to the TypeScript export itself, so
 * a change on either side fails there even if this copy is updated.
 */
class DateNightFilterTest {

    private val web =
        "category.in.(Music,Comedy,Arts)," +
            "title.imatch.\"[[:<:]](concerts?|live music|wine|dinner|comedy|jazz|tasting)[[:>:]]\""

    @Test
    fun `the or-group is the web's filter byte for byte`() {
        assertEquals(web, DateNightFilter.OR_GROUP)
    }

    @Test
    fun `the window is 14 Des Moines days from Central midnight, across the DST change`() {
        // 2026-10-25 is CDT; 14 days later, 2026-11-08, is CST.
        val (start, end) = DateNightFilter.windowBounds(LocalDate.of(2026, 10, 25))
        assertEquals("2026-10-25T00:00:00-05:00", start)
        assertEquals("2026-11-08T00:00:00-06:00", end)
    }

    @Test
    fun `only time=all shows every start time`() {
        val base = "https://desmoinesinsider.com/events/date-night"
        assertEquals(DateNightFilter.Times.EVENING, DateNightFilter.timesFor(base))
        assertEquals(DateNightFilter.Times.ANY_TIME, DateNightFilter.timesFor("$base?time=all"))
        assertEquals(DateNightFilter.Times.ANY_TIME, DateNightFilter.timesFor("$base?utm_source=x&time=all#top"))
        assertEquals(DateNightFilter.Times.EVENING, DateNightFilter.timesFor("$base?time=evening"))
        assertEquals(DateNightFilter.Times.EVENING, DateNightFilter.timesFor("$base?times=all"))
        assertEquals(DateNightFilter.Times.EVENING, DateNightFilter.timesFor("$base?time=ALL"))
    }

    private fun event(start: String, timeTbd: Boolean? = null) = Event(
        id = "e1",
        title = "Show",
        date = start,
        eventStartUtc = start,
        timeTbd = timeTbd,
    )

    @Test
    fun `evening is 4 pm to before 4 am Central, whatever offset the row arrives in`() {
        // 4:00 pm CDT.
        assertTrue(DateNightFilter.isEveningStart(event("2026-10-01T21:00:00+00:00")))
        // 3:59 pm CDT.
        assertFalse(DateNightFilter.isEveningStart(event("2026-10-01T20:59:00+00:00")))
        // 11:30 pm CDT, which is the next day in UTC.
        assertTrue(DateNightFilter.isEveningStart(event("2026-10-02T04:30:00+00:00")))
        // 3:59 am and 4:00 am CDT.
        assertTrue(DateNightFilter.isEveningStart(event("2026-10-02T08:59:00+00:00")))
        assertFalse(DateNightFilter.isEveningStart(event("2026-10-02T09:00:00+00:00")))
        // Noon.
        assertFalse(DateNightFilter.isEveningStart(event("2026-10-01T17:00:00+00:00")))
    }

    @Test
    fun `a row with no real start time is not an evening row`() {
        // The ingest's 19:31:58 Central no-time marker would read 7:31 pm.
        assertFalse(DateNightFilter.isEveningStart(event("2026-10-02T00:31:58+00:00")))
        // An explicit time_tbd at a real-looking 8 pm.
        assertFalse(DateNightFilter.isEveningStart(event("2026-10-02T01:00:00+00:00", timeTbd = true)))
        // A bare date.
        assertFalse(DateNightFilter.isEveningStart(Event(id = "e2", title = "Fair", date = "2026-10-02")))
    }

    @Test
    fun `event_start_utc wins over date, as the web's landingStartInstant reads it`() {
        // date says noon Central, event_start_utc says 7 pm Central.
        val row = Event(
            id = "e3",
            title = "Show",
            date = "2026-10-01T17:00:00+00:00",
            eventStartUtc = "2026-10-02T00:00:00+00:00",
        )
        assertTrue(DateNightFilter.isEveningStart(row))
    }

    @Test
    fun `the chip says which times it keeps`() {
        assertEquals("Date night \u00b7 Evenings", DateNightFilter.chipLabel(DateNightFilter.Times.EVENING))
        assertEquals("Date night \u00b7 Any time", DateNightFilter.chipLabel(DateNightFilter.Times.ANY_TIME))
    }
}
