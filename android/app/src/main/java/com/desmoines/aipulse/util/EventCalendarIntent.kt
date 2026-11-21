package com.desmoines.aipulse.util

import android.content.Context
import android.content.Intent
import android.provider.CalendarContract
import android.widget.Toast
import com.desmoines.aipulse.data.model.Event

/**
 * The Add to Calendar intent and its launch, shared by event detail and the
 * Saved tab (AND-AUDIT-028) so the two cannot drift. iOS shares
 * EventCalendarWriter between the same two screens for the same reason.
 *
 * What goes in the entry is decided by [EventCalendarEntry]; this only turns
 * it into a CalendarContract insert and starts it.
 */
object EventCalendarIntent {

    /** The toast event detail has always shown when no calendar app resolves. */
    const val NO_CALENDAR_APP = "No calendar app available."

    fun build(entry: EventCalendarEntry): Intent =
        Intent(Intent.ACTION_INSERT).apply {
            data = CalendarContract.Events.CONTENT_URI
            putExtra(CalendarContract.Events.TITLE, entry.title)
            putExtra(CalendarContract.EXTRA_EVENT_BEGIN_TIME, entry.startMillis)
            putExtra(CalendarContract.EXTRA_EVENT_END_TIME, entry.endMillis)
            putExtra(CalendarContract.EXTRA_EVENT_ALL_DAY, entry.isAllDay)
            putExtra(CalendarContract.Events.EVENT_TIMEZONE, entry.timeZoneId)
            putExtra(CalendarContract.Events.EVENT_LOCATION, entry.location)
            putExtra(CalendarContract.Events.DESCRIPTION, entry.description)
        }

    /** Null when the event has no parseable date. */
    fun build(event: Event): Intent? = EventCalendarEntry.from(event)?.let(::build)

    /**
     * Starts [intent]. No calendar app resolves it on some tablets and Android
     * Go devices; an unguarded startActivity there is an
     * ActivityNotFoundException crash, so that case shows [NO_CALENDAR_APP]
     * and returns false.
     */
    fun launch(context: Context, intent: Intent): Boolean {
        val started = SafeLinkLauncher.start(context, intent)
        if (!started) {
            Toast.makeText(context, NO_CALENDAR_APP, Toast.LENGTH_SHORT).show()
        }
        return started
    }
}
