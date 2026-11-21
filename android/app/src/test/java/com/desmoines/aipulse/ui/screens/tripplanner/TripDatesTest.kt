package com.desmoines.aipulse.ui.screens.tripplanner

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test
import java.time.LocalDate
import java.time.ZoneId
import java.time.ZoneOffset
import java.time.ZonedDateTime

/**
 * AND-AUDIT-032. The trip start was LocalDate.now().plusDays(offset), the
 * phone's day. After 7pm Central the UTC day has already rolled over, so a
 * phone on UTC planned "today" as tomorrow.
 */
class TripDatesTest {

    /** 01:30 UTC on Saturday July 4, 2026 is 8:30pm CDT on Friday July 3. */
    private val utcAfterSevenCentral = ZonedDateTime.of(2026, 7, 4, 1, 30, 0, 0, ZoneOffset.UTC)

    @Test
    fun `a UTC clock after 7pm Central starts the trip on the Des Moines day`() {
        assertEquals(
            LocalDate.of(2026, 7, 3) to LocalDate.of(2026, 7, 4),
            TripDates.range(startOffsetDays = 0, lengthDays = 2, now = utcAfterSevenCentral),
        )
    }

    @Test
    fun `a phone on Tokyo time just after midnight still plans from the Des Moines day`() {
        // 00:10 JST Monday January 15 is 9:10am CST Sunday January 14.
        val tokyo = ZonedDateTime.of(2026, 1, 15, 0, 10, 0, 0, ZoneId.of("Asia/Tokyo"))
        assertEquals(LocalDate.of(2026, 1, 14), TripDates.range(0, 1, tokyo).first)
    }

    @Test
    fun `a phone on Central time gets its own day`() {
        val central = ZonedDateTime.of(2026, 7, 3, 20, 30, 0, 0, ZoneId.of("America/Chicago"))
        assertEquals(LocalDate.of(2026, 7, 3), TripDates.range(0, 1, central).first)
    }

    @Test
    fun `offset and length count whole days across the November fall-back`() {
        // Noon Central on Saturday October 31, 2026; DST ends Sunday November 1.
        val saturday = ZonedDateTime.of(2026, 10, 31, 12, 0, 0, 0, ZoneId.of("America/Chicago"))
        assertEquals(
            LocalDate.of(2026, 11, 1) to LocalDate.of(2026, 11, 3),
            TripDates.range(startOffsetDays = 1, lengthDays = 3, now = saturday),
        )
    }
}
