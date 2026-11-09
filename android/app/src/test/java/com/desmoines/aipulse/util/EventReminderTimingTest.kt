package com.desmoines.aipulse.util

import com.desmoines.aipulse.data.model.Event
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import java.time.Instant

/**
 * AND-AUDIT-029. Reminders were scheduled an hour before parsedDate, so a
 * time-TBA row fired an hour before a placeholder: 6:31pm for the 19:31:58
 * marker, 2:30am for SeatGeek's 03:30. These pin iOS reminderFireDate, and
 * the "Time TBA" text the cards and detail now show for the same rows.
 */
class EventReminderTimingTest {

    private fun event(
        date: String,
        timeTbd: Boolean? = null,
        source: String? = null,
    ) = Event(
        id = "e1",
        title = "Hoyt Sherman show",
        date = date,
        venue = "Hoyt Sherman Place",
        timeTbd = timeTbd,
        source = source,
    )

    private fun millis(iso: String) = Instant.parse(iso).toEpochMilli()

    // region fireAtMillis

    @Test
    fun `a timed event fires an hour before the start`() {
        // 7:00pm CDT on Oct 3
        assertEquals(millis("2026-10-03T23:00:00Z"), EventReminderTiming.fireAtMillis(event("2026-10-04T00:00:00+00:00")))
    }

    @Test
    fun `the no-time marker fires at 9am Des Moines time on its day`() {
        // 19:31:58 CDT on Oct 3 is 00:31:58Z on Oct 4; the day is the 3rd.
        assertEquals(millis("2026-10-03T14:00:00Z"), EventReminderTiming.fireAtMillis(event("2026-10-04T00:31:58+00:00")))
    }

    @Test
    fun `a SeatGeek 03_30 placeholder fires at 9am, not 2_30am`() {
        val row = event("2026-10-03T08:30:00+00:00", source = "seatgeek")
        assertEquals(millis("2026-10-03T14:00:00Z"), EventReminderTiming.fireAtMillis(row))
    }

    @Test
    fun `an explicit time_tbd fires at 9am on its Des Moines day`() {
        // 7pm CDT on Oct 4, flagged TBA: the day is the 4th.
        val row = event("2026-10-05T00:00:00+00:00", timeTbd = true)
        assertEquals(millis("2026-10-04T14:00:00Z"), EventReminderTiming.fireAtMillis(row))
    }

    @Test
    fun `a bare date fires on that day, not the evening before`() {
        // parsedDate reads it as UTC midnight, 7pm CDT on the 9th.
        assertEquals(millis("2026-07-10T14:00:00Z"), EventReminderTiming.fireAtMillis(event("2026-07-10")))
    }

    @Test
    fun `9am follows the zone, CST in winter`() {
        // 19:31:58 CST on Dec 5 is 01:31:58Z on Dec 6.
        assertEquals(millis("2026-12-05T15:00:00Z"), EventReminderTiming.fireAtMillis(event("2026-12-06T01:31:58+00:00")))
    }

    @Test
    fun `an unparseable date has no reminder`() {
        assertNull(EventReminderTiming.fireAtMillis(event("soon")))
    }

    // endregion

    // region offersReminder (AND-AUDIT-033: Saved rows and event detail share it)

    // 19:31:58 CDT on Oct 3, the no-time marker: its reminder is 9am CDT (14:00Z).
    private val tbaRow get() = event("2026-10-04T00:31:58+00:00")

    // 7pm CDT on Oct 3, a timed show.
    private val timedRow get() = event("2026-10-04T00:00:00+00:00")

    @Test
    fun `a past Saved row never offers a reminder, set or not`() {
        val before = millis("2026-10-03T12:00:00Z")
        assertFalse(EventReminderTiming.offersReminder(timedRow, isPast = true, isSet = false, nowMillis = before))
        assertFalse(EventReminderTiming.offersReminder(timedRow, isPast = true, isSet = true, nowMillis = before))
    }

    @Test
    fun `a TBA row offers a reminder before 9am on its day`() {
        val sevenAmCentral = millis("2026-10-03T12:00:00Z")
        assertTrue(EventReminderTiming.offersReminder(tbaRow, isPast = false, isSet = false, nowMillis = sevenAmCentral))
    }

    @Test
    fun `a TBA row stops offering one after 9am unless it is already set`() {
        // 10am CDT: the placeholder start (7:31pm) is still ahead, but the 9am reminder is not.
        val tenAmCentral = millis("2026-10-03T15:00:00Z")
        assertFalse(EventReminderTiming.offersReminder(tbaRow, isPast = false, isSet = false, nowMillis = tenAmCentral))
        assertTrue(EventReminderTiming.offersReminder(tbaRow, isPast = false, isSet = true, nowMillis = tenAmCentral))
    }

    @Test
    fun `a timed row offers one until it starts, and a set one after so it can be cancelled`() {
        val sixPmCentral = millis("2026-10-03T23:00:00Z")
        val eightPmCentral = millis("2026-10-04T01:00:00Z")
        assertTrue(EventReminderTiming.offersReminder(timedRow, isPast = false, isSet = false, nowMillis = sixPmCentral))
        assertFalse(EventReminderTiming.offersReminder(timedRow, isPast = false, isSet = false, nowMillis = eightPmCentral))
        assertTrue(EventReminderTiming.offersReminder(timedRow, isPast = false, isSet = true, nowMillis = eightPmCentral))
    }

    @Test
    fun `an unparseable date offers no reminder`() {
        assertFalse(EventReminderTiming.offersReminder(event("soon"), isPast = false, isSet = true, nowMillis = 0L))
    }

    @Test
    fun `a refused reminder says why`() {
        // 6:30pm CDT: under an hour before the 7pm show.
        assertEquals(
            "This event starts in under an hour, too soon for a reminder.",
            EventReminderTiming.refusedMessage(timedRow, millis("2026-10-03T23:30:00Z")),
        )
        assertEquals(
            "This event has no set time, so its reminder goes out at 9am that day, and that has passed.",
            EventReminderTiming.refusedMessage(tbaRow, millis("2026-10-03T15:00:00Z")),
        )
        // Still in time, so the schedule call itself failed.
        assertEquals(
            "Couldn't set the reminder. Please try again.",
            EventReminderTiming.refusedMessage(timedRow, millis("2026-10-03T12:00:00Z")),
        )
    }

    // endregion

    // region body

    @Test
    fun `the body says starts in 1 hour for a timed reminder`() {
        assertEquals(
            "Hoyt Sherman show starts in 1 hour at Hoyt Sherman Place",
            EventReminderTiming.body("Hoyt Sherman show", "Hoyt Sherman Place", isDayOf = false),
        )
    }

    @Test
    fun `the body says is today for a day-of reminder and drops a blank venue`() {
        assertEquals("Hoyt Sherman show is today", EventReminderTiming.body("Hoyt Sherman show", " ", isDayOf = true))
    }

    // endregion

    // region EventTimeText

    @Test
    fun `a timed row reads in Des Moines time, not the UTC offset it arrived with`() {
        val row = event("2026-10-04T00:00:00+00:00")
        assertEquals("Sat, Oct 3 · 7:00 PM", EventTimeText.dateTimeText(row, "EEE, MMM d", "h:mm a", " · "))
        assertEquals("Saturday, October 3, 7:00 PM", EventTimeText.spokenDateTime(row, "EEEE, MMMM d"))
    }

    @Test
    fun `a TBA row reads Time TBA on its Des Moines day`() {
        val marker = event("2026-10-04T00:31:58+00:00")
        assertEquals("Oct 3, Time TBA", EventTimeText.dateTimeText(marker, "MMM d", "h:mm a", ", "))
        assertEquals("Time TBA", EventTimeText.timeText(marker))
        assertEquals("Saturday, October 3, time to be announced", EventTimeText.spokenDateTime(marker, "EEEE, MMMM d"))

        val seatGeek = event("2026-10-03T08:30:00+00:00", source = "seatgeek")
        assertEquals("Oct 3, Time TBA", EventTimeText.dateTimeText(seatGeek, "MMM d", "h:mm a", ", "))
    }

    @Test
    fun `a bare date keeps its own day`() {
        assertEquals("Jul 10, Time TBA", EventTimeText.dateTimeText(event("2026-07-10"), "MMM d", "h:mm a", ", "))
    }

    @Test
    fun `an unparseable date has no text`() {
        assertNull(EventTimeText.dateTimeText(event("soon"), "MMM d", "h:mm a", ", "))
        assertNull(EventTimeText.timeText(event("soon")))
    }

    // endregion
}
