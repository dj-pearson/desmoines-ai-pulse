package com.desmoines.aipulse.util

import com.desmoines.aipulse.data.model.Event
import java.time.LocalTime

/**
 * When an event reminder fires and what it says, decided without
 * android.app so a JVM test can reach it (AND-AUDIT-029). Mirrors iOS
 * LocalNotificationService.reminderFireDate (IOS-DD-EVENTS-05):
 *  - A timed event: an hour before the start.
 *  - A row with no real start time: 9:00 Des Moines time on its day, since
 *    "an hour before" a time nobody published means nothing. It used to fire
 *    an hour before the 19:31:58 marker or SeatGeek's 03:30 placeholder, so a
 *    reminder for a TBA show arrived at 6:31pm or 2:30am saying "starts in
 *    1 hour".
 */
object EventReminderTiming {
    /** A timed event's reminder fires this long before the start (matching iOS). */
    const val TIMED_OFFSET_MILLIS: Long = 3_600_000L

    /** A time-TBA event's reminder fires at this Des Moines wall time on its day. */
    val DAY_OF_TIME: LocalTime = LocalTime.of(9, 0)

    /** Epoch millis the reminder for [event] fires at, or null when its date does not parse. */
    fun fireAtMillis(event: Event): Long? {
        val start = event.parsedDate ?: return null
        if (event.hasSpecificTime) return start.toInstant().toEpochMilli() - TIMED_OFFSET_MILLIS
        val day = EventTimeText.desMoinesDay(event) ?: return null
        return day.atTime(DAY_OF_TIME).atZone(EventSlug.CENTRAL).toInstant().toEpochMilli()
    }

    /** The notification body; [isDayOf] is true for a reminder scheduled by the TBA rule. */
    fun body(title: String, venue: String?, isDayOf: Boolean): String = buildString {
        append(title)
        append(if (isDayOf) " is today" else " starts in 1 hour")
        if (!venue.isNullOrBlank()) append(" at $venue")
    }
}
