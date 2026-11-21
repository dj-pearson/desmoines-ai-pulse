package com.desmoines.aipulse.util

import com.desmoines.aipulse.data.model.DateFilterPreset
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test
import java.time.LocalDate
import java.time.ZoneId
import java.time.ZonedDateTime

/**
 * AND-AUDIT-031. The Events tab and Discover sent preset bounds as bare local
 * timestamps ("2026-07-04T00:00:00"), which PostgREST reads as UTC, so Today
 * ran from 7pm yesterday to 7pm today Central. Every bound here must be a
 * Central midnight carrying its offset.
 */
class DatePresetBoundsTest {

    /** Saturday July 4, 2026: Central Daylight Time, -05:00. */
    private val cdtSaturday = LocalDate.of(2026, 7, 4)

    /** Wednesday January 14, 2026: Central Standard Time, -06:00. */
    private val cstWednesday = LocalDate.of(2026, 1, 14)

    @Test
    fun `Today on a CDT date is bounded at Central midnights with -05 00`() {
        assertEquals(
            "2026-07-04T00:00:00-05:00" to "2026-07-05T00:00:00-05:00",
            EventTimeText.presetBounds(DateFilterPreset.TODAY, cdtSaturday),
        )
    }

    @Test
    fun `Today on a CST date is bounded at Central midnights with -06 00`() {
        assertEquals(
            "2026-01-14T00:00:00-06:00" to "2026-01-15T00:00:00-06:00",
            EventTimeText.presetBounds(DateFilterPreset.TODAY, cstWednesday),
        )
    }

    @Test
    fun `a range across the November fall-back carries each midnight's own offset`() {
        // Sunday November 1, 2026 is the DST end; Monday the 2nd is CST.
        assertEquals(
            "2026-10-31T00:00:00-05:00" to "2026-11-02T00:00:00-06:00",
            EventTimeText.presetBounds(DateFilterPreset.THIS_WEEKEND, LocalDate.of(2026, 10, 31)),
        )
    }

    @Test
    fun `presets cover the same days iOS does`() {
        val wednesday = cstWednesday
        assertEquals(wednesday.plusDays(1) to wednesday.plusDays(2), DateFilterPreset.TOMORROW.dayRange(wednesday))
        assertEquals(LocalDate.of(2026, 1, 17) to LocalDate.of(2026, 1, 19), DateFilterPreset.THIS_WEEKEND.dayRange(wednesday))
        assertEquals(wednesday to wednesday.plusDays(7), DateFilterPreset.THIS_WEEK.dayRange(wednesday))
        assertEquals(wednesday.plusDays(7) to wednesday.plusDays(14), DateFilterPreset.NEXT_WEEK.dayRange(wednesday))
        assertEquals(wednesday to LocalDate.of(2026, 2, 14), DateFilterPreset.THIS_MONTH.dayRange(wednesday))
    }

    @Test
    fun `on Saturday and Sunday this weekend is the current Saturday to Monday`() {
        val weekend = cdtSaturday to LocalDate.of(2026, 7, 6)
        assertEquals(weekend, DateFilterPreset.THIS_WEEKEND.dayRange(cdtSaturday))
        assertEquals(weekend, DateFilterPreset.THIS_WEEKEND.dayRange(LocalDate.of(2026, 7, 5)))
    }

    @Test
    fun `today is the Des Moines day, not the UTC or device day`() {
        // 8:30pm CDT Saturday is 01:30Z Sunday and 10:30am Sunday in Tokyo.
        val utc = ZonedDateTime.of(2026, 7, 5, 1, 30, 0, 0, ZoneId.of("UTC"))
        assertEquals(cdtSaturday, EventTimeText.desMoinesToday(utc))
        assertEquals(cdtSaturday, EventTimeText.desMoinesToday(utc.withZoneSameInstant(ZoneId.of("Asia/Tokyo"))))
    }
}
