package com.desmoines.aipulse.util

import com.desmoines.aipulse.data.model.Event
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import java.time.LocalDate
import java.time.ZonedDateTime

/**
 * AND-AUDIT-030. PostgREST sends events.date as +00:00, and the day badge,
 * featured cards, urgency label, map pin and Weekend grouping all read the
 * day in that offset, so a 7pm Central show (00:00Z) sat on the next day.
 * Every case here is a row whose UTC day and Des Moines day differ.
 */
class EventDesMoinesDayTest {

    private fun event(date: String, timeTbd: Boolean? = null) = Event(
        id = date,
        title = "Show at Wooly's",
        date = date,
        timeTbd = timeTbd,
    )

    /** 7:00pm CDT on Saturday July 4, 2026: 00:00Z on Sunday the 5th. */
    private val saturdayEvening = event("2026-07-05T00:00:00+00:00")

    private val july4 = LocalDate.of(2026, 7, 4)

    // region day badge and labels

    @Test
    fun `a 7pm CDT row is on its Des Moines day, not the UTC day`() {
        assertEquals(july4, EventTimeText.desMoinesDay(saturdayEvening))
        assertEquals("SAT 4 JUL", EventTimeText.dayText(saturdayEvening, "EEE d MMM")?.uppercase())
        assertEquals("Jul 4", EventTimeText.dayText(saturdayEvening, "MMM d"))
    }

    @Test
    fun `the featured card is read aloud with the Des Moines day`() {
        assertTrue(saturdayEvening.featuredCardAccessibilityLabel.contains("Saturday, July 4"))
    }

    // endregion

    // region urgency

    @Test
    fun `a show tonight is Today, not Tomorrow`() {
        assertEquals("Today", EventTimeText.urgencyLabel(saturdayEvening, today = july4))
        assertEquals(0L, EventTimeText.daysFromToday(saturdayEvening, today = july4))
    }

    @Test
    fun `urgency counts Des Moines days and stops after a week`() {
        assertEquals("Tomorrow", EventTimeText.urgencyLabel(saturdayEvening, today = july4.minusDays(1)))
        assertEquals("In 7 days", EventTimeText.urgencyLabel(saturdayEvening, today = july4.minusDays(7)))
        assertNull(EventTimeText.urgencyLabel(saturdayEvening, today = july4.minusDays(8)))
        assertNull(EventTimeText.urgencyLabel(saturdayEvening, today = july4.plusDays(1)))
        assertEquals(-1L, EventTimeText.daysFromToday(saturdayEvening, today = july4.plusDays(1)))
    }

    @Test
    fun `an unparseable date has no urgency`() {
        assertNull(EventTimeText.urgencyLabel(event("next Saturday"), today = july4))
        assertNull(EventTimeText.daysFromToday(event("next Saturday"), today = july4))
    }

    // endregion

    // region Weekend grouping

    @Test
    fun `Weekend grouping puts evening shows on the night they happen`() {
        val thursdayLate = event("2026-07-03T01:30:00+00:00") // 8:30pm CDT Thursday July 2
        val fridayNoon = event("2026-07-03T17:00:00+00:00") // noon CDT Friday July 3
        val sundayLate = event("2026-07-06T02:00:00+00:00") // 9pm CDT Sunday July 5
        val tba = event("2026-07-04T00:31:58+00:00") // the 19:31:58 marker on Friday July 3

        val byDay = EventTimeText.groupByDesMoinesDay(listOf(sundayLate, saturdayEvening, tba, fridayNoon, thursdayLate))

        assertEquals(listOf(thursdayLate), byDay[LocalDate.of(2026, 7, 2)])
        assertEquals(listOf(fridayNoon, tba), byDay[LocalDate.of(2026, 7, 3)])
        assertEquals(listOf(saturdayEvening), byDay[july4])
        assertEquals(listOf(sundayLate), byDay[LocalDate.of(2026, 7, 5)])
        assertNull(byDay[LocalDate.of(2026, 7, 6)])
    }

    @Test
    fun `a bare date groups on that day`() {
        val byDay = EventTimeText.groupByDesMoinesDay(listOf(event("2026-07-04")))
        assertEquals(1, byDay[july4]?.size)
    }

    @Test
    fun `the Weekend fetch window is bounded at Central midnight`() {
        assertEquals("2026-07-03T00:00:00-05:00", EventTimeText.centralMidnight(LocalDate.of(2026, 7, 3)))
        assertEquals("2026-11-06T00:00:00-06:00", EventTimeText.centralMidnight(LocalDate.of(2026, 11, 6)))
    }

    // endregion

    // region Saved past/upcoming

    private fun centralAt(iso: String): ZonedDateTime = ZonedDateTime.parse(iso).withZoneSameInstant(EventSlug.CENTRAL)

    @Test
    fun `a timed row is past once its start instant is`() {
        assertEquals(false, EventTimeText.hasPassed(saturdayEvening, centralAt("2026-07-04T18:59:00-05:00")))
        assertEquals(true, EventTimeText.hasPassed(saturdayEvening, centralAt("2026-07-04T19:30:00-05:00")))
    }

    @Test
    fun `a bare date stays upcoming through its whole Des Moines day`() {
        val bare = event("2026-07-04")
        // Parsed as 00:00Z, which is 7pm on July 3 in Central; still upcoming that evening and on the 4th.
        assertFalse(EventTimeText.hasPassed(bare, centralAt("2026-07-03T20:00:00-05:00"))!!)
        assertFalse(EventTimeText.hasPassed(bare, centralAt("2026-07-04T23:00:00-05:00"))!!)
        assertTrue(EventTimeText.hasPassed(bare, centralAt("2026-07-05T00:30:00-05:00"))!!)
    }

    @Test
    fun `a time_tbd row is past only after its day`() {
        val tbd = event("2026-07-05T00:00:00+00:00", timeTbd = true)
        assertEquals(false, EventTimeText.hasPassed(tbd, centralAt("2026-07-04T21:00:00-05:00")))
        assertEquals(true, EventTimeText.hasPassed(tbd, centralAt("2026-07-05T08:00:00-05:00")))
    }

    @Test
    fun `an unparseable date is neither past nor upcoming`() {
        assertNull(EventTimeText.hasPassed(event("soon"), centralAt("2026-07-04T12:00:00-05:00")))
    }

    // endregion
}
