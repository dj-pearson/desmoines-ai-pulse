package com.desmoines.aipulse.util

import com.desmoines.aipulse.data.model.Event
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import java.time.Instant
import java.time.LocalDate

/**
 * AND-AUDIT-042, slice 2: the web's series selection rules
 * (src/lib/eventSeriesView.ts) ported to [EventSeriesSchedule]. Each case is a
 * case from src/lib/__tests__/eventSeriesView.test.ts, by way of iOS
 * EventSeriesScheduleTests.swift, with the same rows, the same clock and the
 * web's expected answer, so a divergence here is a divergence from the web.
 */
class EventSeriesScheduleTest {

    /** 15:00 UTC on 2026-10-01, the web test's NOW. */
    private val now: Instant = Instant.parse("2026-10-01T15:00:00Z")

    private var nextId = 0

    /** 23:00 UTC is 6 pm Central the same day, as in the web test's row(). */
    private fun row(
        title: String,
        day: String,
        venue: String? = "Venue",
        isHidden: Boolean = false,
        hiddenAt: String? = null,
        archivedAt: String? = null,
        endDate: String? = null,
        timeTbd: Boolean? = null,
    ): SeriesEventRow {
        nextId += 1
        val event = Event(
            id = "id-$nextId",
            title = title,
            date = "${day}T23:00:00+00:00",
            eventStartUtc = "${day}T23:00:00+00:00",
            venue = venue,
            city = "Des Moines",
            endDate = endDate,
            timeTbd = timeTbd,
        )
        return SeriesEventRow(event, isHidden, hiddenAt, archivedAt)
    }

    private fun series(slug: String): EventSeriesDef = requireNotNull(EventSeries.forSlug(slug)) { slug }

    private fun d(s: String): LocalDate = LocalDate.parse(s)

    @Test
    fun `picks the edition still to come and lists earlier years newest first`() {
        val schedule = EventSeriesSchedule.build(series("cloris-awards"), listOf(
            row("10th Annual Cloris Awards", "2025-08-31", isHidden = true, hiddenAt = "2025-09-10T00:00:00Z"),
            row("11th Annual Cloris Awards", "2026-08-30", isHidden = true, hiddenAt = "2026-09-10T00:00:00Z"),
            row("12th Annual Cloris Awards", "2027-08-29"),
        ), now)
        assertEquals(2027, schedule.current?.year)
        assertEquals(listOf(2026, 2025), schedule.past.map { it.year })
        assertNull(schedule.unannouncedYear)
        assertEquals(3, schedule.total)
    }

    @Test
    fun `next year is unannounced when every edition is over`() {
        val rows = listOf("07", "14", "21", "28").map { n ->
            row("Jazz in July 2026: Night $n", "2026-07-$n", venue = "Hoyt Sherman Place",
                isHidden = true, hiddenAt = "2026-08-05T00:00:00Z")
        }
        val schedule = EventSeriesSchedule.build(series("jazz-in-july"), rows, now)
        assertNull(schedule.current)
        assertEquals(2027, schedule.unannouncedYear)
        assertEquals(4, schedule.past.first().instances.size)
        assertEquals(d("2026-07-07"), schedule.past.first().firstDay)
        assertEquals(d("2026-07-28"), schedule.past.first().lastDay)
        assertEquals("Hoyt Sherman Place", schedule.venue)
    }

    @Test
    fun `never names a past year as unannounced`() {
        val schedule = EventSeriesSchedule.build(series("cloris-awards"), listOf(
            row("Cloris Awards", "2024-08-30", isHidden = true, hiddenAt = "2024-09-10T00:00:00Z"),
        ), now)
        assertEquals(2026, schedule.unannouncedYear)
    }

    @Test
    fun `links live, lists swept and drops moderator hidden`() {
        val swept = row("Panda Fest 2025", "2025-10-03", isHidden = true, hiddenAt = "2025-10-12T08:00:00Z")
        val takenDown = row("Panda Fest 2025", "2025-10-04", isHidden = true, hiddenAt = "2025-09-01T08:00:00Z")
        val live = row("Panda Fest 2026", "2026-10-02")
        val schedule = EventSeriesSchedule.build(series("panda-fest"), listOf(swept, takenDown, live), now)

        assertTrue(EventSeriesSchedule.isModeratorHidden(takenDown))
        assertFalse(EventSeriesSchedule.isModeratorHidden(swept))
        assertEquals(live.event.id, schedule.current?.instances?.first()?.linkId)
        assertEquals(listOf(d("2025-10-03")), schedule.past.first().instances.map { it.day })
        assertEquals(listOf<String?>(null), schedule.past.first().instances.map { it.linkId })
    }

    @Test
    fun `hidden without a hidden_at counts as a moderator`() {
        assertTrue(EventSeriesSchedule.isModeratorHidden(row("Panda Fest 2025", "2025-10-03", isHidden = true)))
        assertFalse(EventSeriesSchedule.isModeratorHidden(row("Panda Fest 2026", "2026-10-02")))
    }

    @Test
    fun `archived is listed and linked but never current`() {
        val archived = row("Panda Fest 2026", "2026-10-02", archivedAt = "2026-09-30T00:00:00Z")
        val schedule = EventSeriesSchedule.build(series("panda-fest"), listOf(archived), now)
        assertNull(schedule.current)
        assertEquals(archived.event.id, schedule.past.first().instances.first().linkId)
    }

    @Test
    fun `one row per day preferring live then the shorter title`() {
        val schedule = EventSeriesSchedule.build(series("hinterland-music-festival"), listOf(
            row("Hinterland Music Festival (4 Day Pass) with KATSEYE, Lorde", "2027-07-29"),
            row("Hinterland 2027 Music Festival", "2027-07-29"),
            row("Hinterland Music Festival (Friday Pass) with Lorde", "2027-07-30"),
        ), now)
        assertEquals(
            listOf("Hinterland 2027 Music Festival", "Hinterland Music Festival (Friday Pass) with Lorde"),
            schedule.current?.instances?.map { it.row.event.title },
        )
        assertEquals(2, schedule.total)
    }

    @Test
    fun `a live row beats a swept row on the same day`() {
        val swept = row("Panda Fest", "2026-10-02", isHidden = true, hiddenAt = "2026-10-12T00:00:00Z")
        val live = row("Panda Fest 2026 with a much longer title", "2026-10-02")
        val schedule = EventSeriesSchedule.build(series("panda-fest"), listOf(swept, live), now)
        assertEquals(listOf(live.event.id), schedule.current?.instances?.map { it.id })
    }

    @Test
    fun `ignores rows the loose database filter let through`() {
        val schedule = EventSeriesSchedule.build(series("beaverdale-fall-festival"), listOf(
            row("Beaverdale Fall Festival", "2026-09-18"),
            row("Backyard BBQ Contest at Beaverdale Fall Festival", "2026-09-19"),
        ), now)
        assertEquals(1, schedule.total)
    }

    @Test
    fun `runs an edition to its end date`() {
        val schedule = EventSeriesSchedule.build(series("center-grove-orchard-pumpkin-fest"), listOf(
            row("Pumpkin Fest", "2026-10-01", venue = "Center Grove Orchard",
                endDate = "2026-11-07T05:59:00+00:00", timeTbd = true),
        ), now)
        assertEquals(d("2026-10-01"), schedule.current?.firstDay)
        assertEquals(d("2026-11-06"), schedule.current?.lastDay)
    }

    @Test
    fun `a timed row is over three hours after its start, an untimed one at the end of its Central day`() {
        val timed = row("Panda Fest 2026", "2026-10-01").event
        assertFalse(EventSeriesSchedule.isOver(timed, Instant.parse("2026-10-02T01:59:00Z")))
        assertTrue(EventSeriesSchedule.isOver(timed, Instant.parse("2026-10-02T02:01:00Z")))
        val tba = row("Panda Fest 2026", "2026-10-01", timeTbd = true).event
        assertFalse(EventSeriesSchedule.isOver(tba, Instant.parse("2026-10-02T04:59:00Z")))
        assertTrue(EventSeriesSchedule.isOver(tba, Instant.parse("2026-10-02T05:00:00Z")))
        // An untimed run's end_date counts to the end of that Central day, not its stored hour.
        val run = row("Pumpkin Fest", "2026-10-01", timeTbd = true, endDate = "2026-10-03T17:00:00+00:00").event
        assertFalse(EventSeriesSchedule.isOver(run, Instant.parse("2026-10-03T20:00:00Z")))
        assertTrue(EventSeriesSchedule.isOver(run, Instant.parse("2026-10-04T05:00:00Z")))
    }

    @Test
    fun `edition date label matches the web`() {
        val rows = listOf("07", "14", "21", "28").map { n ->
            row("Jazz in July 2026: Night $n", "2026-07-$n", venue = "Hoyt Sherman Place",
                isHidden = true, hiddenAt = "2026-08-05T00:00:00Z")
        }
        val schedule = EventSeriesSchedule.build(series("jazz-in-july"), rows, now)
        assertEquals("Tuesday, July 7 to Tuesday, July 28, 2026", EventSeriesSchedule.editionDateLabel(schedule.past.first()))
        assertEquals("2027 date not announced yet", EventSeriesSchedule.unannouncedLabel(schedule.unannouncedYear!!))
    }

    @Test
    fun `edition date label for one day and across a year`() {
        val one = SeriesEdition(2026, emptyList(), emptyList(), d("2026-10-02"), d("2026-10-02"))
        assertEquals("Friday, October 2, 2026", EventSeriesSchedule.editionDateLabel(one))
        val span = SeriesEdition(2026, emptyList(), emptyList(), d("2026-12-31"), d("2027-01-01"))
        assertEquals("Thursday, December 31, 2026 to Friday, January 1, 2027", EventSeriesSchedule.editionDateLabel(span))
        assertEquals("Fri, Oct 2", EventSeriesSchedule.dayWords(d("2026-10-02"), "EEE, MMM d"))
    }

    @Test
    fun `no rows is an unannounced this year`() {
        val schedule = EventSeriesSchedule.build(series("eerie-evenings"), emptyList(), now)
        assertNull(schedule.current)
        assertEquals(emptyList<SeriesEdition>(), schedule.past)
        assertEquals(2026, schedule.unannouncedYear)
        assertNull(schedule.venue)
        assertEquals(0, schedule.total)
    }
    // Slice 3b: the lines the screen prints (src/pages/EventSeriesPage.tsx).

    @Test
    fun `current heading names the current year, else the unannounced one`() {
        val withCurrent = EventSeriesSchedule.build(series("cloris-awards"), listOf(
            row("12th Annual Cloris Awards", "2027-08-29"),
        ), now)
        assertEquals("2027 dates", EventSeriesSchedule.currentHeading(withCurrent))
        val none = EventSeriesSchedule.build(series("eerie-evenings"), emptyList(), now)
        assertEquals("2026 dates", EventSeriesSchedule.currentHeading(none))
    }

    @Test
    fun `a past year's summary joins its venues with and`() {
        val two = SeriesEdition(2025, emptyList(), listOf("Water Works Park", "Cowles Commons"), d("2025-10-02"), d("2025-10-02"))
        assertEquals("Thursday, October 2, 2025, Water Works Park and Cowles Commons", EventSeriesSchedule.editionSummary(two))
        val bare = two.copy(venues = emptyList())
        assertEquals("Thursday, October 2, 2025", EventSeriesSchedule.editionSummary(bare))
    }

    @Test
    fun `an instance reads day and title, then Central time and place`() {
        val schedule = EventSeriesSchedule.build(series("cloris-awards"), listOf(
            row("11th Annual Cloris Awards", "2026-08-30", venue = "Drake University"),
        ), now)
        val instance = schedule.past.single().instances.single()
        assertEquals("Sun, Aug 30: 11th Annual Cloris Awards", EventSeriesSchedule.instanceTitle(instance))
        // 23:00 UTC is 6 pm Central; the +00:00 hour must not leak through.
        assertEquals("6:00 PM - Drake University", EventSeriesSchedule.instanceDetail(instance))
    }

    @Test
    fun `an untimed instance shows only its place, and nothing without one`() {
        val tba = EventSeriesSchedule.build(series("panda-fest"), listOf(
            row("Panda Fest 2026", "2026-10-03", venue = "  ", timeTbd = true),
        ), now).current!!.instances.single()
        assertNull(EventSeriesSchedule.instanceDetail(tba))
        val placed = SeriesInstance(
            row = tba.row.copy(event = tba.row.event.copy(location = "Water Works Park")),
            day = tba.day, linkId = tba.linkId, isOver = tba.isOver,
        )
        assertEquals("Water Works Park", EventSeriesSchedule.instanceDetail(placed))
    }
}
