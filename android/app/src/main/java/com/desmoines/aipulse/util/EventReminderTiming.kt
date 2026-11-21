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

    /**
     * Whether a reminder control belongs on [event]: the one rule event detail
     * and Saved rows share (AND-AUDIT-033), matching iOS EventDetailActions and
     * FavoriteEventRow.
     *  - A past row ([isPast], as the Saved list splits it) never offers one;
     *    iOS's Saved context menu shows Remind me on upcoming rows only.
     *  - A set reminder is offered otherwise, so it can be cancelled.
     *  - A row with no real start time offers one until its 9am day-of fire
     *    time passes (AND-AUDIT-029); the placeholder start would keep it up
     *    into the evening for a reminder that can no longer be set.
     *  - A timed row offers one until it starts.
     */
    fun offersReminder(event: Event, isPast: Boolean, isSet: Boolean, nowMillis: Long): Boolean {
        if (isPast) return false
        val startMillis = event.parsedDate?.toInstant()?.toEpochMilli() ?: return false
        if (isSet) return true
        if (!event.hasSpecificTime) {
            val fire = fireAtMillis(event) ?: return false
            return fire > nowMillis
        }
        return startMillis >= nowMillis
    }

    /** Shown when the user declines POST_NOTIFICATIONS; nothing is scheduled. */
    const val PERMISSION_DENIED_MESSAGE: String =
        "Notifications are off for Des Moines Insider, so a reminder couldn't reach you. " +
            "Turn them on in Settings to use reminders."

    /**
     * Why a request to set a reminder on [event] did not take: too close to
     * the start, past 9am for a TBA row, or the schedule call itself failed.
     */
    fun refusedMessage(event: Event, nowMillis: Long): String {
        val fire = fireAtMillis(event)
        return if (fire != null && fire <= nowMillis) {
            if (event.hasSpecificTime) {
                "This event starts in under an hour, too soon for a reminder."
            } else {
                "This event has no set time, so its reminder goes out at 9am that day, and that has passed."
            }
        } else {
            "Couldn't set the reminder. Please try again."
        }
    }

    /** The notification body; [isDayOf] is true for a reminder scheduled by the TBA rule. */
    fun body(title: String, venue: String?, isDayOf: Boolean): String = buildString {
        append(title)
        append(if (isDayOf) " is today" else " starts in 1 hour")
        if (!venue.isNullOrBlank()) append(" at $venue")
    }
}
