package com.desmoines.aipulse.util

import com.desmoines.aipulse.data.model.Event
import java.net.URLDecoder
import java.time.LocalDate

/**
 * The web's /events/date-night rule (src/pages/DateNightEvents.tsx), which iOS
 * runs natively as Search (IOS-AUDIT-008). Android opened the web page in a
 * web view (AND-AUDIT-045); it now lists the same rows itself (AND-AUDIT-046):
 *
 *  - DATE_NIGHT_FILTER from src/hooks/useEventLanding.ts as one or-group:
 *    the canonical Music, Comedy and Arts categories, or an evening-out word
 *    in the title, matched on Postgres word boundaries.
 *  - A fixed window of [WINDOW_DAYS] Des Moines days from today.
 *  - Evening starts only ([isEveningStart]) unless the link says ?time=all.
 *
 * src/lib/__tests__/androidDateNightParity.test.ts reads the constants below
 * and holds them equal to the web, so keep each on one line in this shape.
 */
object DateNightFilter {

    /** Which rows a date night list keeps: evenings (the web's default) or all. */
    enum class Times { EVENING, ANY_TIME }

    /** The category arm: `category.in.(Music,Comedy,Arts)`. */
    val CATEGORIES: List<String> = listOf("Music", "Comedy", "Arts")

    /** The title arm, the web's wordRe of these alternatives. */
    val TITLE_PATTERN: String = KidsEventsFilter.wordPattern("concerts?|live music|wine|dinner|comedy|jazz|tasting")

    /**
     * The or() body as supabase-kt's `or { isIn(...); imatch(...) }` renders
     * it, without the surrounding parentheses. Equal to DATE_NIGHT_FILTER.
     */
    val OR_GROUP: String = "category.in.(${CATEGORIES.joinToString(",")}),title.imatch.$TITLE_PATTERN"

    /** The web page's WINDOW_DAYS. */
    const val WINDOW_DAYS = 14

    /** Central hour the evening starts: EVENING_START_HOUR in src/lib/tonightTime.ts. */
    const val EVENING_START_HOUR = 16

    /** Central hour the night ends (exclusive): NIGHT_END_HOUR there. */
    const val NIGHT_END_HOUR = 4

    /** Rows shown, as for any Search list. */
    const val RESULT_LIMIT = 20

    /** Rows fetched when evenings are filtered on the phone, as iOS asks for. */
    const val EVENING_FETCH_LIMIT = 60

    /** The web's ?time= value that shows every start time. */
    private const val ALL_TIMES = "all"

    /** ?time=all shows every time; anything else, or none, is evenings only. */
    fun timesFor(url: String): Times =
        if (queryParameter(url, "time") == ALL_TIMES) Times.ANY_TIME else Times.EVENING

    /**
     * PostgREST bounds (gte start, lt end): Central midnight today to Central
     * midnight [WINDOW_DAYS] days later, the web's range today..today+13.
     */
    fun windowBounds(today: LocalDate = EventTimeText.desMoinesToday()): Pair<String, String> =
        EventTimeText.centralMidnight(today) to EventTimeText.centralMidnight(today.plusDays(WINDOW_DAYS.toLong()))

    /**
     * The web's isEveningStart: a known start from 4 PM to before 4 AM Central.
     * A row with no real time (time_tbd, 19:31:58, a bare date) is not an
     * evening row, or its 7:31 PM placeholder would count. The instant is
     * event_start_utc, else date, as the web's landingStartInstant reads it.
     */
    fun isEveningStart(event: Event): Boolean {
        if (!event.hasSpecificTime) return false
        val start = event.eventStartUtc?.takeIf { it.isNotBlank() }?.let { Event.parseTimestamp(it) }
            ?: event.parsedDate
            ?: return false
        val hour = start.atZoneSameInstant(EventSlug.CENTRAL).hour
        return hour >= EVENING_START_HOUR || hour < NIGHT_END_HOUR
    }

    /** The Search chip: "Date night", a middle dot, then "Evenings" or "Any time". */
    fun chipLabel(times: Times): String = "Date night \u00b7 " + if (times == Times.EVENING) "Evenings" else "Any time"

    /** The chip's spoken name, ahead of "filter on". */
    fun chipSpokenName(times: Times): String =
        if (times == Times.EVENING) "Date night, evenings only," else "Date night, any time,"

    /** What an empty date night list says. */
    fun emptyMessage(times: Times): String =
        if (times == Times.EVENING) {
            "No date night events start in the evening in the next $WINDOW_DAYS days. Try removing the filter."
        } else {
            "No date night events in the next $WINDOW_DAYS days. Try removing the filter."
        }

    /** One query parameter of [url], decoded; null when absent. No android.net.Uri, so JVM tests reach it. */
    private fun queryParameter(url: String, name: String): String? {
        val query = url.substringAfter('?', "").substringBefore('#')
        if (query.isEmpty()) return null
        return query.split('&').firstNotNullOfOrNull { pair ->
            val key = pair.substringBefore('=')
            if (key == name) URLDecoder.decode(pair.substringAfter('=', ""), "UTF-8") else null
        }
    }
}
