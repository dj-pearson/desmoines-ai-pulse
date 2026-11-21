package com.desmoines.aipulse.util

import com.desmoines.aipulse.data.model.Event
import java.time.Duration
import java.time.Instant
import java.time.LocalDate
import java.time.format.DateTimeFormatter

/**
 * An `events` row read for a series page: the row plus the three switches
 * every other list filters out in the query. A series page lists past
 * editions, and a past edition is exactly a row the stale sweep has hidden,
 * so these rows are read with hidden and archived ones included and
 * [EventSeriesSchedule] decides per row. iOS SeriesEventRow.
 */
data class SeriesEventRow(
    val event: Event,
    val isHidden: Boolean? = null,
    val hiddenAt: String? = null,
    val archivedAt: String? = null,
) {
    val isLive: Boolean get() = isHidden != true && archivedAt == null
}

/** One Des Moines day of a series. */
data class SeriesInstance(
    val row: SeriesEventRow,
    /** Central day of the start. */
    val day: LocalDate,
    /** The event id to open, or null when its page no longer resolves. */
    val linkId: String?,
    val isOver: Boolean,
) {
    val id: String get() = row.event.id
}

/** One year of a series. */
data class SeriesEdition(
    val year: Int,
    /** One per Central day, soonest first. */
    val instances: List<SeriesInstance>,
    /** Distinct venue names, in order of first appearance. */
    val venues: List<String>,
    /** Central day of the first instance. */
    val firstDay: LocalDate,
    /** Central day the edition ends: the last instance, or a later end_date. */
    val lastDay: LocalDate,
)

/** What a series screen shows. */
data class SeriesSchedule(
    /** The edition with something still to come, or null. */
    val current: SeriesEdition?,
    /** Every other edition, newest first. */
    val past: List<SeriesEdition>,
    /**
     * When nothing is current, the year whose date is not out yet: the year
     * after the latest edition, or this year if that is later.
     */
    val unannouncedYear: Int?,
    /** The newest edition's first venue. */
    val venue: String?,
    val total: Int,
)

/**
 * AND-AUDIT-042, slice 2: a port of the web's src/lib/eventSeriesView.ts
 * selection rules (isModeratorHidden, isLinkable, buildSeriesView, the date
 * labels), as iOS ports them in EventSeriesSchedule.swift, so the native
 * series screen lists the same editions the web page does:
 *
 *     visible (not hidden, not archived)  listed and linked
 *     archived_at set                     listed and linked (a past event)
 *     hidden by the stale sweep           listed, not linked: its page is gone
 *     hidden by a moderator               left out
 *
 * The sweep and a moderator both set is_hidden. The sweep only hides a row
 * whose date has passed, so a row hidden on or before its own Central day was
 * taken down by a person.
 */
object EventSeriesSchedule {
    /** No usable end_date on a timed row: the web's DEFAULT_EVENT_HOURS. */
    private val DEFAULT_DURATION: Duration = Duration.ofHours(3)

    /** Central day of an instant. */
    fun centralDay(instant: Instant): LocalDate = instant.atZone(EventSlug.CENTRAL).toLocalDate()

    /** Central day of a row's start (the web's eventCentralDate), or null without a parseable date. */
    fun centralDay(row: SeriesEventRow): LocalDate? = row.event.parsedDate?.toInstant()?.let(::centralDay)

    /** True when a person, not the stale sweep, hid this row. */
    fun isModeratorHidden(row: SeriesEventRow): Boolean {
        if (row.isHidden != true) return false
        val day = centralDay(row) ?: return true
        val hiddenDay = row.hiddenAt?.let { EventSlug.centralDate(it) } ?: return true
        return !hiddenDay.isAfter(day)
    }

    /** The event page still opens this row (live, or archived as a past event). */
    fun isLinkable(row: SeriesEventRow): Boolean = row.isHidden != true

    /**
     * When the row counts as over, the web's eventEnd: a stated end_date at or
     * after the start (the end of its Central day for an untimed row), else
     * the end of the start's Central day untimed, else three hours in.
     */
    fun eventEnd(event: Event): Instant? {
        val start = event.parsedDate?.toInstant() ?: return null
        val hasTime = event.hasSpecificTime
        val explicit = event.parsedEndDate?.toInstant()
        if (explicit != null && !explicit.isBefore(start)) {
            return if (hasTime) explicit else dayEnd(explicit)
        }
        if (!hasTime) return dayEnd(start)
        return start.plus(DEFAULT_DURATION)
    }

    /** The web's isEventOver: strictly after [eventEnd]; never over without a date. */
    fun isOver(event: Event, now: Instant): Boolean = eventEnd(event)?.let { now.isAfter(it) } ?: false

    /** One millisecond before the next Central day starts, as the web's dayEnd. */
    private fun dayEnd(instant: Instant): Instant =
        centralDay(instant).plusDays(1).atStartOfDay(EventSlug.CENTRAL).toInstant().minusMillis(1)

    /**
     * The Central day a stated end_date puts the run's end on, or null without
     * one. Only a real end_date counts: a timed row's assumed three-hour end
     * could cross midnight and invent a second day.
     */
    private fun runEndDay(row: SeriesEventRow): LocalDate? {
        if (row.event.endDate.isNullOrBlank()) return null
        return eventEnd(row.event)?.let(::centralDay)
    }

    /**
     * Live rows win a day, then archived, then hidden; ties go to the shorter
     * title ("Hinterland 2026 Music Festival" over a day-pass row).
     */
    private fun preferred(a: SeriesEventRow, b: SeriesEventRow): SeriesEventRow {
        fun rank(r: SeriesEventRow) = if (r.isLive) 0 else if (r.isHidden == true) 2 else 1
        if (rank(a) != rank(b)) return if (rank(a) < rank(b)) a else b
        return if (a.event.title.length <= b.event.title.length) a else b
    }

    /**
     * Group a series' rows into editions by Central year and pick the current
     * one. [def] filters again, since the query is a loose ilike: "Backyard BBQ
     * Contest at Beaverdale Fall Festival" is not an edition.
     */
    fun build(def: EventSeriesDef, rows: List<SeriesEventRow>, now: Instant = Instant.now()): SeriesSchedule {
        val members = rows.filter { row ->
            EventSeries.forEvent(row.event.title, row.event.venue, row.event.location)?.slug == def.slug &&
                !isModeratorHidden(row)
        }

        val byDay = sortedMapOf<LocalDate, SeriesEventRow>()
        for (row in members) {
            val day = centralDay(row) ?: continue
            byDay[day] = byDay[day]?.let { preferred(it, row) } ?: row
        }

        val instances = byDay.map { (day, row) ->
            SeriesInstance(
                row = row,
                day = day,
                linkId = if (isLinkable(row)) row.event.id else null,
                isOver = isOver(row.event, now),
            )
        }

        val editions = sortedMapOf<Int, SeriesEdition>()
        for (instance in instances) {
            val year = instance.day.year
            val held = editions[year]
                ?: SeriesEdition(year, emptyList(), emptyList(), instance.day, instance.day)
            val venue = listOf(instance.row.event.venue, instance.row.event.location)
                .mapNotNull { it?.trim() }
                .firstOrNull { it.isNotEmpty() }
            val until = runEndDay(instance.row) ?: instance.day
            editions[year] = held.copy(
                instances = held.instances + instance,
                venues = if (venue != null && venue !in held.venues) held.venues + venue else held.venues,
                lastDay = if (until.isAfter(held.lastDay)) until else held.lastDay,
            )
        }
        val ordered = editions.values.toList()

        // The earliest edition with a live date still to come. A sweep-hidden
        // row is over by construction, so `!isOver` already excludes it.
        val current = ordered.firstOrNull { edition ->
            edition.instances.any { !it.isOver && it.row.isLive }
        }
        val past = ordered.filter { it.year != current?.year }.reversed()

        val thisYear = centralDay(now).year
        val unannouncedYear = if (current == null) {
            maxOf(ordered.lastOrNull()?.let { it.year + 1 } ?: thisYear, thisYear)
        } else {
            null
        }

        return SeriesSchedule(
            current = current,
            past = past,
            unannouncedYear = unannouncedYear,
            venue = (current ?: past.firstOrNull())?.venues?.firstOrNull(),
            total = instances.size,
        )
    }

    /** A Central day in words, e.g. "Friday, October 2, 2026" (the web's centralDayWords). */
    fun dayWords(day: LocalDate, pattern: String = "EEEE, MMMM d, yyyy"): String =
        day.format(DateTimeFormatter.ofPattern(pattern, UiFormatLocale))

    /**
     * "Friday, October 2, 2026", or "Thursday, July 30 to Sunday, August 2,
     * 2026" for an edition over several days (the web's editionDateLabel).
     */
    fun editionDateLabel(edition: SeriesEdition): String {
        if (edition.firstDay == edition.lastDay) return dayWords(edition.firstDay)
        val sameYear = edition.firstDay.year == edition.lastDay.year
        val from = dayWords(edition.firstDay, if (sameYear) "EEEE, MMMM d" else "EEEE, MMMM d, yyyy")
        return "$from to ${dayWords(edition.lastDay)}"
    }

    /** What the page says when no edition is current (the web's unannouncedLabel). */
    fun unannouncedLabel(year: Int): String = "$year date not announced yet"

    // AND-AUDIT-042, slice 3b: the lines the native screen prints, kept here
    // so they are JVM-tested rather than buried in Compose. Each is the web
    // page's (src/pages/EventSeriesPage.tsx) and iOS EventSeriesView's.

    /** "2026 dates" over the current edition, else over the unannounced year. */
    fun currentHeading(schedule: SeriesSchedule): String? =
        (schedule.current?.year ?: schedule.unannouncedYear)?.let { "$it dates" }

    /** A past year's line: "Friday, October 2, 2026, Water Works Park" (venues joined by " and "). */
    fun editionSummary(edition: SeriesEdition): String {
        val dates = editionDateLabel(edition)
        return if (edition.venues.isEmpty()) dates else "$dates, ${edition.venues.joinToString(" and ")}"
    }

    /** "Sun, Aug 30: 11th Annual Cloris Awards". */
    fun instanceTitle(instance: SeriesInstance): String =
        "${dayWords(instance.day, "EEE, MMM d")}: ${instance.row.event.title}"

    /**
     * "6:00 PM - Drake University": the Central start time when the row has
     * one, then the venue or location. Null when there is neither.
     */
    fun instanceDetail(instance: SeriesInstance): String? {
        val event = instance.row.event
        val time = if (event.hasSpecificTime) EventTimeText.timeText(event) else null
        val place = listOf(event.venue, event.location)
            .mapNotNull { it?.trim() }
            .firstOrNull { it.isNotEmpty() }
        return listOfNotNull(time, place).joinToString(" - ").ifEmpty { null }
    }
}
