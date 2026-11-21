package com.desmoines.aipulse.util

import com.desmoines.aipulse.data.model.Event
import java.time.Instant

/**
 * Whether event detail should treat a row as an event that has already
 * happened (AND-AUDIT-044).
 *
 * Detail is reached for past rows from the series screen's earlier years,
 * Saved's Past section and old links, and it used to present every one of
 * them as upcoming: Add to Calendar on a show from 2024, no word that it was
 * over. The web's event page decides with `isUpcoming = !timing.isOver &&
 * !archived` (src/pages/EventDetails.tsx) and shows "Past event"; iOS shows
 * "This event has already happened" for an archived row (IOS-AUDIT-001).
 *
 * Over is the web's isEventOver, through [EventSeriesSchedule.isOver], so day
 * two of a three-day festival is not past, and an untimed row stays current
 * until its Des Moines day ends. An archived row is past whatever its dates
 * say, as on the web: the archive sweep only retires rows that have ended.
 */
object EventPastState {

    /** The line detail shows under the date for a past row (iOS pastEventBanner). */
    const val BANNER_TEXT: String = "This event has already happened"

    fun isPast(event: Event, now: Instant = Instant.now()): Boolean =
        !event.archivedAt.isNullOrBlank() || EventSeriesSchedule.isOver(event, now)

    /**
     * Add to Calendar needs a date to write and an event still to come; a
     * calendar entry for something already over is noise in the user's
     * calendar.
     */
    fun offersAddToCalendar(event: Event, isPast: Boolean): Boolean =
        event.parsedDate != null && !isPast
}
