package com.desmoines.aipulse.data.model

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import java.time.DayOfWeek
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.temporal.TemporalAdjusters

/**
 * Tests for DateFilterPreset.dateRange computation.
 * Verifies all 6 presets produce correct date ranges.
 */
class DateFilterPresetTest {

    @Test
    fun `TODAY range is start of today to start of tomorrow`() {
        val (start, end) = DateFilterPreset.TODAY.dateRange
        val now = LocalDate.now()

        assertEquals(now.atStartOfDay(), start)
        assertEquals(now.plusDays(1).atStartOfDay(), end)
    }

    @Test
    fun `TOMORROW range is start of tomorrow to start of day after`() {
        val (start, end) = DateFilterPreset.TOMORROW.dateRange
        val now = LocalDate.now()

        assertEquals(now.plusDays(1).atStartOfDay(), start)
        assertEquals(now.plusDays(2).atStartOfDay(), end)
    }

    @Test
    fun `THIS_WEEKEND range covers Saturday and Sunday`() {
        val (start, end) = DateFilterPreset.THIS_WEEKEND.dateRange
        val now = LocalDate.now()

        // Start should be a Saturday
        assertEquals(DayOfWeek.SATURDAY, start.toLocalDate().dayOfWeek)
        // End should be a Monday (day after Sunday)
        assertEquals(DayOfWeek.MONDAY, end.toLocalDate().dayOfWeek)
        // Range should be exactly 2 days
        assertEquals(start.plusDays(2), end)
    }

    @Test
    fun `THIS_WEEKEND on Saturday starts today`() {
        // We can only verify the general contract since we can't control LocalDate.now()
        val (start, end) = DateFilterPreset.THIS_WEEKEND.dateRange
        val now = LocalDate.now()

        if (now.dayOfWeek == DayOfWeek.SATURDAY) {
            assertEquals(now.atStartOfDay(), start)
        }
    }

    @Test
    fun `THIS_WEEKEND on Sunday starts yesterday`() {
        val (start, end) = DateFilterPreset.THIS_WEEKEND.dateRange
        val now = LocalDate.now()

        if (now.dayOfWeek == DayOfWeek.SUNDAY) {
            assertEquals(now.minusDays(1).atStartOfDay(), start)
        }
    }

    @Test
    fun `THIS_WEEK range is 7 days from today`() {
        val (start, end) = DateFilterPreset.THIS_WEEK.dateRange
        val now = LocalDate.now()

        assertEquals(now.atStartOfDay(), start)
        assertEquals(now.plusDays(7).atStartOfDay(), end)
    }

    @Test
    fun `NEXT_WEEK range is day 7 through day 14`() {
        val (start, end) = DateFilterPreset.NEXT_WEEK.dateRange
        val now = LocalDate.now()

        assertEquals(now.plusDays(7).atStartOfDay(), start)
        assertEquals(now.plusDays(14).atStartOfDay(), end)
    }

    @Test
    fun `THIS_MONTH range is today to 1 month from today`() {
        val (start, end) = DateFilterPreset.THIS_MONTH.dateRange
        val now = LocalDate.now()

        assertEquals(now.atStartOfDay(), start)
        assertEquals(now.plusMonths(1).atStartOfDay(), end)
    }

    @Test
    fun `all presets have start before end`() {
        for (preset in DateFilterPreset.entries) {
            val (start, end) = preset.dateRange
            assertTrue(start.isBefore(end), "${preset.name}: start ($start) should be before end ($end)")
        }
    }

    @Test
    fun `all presets have start at midnight`() {
        for (preset in DateFilterPreset.entries) {
            val (start, end) = preset.dateRange
            assertEquals(0, start.hour, "${preset.name}: start hour should be 0")
            assertEquals(0, start.minute, "${preset.name}: start minute should be 0")
            assertEquals(0, end.hour, "${preset.name}: end hour should be 0")
            assertEquals(0, end.minute, "${preset.name}: end minute should be 0")
        }
    }

    @Test
    fun `THIS_WEEKEND is always in the future or today`() {
        val (start, _) = DateFilterPreset.THIS_WEEKEND.dateRange
        val now = LocalDate.now()
        assertTrue(
            !start.toLocalDate().isBefore(now.minusDays(1)),
            "THIS_WEEKEND start should not be more than 1 day in the past"
        )
    }
}
