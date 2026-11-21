package com.desmoines.aipulse.util

import com.desmoines.aipulse.data.model.Event
import java.net.URLEncoder
import java.nio.charset.StandardCharsets

/**
 * What sharing an event sends, shared by event detail and the Saved tab
 * (AND-AUDIT-033) so the two cannot drift.
 *
 * The text used to end "Found on Des Moines Insider" with no link, so the
 * person it was sent to had nothing to tap. It now carries the event's page,
 * the same URL iOS shares (EventDetailViewModel.shareURL and the Saved row's
 * ShareLink). DeepLinkHandler routes /events/<id> back into the app, so a
 * friend with the app installed lands on the same screen.
 */
object EventShareText {

    /** The chooser title event detail has always used. */
    const val CHOOSER_TITLE = "Share Event"

    /** The event's page on the site: SITE_URL/events/<id>. */
    fun url(eventId: String): String =
        "${Config.SITE_URL}/events/" +
            URLEncoder.encode(eventId, StandardCharsets.UTF_8.name()).replace("+", "%20")

    /**
     * Title, the Des Moines day and time ("Time TBA" for a row with no real
     * start), the location, then the link. A row whose date does not parse
     * skips the day rather than guessing one.
     */
    fun text(event: Event): String {
        val parts = mutableListOf(event.title)
        EventTimeText.dayText(event, "MMM d, yyyy")?.let { day ->
            val time = EventTimeText.timeText(event)
            parts.add(if (event.hasSpecificTime) "$day $time" else "$day (${EventTimeText.TIME_TBA})")
        }
        parts.add("at ${event.displayLocation}")
        return parts.joinToString(" - ") + "\n\nFound on Des Moines Insider: " + url(event.id)
    }
}
