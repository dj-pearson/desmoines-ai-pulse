package com.desmoines.aipulse.util

import com.desmoines.aipulse.data.model.Event
import java.time.Duration
import java.time.LocalDate
import java.time.ZoneOffset

/**
 * What an Add to Calendar entry for an event should hold, decided without
 * android.content so a JVM test can reach it (AND-AUDIT-027). Mirrors iOS
 * EventCalendarEntry (IOS-AUDIT-FEAT-039), which event detail and the Saved
 * tab share so they cannot drift.
 *
 * The rules, iOS's and the web's:
 *  - A timed row runs to end_date when that is after the start, else three
 *    hours. The Android intent used to say two hours and ignore end_date, so
 *    a three-day festival went on the calendar as a two-hour block.
 *  - A row with no real start time (time_tbd, the 19:31:58 marker, SeatGeek's
 *    03:30 placeholder, a bare date) is an all-day entry on its Des Moines
 *    day. It used to become a 7:31pm or 3:30am two-hour block.
 *  - The time zone is Des Moines', not the device's.
 *
 * All-day millis follow CalendarContract's rule for all-day rows: time zone
 * UTC, start at UTC midnight of the first day, end at UTC midnight after the
 * last day (exclusive).
 */
data class EventCalendarEntry(
    val title: String,
    val startMillis: Long,
    val endMillis: Long,
    val isAllDay: Boolean,
    val location: String,
    val description: String,
    val timeZoneId: String,
) {
    companion object {
        /** No usable end_date: the web and iOS both assume three hours. */
        val DEFAULT_DURATION: Duration = Duration.ofHours(3)

        /** CalendarContract.Time.TIMEZONE_UTC, which all-day rows must carry. */
        const val ALL_DAY_TIME_ZONE = "UTC"

        /** Null when the event has no parseable date: nothing to put on a calendar. */
        fun from(event: Event): EventCalendarEntry? {
            val start = event.parsedDate ?: return null
            val end = event.parsedEndDate
            val zone = EventSlug.CENTRAL.id

            if (event.hasSpecificTime) {
                val endInstant = end?.takeIf { it.isAfter(start) } ?: start.plus(DEFAULT_DURATION)
                return EventCalendarEntry(
                    title = event.title,
                    startMillis = start.toInstant().toEpochMilli(),
                    endMillis = endInstant.toInstant().toEpochMilli(),
                    isAllDay = false,
                    location = event.displayLocation,
                    description = event.displayDescription,
                    timeZoneId = zone,
                )
            }

            val firstDay = EventSlug.centralDate(event.date) ?: start.atZoneSameInstant(EventSlug.CENTRAL).toLocalDate()
            // An end_date at 00:00 Central is a date with no time, so that whole
            // day is in the run - the same reading iOS isOver uses.
            val lastDay = event.endDate?.let { EventSlug.centralDate(it) }
                ?.takeIf { !it.isBefore(firstDay) }
                ?: firstDay
            return EventCalendarEntry(
                title = event.title,
                startMillis = utcMidnight(firstDay),
                endMillis = utcMidnight(lastDay.plusDays(1)),
                isAllDay = true,
                location = event.displayLocation,
                description = event.displayDescription,
                timeZoneId = ALL_DAY_TIME_ZONE,
            )
        }

        /**
         * The entry a Saved row's Add to Calendar would write, or null when the
         * row must not offer it (AND-AUDIT-028): a past row, or one with no
         * parseable date. Same rule as iOS showsAddToCalendar, and the same
         * entry event detail builds, so the two screens cannot disagree.
         */
        fun forSavedRow(event: Event, isPast: Boolean): EventCalendarEntry? =
            if (isPast) null else from(event)

        private fun utcMidnight(day: LocalDate): Long =
            day.atStartOfDay(ZoneOffset.UTC).toInstant().toEpochMilli()
    }
}
