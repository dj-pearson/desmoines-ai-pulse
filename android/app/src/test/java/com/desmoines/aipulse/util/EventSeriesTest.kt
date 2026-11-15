package com.desmoines.aipulse.util

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

/**
 * AND-AUDIT-042, slice 1. src/lib/__tests__/androidEventSeriesParity.test.ts
 * runs every pair in [NORMALISE_CASES] through the web's normaliseEventTitle,
 * so the expectations below are the web's answers, not this port's.
 */
class EventSeriesTest {

    companion object {
        /** (title, normalised). Parsed by the parity test: one pair per line, plain literals only. */
        val NORMALISE_CASES: List<Pair<String, String>> = listOf(
            "11th Annual Cloris Awards" to "cloris awards",
            "Hinterland 2026 Music Festival" to "hinterland music festival",
            "Jazz in July 2026: Night 3" to "jazz in july night 3",
            "22nd Annual Des Moines' Original Oktoberfest" to "des moines original oktoberfest",
            "Des Moines’ Original Oktoberfest" to "des moines original oktoberfest",
            "2026 Taylor Fest - (6/19)" to "taylor fest",
            "Forever in Love: Bridal Show, Sept 13" to "forever in love bridal show",
            "Beaverdale Fall Festival 2025-26" to "beaverdale fall festival",
            "Panda Fest 3rd Edition" to "panda fest",
            "Jazz in July" to "jazz in july",
            "25th Anniversary Tour" to "anniversary tour",
            "Band 25th Anniversary Tour" to "band 25th anniversary tour",
            "Rock &amp; Roll Revue" to "rock roll revue",
            "Children's Day 2026" to "childrens day",
            "Eerie Evenings Oct. 24th &#8211; Halloween" to "eerie evenings halloween",
            "" to "",
        )
    }

    @Test
    fun `normaliseTitle gives the web's answer for every case`() {
        NORMALISE_CASES.forEach { (title, expected) ->
            assertEquals(expected, EventSeries.normaliseTitle(title), title)
        }
        assertEquals("", EventSeries.normaliseTitle(null))
    }

    @Test
    fun `lookup by slug`() {
        assertEquals("Panda Fest", EventSeries.forSlug("panda-fest")?.name)
        assertNull(EventSeries.forSlug("not-a-series"))
        assertNull(EventSeries.forSlug(""))
        assertNull(EventSeries.forSlug(null))
    }

    @Test
    fun `path is the web URL`() {
        val def = EventSeries.forSlug("cloris-awards")!!
        assertEquals("/events/series/cloris-awards", EventSeries.path(def))
    }

    @Test
    fun `editions join their series by title`() {
        assertEquals("cloris-awards", EventSeries.forEvent("11th Annual Cloris Awards")?.slug)
        assertEquals("panda-fest", EventSeries.forEvent("PandaFest 2026")?.slug)
        // Alias plus a word: a night of a multi-night run still belongs.
        assertEquals(
            "jazz-in-july",
            EventSeries.forEvent("Jazz in July 2026: Night 3", venue = "Hoyt Sherman Place")?.slug,
        )
        // A longer word that merely starts with the alias does not.
        assertNull(EventSeries.forEvent("Farmstasiana"))
        assertNull(EventSeries.forEvent("Some Other Concert"))
        assertNull(EventSeries.forEvent(null))
    }

    @Test
    fun `venue-qualified series need the venue`() {
        assertNull(EventSeries.forEvent("Pumpkin Fest 2026"))
        assertNull(EventSeries.forEvent("Pumpkin Fest 2026", venue = "Some Other Farm"))
        assertEquals(
            "center-grove-orchard-pumpkin-fest",
            EventSeries.forEvent("Pumpkin Fest 2026", venue = "Center Grove Orchard")?.slug,
        )
        // The location counts as well as the venue.
        assertEquals(
            "living-history-farms-family-halloween",
            EventSeries.forEvent("Family Halloween", location = "Living History Farms, Urbandale")?.slug,
        )
    }

    @Test
    fun `title patterns join alias words with wildcards`() {
        val def = EventSeries.forSlug("panda-fest")!!
        assertEquals(listOf("title.ilike.*panda*fest*", "title.ilike.*pandafest*"), EventSeries.titlePatterns(def))
    }

    @Test
    fun `like patterns are the title patterns in supabase-kt form`() {
        val def = EventSeries.forSlug("panda-fest")!!
        assertEquals(listOf("%panda%fest%", "%pandafest%"), EventSeries.titleLikePatterns(def))
        EventSeries.ALL.forEach { d ->
            val fromFilter = EventSeries.titlePatterns(d).map { it.removePrefix("title.ilike.").replace('*', '%') }
            assertEquals(fromFilter, EventSeries.titleLikePatterns(d), d.slug)
        }
    }

    @Test
    fun `the list is safe to put in a filter and in a URL`() {
        assertEquals(EventSeries.ALL.size, EventSeries.ALL.map { it.slug }.toSet().size, "duplicate slug")
        val slugShape = Regex("^[a-z0-9]+(-[a-z0-9]+)*$")
        val aliasShape = Regex("^[a-z0-9 ]+$")
        EventSeries.ALL.forEach { def ->
            assertTrue(slugShape.matches(def.slug), def.slug)
            def.aliases.forEach { alias ->
                // Aliases go into a PostgREST or() filter unescaped.
                assertTrue(aliasShape.matches(alias), alias)
                assertEquals(alias, EventSeries.normaliseTitle(alias), "alias is not normalised: $alias")
            }
        }
    }
}
