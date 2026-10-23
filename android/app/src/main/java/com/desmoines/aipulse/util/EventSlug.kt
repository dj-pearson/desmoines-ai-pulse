package com.desmoines.aipulse.util

import java.time.Instant
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.OffsetDateTime
import java.time.ZoneId
import java.time.format.DateTimeParseException
import java.util.Locale

/**
 * The web's event slug, `<title-slug>-<YYYY-MM-DD>` with the date in Central
 * Time (AND-OVH-022). Events have no `slug` column, so a web URL such as
 * /events/come-from-away-2026-10-03 has to be resolved the way
 * src/hooks/useEventBySlug.ts does it: query the day the slug names, then keep
 * the row whose title slugs to the same thing.
 *
 * [slugify] and [create] must stay character-for-character equal to the web's
 * createSlug (src/lib/slug.ts) and createEventSlugWithCentralTime
 * (src/lib/timezone.ts). EventSlugTest pins vectors produced by running the web
 * implementation; if one of them changes, the other has to change with it or
 * every shared event link stops opening in the app.
 */
object EventSlug {

    val CENTRAL: ZoneId = ZoneId.of("America/Chicago")

    data class Parsed(val titleSlug: String, val date: LocalDate)

    /** The fields a slug is derived from, for picking among candidate rows. */
    data class Candidate(
        val id: String,
        val title: String?,
        val date: String?,
        val eventStartUtc: String?,
    )

    private val NON_ALNUM = Regex("[^a-z0-9]+")
    private val EDGE_HYPHEN = Regex("^-|-$")
    private val DATE_SUFFIX = Regex("^(.*)-(\\d{4})-(\\d{2})-(\\d{2})$")
    private val SHORT_OFFSET = Regex("[+-]\\d{2}$")

    /** The web's createSlug: lowercase, runs of non-[a-z0-9] become one hyphen, edges trimmed. */
    fun slugify(title: String?): String =
        (title ?: "").lowercase(Locale.ROOT)
            .replace(NON_ALNUM, "-")
            .replace(EDGE_HYPHEN, "")

    /**
     * The web's createEventSlugWithCentralTime. event_start_utc wins over date;
     * with neither, or with one that doesn't parse, the slug is the title alone.
     */
    fun create(title: String?, eventStartUtc: String?, date: String?): String {
        val titleSlug = slugify(title)
        val raw = eventStartUtc?.takeIf { it.isNotBlank() } ?: date?.takeIf { it.isNotBlank() }
            ?: return titleSlug
        val day = centralDate(raw) ?: return titleSlug
        return "$titleSlug-$day"
    }

    /** A dated slug split into its title part and its Central-Time day, or null when undated. */
    fun parse(slug: String): Parsed? {
        val match = DATE_SUFFIX.matchEntire(slug) ?: return null
        val (title, year, month, day) = match.destructured
        val date = try {
            LocalDate.of(year.toInt(), month.toInt(), day.toInt())
        } catch (_: java.time.DateTimeException) {
            return null
        }
        return Parsed(titleSlug = title, date = date)
    }

    /**
     * Which candidate a slug names. The exact slug first; otherwise the one row
     * in the window whose title matches the title part (the event moved a day
     * and the link is stale). Two such rows are ambiguous and return null, a
     * not-found, rather than a guess - the same rule useEventBySlug applies.
     * An undated slug takes the soonest row whose title slugs to exactly it.
     */
    fun pick(slug: String, candidates: List<Candidate>): Candidate? {
        candidates.firstOrNull { create(it.title, it.eventStartUtc, it.date) == slug }?.let { return it }

        val parsed = parse(slug)
        if (parsed == null) {
            return candidates
                .filter { slugify(it.title) == slug }
                .minByOrNull { startInstant(it) ?: Instant.MAX }
        }
        val sameTitle = candidates.filter { slugify(it.title) == parsed.titleSlug }
        return sameTitle.singleOrNull()
    }

    /** The Central-Time calendar day of a Postgres or ISO timestamp, or null if it doesn't parse. */
    fun centralDate(raw: String): LocalDate? {
        parseInstant(raw)?.let { return it.atZone(CENTRAL).toLocalDate() }
        // No offset: date-fns parseISO reads it as wall-clock time, and the site
        // renders in Central, so the day written is the day.
        return try {
            LocalDateTime.parse(raw.trim().replace(' ', 'T')).toLocalDate()
        } catch (_: DateTimeParseException) {
            try {
                LocalDate.parse(raw.trim())
            } catch (_: DateTimeParseException) {
                null
            }
        }
    }

    private fun startInstant(candidate: Candidate): Instant? =
        (candidate.eventStartUtc ?: candidate.date)?.let { parseInstant(it) }

    /** "2026-10-03T00:00:00+00:00", "...Z" and PostgREST's "2026-10-03 00:00:00+00". */
    private fun parseInstant(raw: String): Instant? {
        var s = raw.trim().replaceFirst(' ', 'T')
        if (SHORT_OFFSET.containsMatchIn(s) && s.contains('T')) s += ":00"
        return try {
            OffsetDateTime.parse(s).toInstant()
        } catch (_: DateTimeParseException) {
            null
        }
    }
}
