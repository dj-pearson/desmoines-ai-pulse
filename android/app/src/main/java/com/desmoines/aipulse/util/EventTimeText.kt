package com.desmoines.aipulse.util

import com.desmoines.aipulse.data.model.Event
import java.time.LocalDate
import java.time.ZonedDateTime
import java.time.format.DateTimeFormatter
import java.time.temporal.ChronoUnit

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

    /** Today on the Des Moines clock, which is the day every comparison below means. */
    fun desMoinesToday(): LocalDate = LocalDate.now(EventSlug.CENTRAL)

    /**
     * Des Moines days from [today] to the row's day: 0 today, 1 tomorrow,
     * negative once it has passed. Null when the date does not parse
     * (AND-AUDIT-030; it compared UTC days, so a 7pm show read as tomorrow).
     */
    fun daysFromToday(event: Event, today: LocalDate = desMoinesToday()): Long? {
        val day = desMoinesDay(event) ?: return null
        return ChronoUnit.DAYS.between(today, day)
    }

    /** "Today", "Tomorrow" or "In N days" up to a week out, else null. Backs Event.urgencyLabel. */
    fun urgencyLabel(event: Event, today: LocalDate = desMoinesToday()): String? =
        when (val days = daysFromToday(event, today)) {
            null -> null
            0L -> "Today"
            1L -> "Tomorrow"
            in 2L..7L -> "In $days days"
            else -> null
        }

    /**
     * Whether the row is behind [now]. A timed row compares instants; a row
     * with no real time is past only once its Des Moines day is, so a bare
     * date does not drop into Past at 7pm the evening before. Null when the
     * date does not parse.
     */
    fun hasPassed(event: Event, now: ZonedDateTime = ZonedDateTime.now(EventSlug.CENTRAL)): Boolean? {
        val start = desMoinesStart(event) ?: return null
        if (event.hasSpecificTime) return start.isBefore(now)
        val day = desMoinesDay(event) ?: return null
        return day.isBefore(now.withZoneSameInstant(EventSlug.CENTRAL).toLocalDate())
    }

    /** Rows bucketed by their Des Moines day, in start order. Backs the Weekend tab's Fri/Sat/Sun split. */
    fun groupByDesMoinesDay(events: List<Event>): Map<LocalDate?, List<Event>> =
        events.sortedBy { it.parsedDate }.groupBy { desMoinesDay(it) }

    /**
     * Midnight starting [day] in Des Moines, with its offset, for a PostgREST
     * range bound: "2026-07-03T00:00:00-05:00". A bare "2026-07-03T00:00:00" is
     * read as UTC, which is 7pm the evening before in Central.
     */
    fun centralMidnight(day: LocalDate): String =
        day.atStartOfDay(EventSlug.CENTRAL).toOffsetDateTime().format(DateTimeFormatter.ISO_OFFSET_DATE_TIME)

    private fun formatter(pattern: String): DateTimeFormatter = DateTimeFormatter.ofPattern(pattern, UiFormatLocale)
}
