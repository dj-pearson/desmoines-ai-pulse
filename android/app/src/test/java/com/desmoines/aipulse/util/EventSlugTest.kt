package com.desmoines.aipulse.util

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Test
import java.time.LocalDate

/**
 * AND-OVH-022. Every expected value below came from running the web's own
 * createSlug (src/lib/slug.ts) and createEventSlugWithCentralTime
 * (src/lib/timezone.ts) under tsx; the createSlug table is copied from
 * src/lib/__tests__/slug.test.ts, and the first event rows from
 * src/lib/__tests__/eventTime.test.ts and weekendArticle.test.ts. If one of
 * these fails, an event link shared from the site no longer opens in the app.
 */
class EventSlugTest {

    @Test
    fun `slugify matches the web createSlug table`() {
        val cases = listOf(
            "Gray's Lake Park" to "gray-s-lake-park",
            "Raccoon River Park" to "raccoon-river-park",
            "  Leading and trailing  " to "leading-and-trailing",
            "Multiple   spaces" to "multiple-spaces",
            "Punctuation!!! Everywhere???" to "punctuation-everywhere",
            "MiXeD CaSe" to "mixed-case",
            "Numbers 515 and 2026" to "numbers-515-and-2026",
            "---already-hyphenated---" to "already-hyphenated",
            "Café Diem" to "caf-diem",
            "!!!" to "",
        )
        for ((name, expected) in cases) {
            assertEquals(expected, EventSlug.slugify(name), "slugify(\"$name\")")
            assertEquals(expected, EventSlug.slugify(expected), "idempotent on \"$expected\"")
        }
        assertEquals("", EventSlug.slugify(null))
    }

    @Test
    fun `create matches the web createEventSlugWithCentralTime`() {
        // title, event_start_utc, date, expected
        val cases = listOf(
            arrayOf("The Slaughterhouse Haunted House", "2026-10-03T00:00:00+00:00", null, "the-slaughterhouse-haunted-house-2026-10-02"),
            arrayOf("Ringling Bros.", "2026-10-02T00:00:00+00:00", null, "ringling-bros-2026-10-01"),
            // CST after the November change: 00:00 UTC is 6 pm the day before.
            arrayOf("Holiday Lights", "2026-11-07T00:00:00+00:00", null, "holiday-lights-2026-11-06"),
            arrayOf("Trivia", "2026-10-03T00:00:00+00:00", "2026-10-03T00:00:00+00:00", "trivia-2026-10-02"),
            arrayOf("Clint Black: Back On The Blacktop Tour", "2026-10-03T00:30:00+00:00", null, "clint-black-back-on-the-blacktop-tour-2026-10-02"),
            arrayOf("Come From Away", "2026-10-04T00:00:00+00:00", null, "come-from-away-2026-10-03"),
            arrayOf("UIC Flames at Drake", "2026-10-04T18:00:00+00:00", null, "uic-flames-at-drake-2026-10-04"),
            // date is the fallback when event_start_utc is absent.
            arrayOf("Farmers' Market", null, "2026-10-03T17:00:00Z", "farmers-market-2026-10-03"),
            arrayOf("Café Diem & Friends!!", "2026-12-31T23:30:00Z", "2026-12-31T23:30:00Z", "caf-diem-friends-2026-12-31"),
            // Across the year: 05:30 UTC on Jan 1 is still Dec 31 in Central.
            arrayOf("New Year's Eve Bash", "2027-01-01T05:30:00Z", null, "new-year-s-eve-bash-2026-12-31"),
            // A null title keeps the date half, which is what makes it resolvable.
            arrayOf(null, "2026-10-03T17:00:00Z", null, "-2026-10-03"),
            arrayOf("No Date Event", null, null, "no-date-event"),
            // PostgREST's timestamptz text form.
            arrayOf("Postgres Format", null, "2026-10-03 00:00:00+00", "postgres-format-2026-10-02"),
        )
        for ((title, startUtc, date, expected) in cases) {
            assertEquals(expected, EventSlug.create(title, startUtc, date), "create(\"$title\", $startUtc, $date)")
        }
    }

    @Test
    fun `parse splits the title part from the Central day`() {
        assertEquals(
            EventSlug.Parsed("come-from-away", LocalDate.of(2026, 10, 3)),
            EventSlug.parse("come-from-away-2026-10-03"),
        )
        assertEquals(
            EventSlug.Parsed("numbers-515-and-2026", LocalDate.of(2026, 1, 9)),
            EventSlug.parse("numbers-515-and-2026-2026-01-09"),
        )
        assertEquals(EventSlug.Parsed("", LocalDate.of(2026, 10, 3)), EventSlug.parse("-2026-10-03"))
    }

    @Test
    fun `parse refuses undated and impossible dates`() {
        assertNull(EventSlug.parse("no-date-event"))
        assertNull(EventSlug.parse("bad-day-2026-02-30"))
        assertNull(EventSlug.parse("bad-month-2026-13-01"))
    }

    @Test
    fun `parse round-trips create`() {
        val slug = EventSlug.create("Come From Away", "2026-10-04T00:00:00+00:00", null)
        val parsed = EventSlug.parse(slug)!!
        assertEquals(EventSlug.slugify("Come From Away"), parsed.titleSlug)
        assertEquals(LocalDate.of(2026, 10, 3), parsed.date)
    }

    private fun candidate(id: String, title: String?, startUtc: String?) =
        EventSlug.Candidate(id = id, title = title, date = startUtc, eventStartUtc = startUtc)

    @Test
    fun `pick takes the row whose slug matches exactly`() {
        val candidates = listOf(
            candidate("a", "Come From Away", "2026-10-03T00:00:00+00:00"), // Oct 2 Central
            candidate("b", "Come From Away", "2026-10-04T00:00:00+00:00"), // Oct 3 Central
            candidate("c", "Trivia", "2026-10-04T00:00:00+00:00"),
        )
        assertEquals("b", EventSlug.pick("come-from-away-2026-10-03", candidates)?.id)
    }

    @Test
    fun `pick follows a stale slug to the one same-title row and refuses two`() {
        val moved = listOf(
            candidate("a", "Come From Away", "2026-10-05T00:00:00+00:00"),
            candidate("c", "Trivia", "2026-10-04T00:00:00+00:00"),
        )
        assertEquals("a", EventSlug.pick("come-from-away-2026-10-03", moved)?.id)

        val ambiguous = listOf(
            candidate("a", "Come From Away", "2026-10-02T00:00:00+00:00"),
            candidate("b", "Come From Away", "2026-10-05T00:00:00+00:00"),
        )
        assertNull(EventSlug.pick("come-from-away-2026-10-03", ambiguous))
    }

    @Test
    fun `pick returns null when no title matches`() {
        val candidates = listOf(candidate("c", "Trivia", "2026-10-04T00:00:00+00:00"))
        assertNull(EventSlug.pick("come-from-away-2026-10-03", candidates))
        assertNull(EventSlug.pick("come-from-away-2026-10-03", emptyList()))
    }

    @Test
    fun `pick resolves an undated slug to the soonest same-title row`() {
        val candidates = listOf(
            candidate("later", "Jazz in July", "2026-07-20T00:00:00+00:00"),
            candidate("sooner", "Jazz in July", "2026-07-13T00:00:00+00:00"),
            candidate("other", "Jazz in July: Night 2", "2026-07-06T00:00:00+00:00"),
        )
        assertEquals("sooner", EventSlug.pick("jazz-in-july", candidates)?.id)
    }
}
