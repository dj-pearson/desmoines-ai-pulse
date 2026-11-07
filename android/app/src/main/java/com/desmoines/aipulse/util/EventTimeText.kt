package com.desmoines.aipulse.util

import com.desmoines.aipulse.data.model.Event
import java.time.LocalDate
import java.time.ZonedDateTime
import java.time.format.DateTimeFormatter

/**
 * How an event's day and start time read on screen (AND-AUDIT-029), in
 * Des Moines time, with "Time TBA" in place of a placeholder time. Mirrors
 * iOS cardDateText and EventDetailHeader.timeText (IOS-DD-EVENTS-05).
 *
 * Two things this replaces at the call sites:
 *  - A row with no real start time (time_tbd, the 19:31:58 marker, SeatGeek's
 *    03:30, a bare date) printed that placeholder as if it were the showtime.
 *  - Every time was formatted in the offset the string arrived with, which
 *    from PostgREST is +00:00, so a 7pm Central show read "12:00 AM" on the
 *    next day.
 */
object EventTimeText {
    const val TIME_TBA = "Time TBA"
    const val TIME_TBA_SPOKEN = "time to be announced"

    /** The start instant on the Des Moines clock, or null when the date does not parse. */
    fun desMoinesStart(event: Event): ZonedDateTime? =
        event.parsedDate?.atZoneSameInstant(EventSlug.CENTRAL)

    /**
     * The Des Moines day the row is on. A row with no time takes its day from
     * the date string, the rule EventCalendarEntry uses, so a bare
     * "2026-07-10" is the 10th and not 7pm on the 9th.
     */
    fun desMoinesDay(event: Event): LocalDate? {
        val start = desMoinesStart(event) ?: return null
        if (event.hasSpecificTime) return start.toLocalDate()
        return EventSlug.centralDate(event.date) ?: start.toLocalDate()
    }

    /** The day in [pattern], or null when the date does not parse. */
    fun dayText(event: Event, pattern: String): String? =
        desMoinesDay(event)?.format(formatter(pattern))

    /** The start time in [pattern], or [TIME_TBA]; null when the date does not parse. */
    fun timeText(event: Event, pattern: String = "h:mm a"): String? {
        val start = desMoinesStart(event) ?: return null
        return if (event.hasSpecificTime) start.format(formatter(pattern)) else TIME_TBA
    }

    /** Day and time joined by [separator], e.g. "Sat, Oct 3 · Time TBA". */
    fun dateTimeText(event: Event, dayPattern: String, timePattern: String, separator: String): String? {
        val day = dayText(event, dayPattern) ?: return null
        val time = timeText(event, timePattern) ?: return null
        return day + separator + time
    }

    /** The screen-reader form: "Saturday, October 3, 7:00 PM" or "..., time to be announced". */
    fun spokenDateTime(event: Event, dayPattern: String, timePattern: String = "h:mm a"): String? {
        val day = dayText(event, dayPattern) ?: return null
        if (!event.hasSpecificTime) return "$day, $TIME_TBA_SPOKEN"
        val time = timeText(event, timePattern) ?: return null
        return "$day, $time"
    }

    private fun formatter(pattern: String): DateTimeFormatter = DateTimeFormatter.ofPattern(pattern, UiFormatLocale)
}
