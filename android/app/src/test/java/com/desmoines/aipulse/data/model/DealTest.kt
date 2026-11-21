package com.desmoines.aipulse.data.model

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import java.time.OffsetDateTime

class DealTest {

    private fun deal(
        dealType: String = "percentage",
        discountValue: String? = "20%",
        startDate: String? = null,
        endDate: String? = null,
        days: List<String>? = null,
        startTime: String? = null,
        endTime: String? = null,
    ) = Deal(
        id = "d1", title = "Deal", dealType = dealType, discountValue = discountValue,
        startDate = startDate, endDate = endDate, daysOfWeek = days, startTime = startTime, endTime = endTime,
    )

    @Test
    fun `valueLabel formats percentage and dollar deals`() {
        assertEquals("20% Off", deal(dealType = "percentage", discountValue = "20%").valueLabel)
        assertEquals("$5 Off", deal(dealType = "dollar_off", discountValue = "$5").valueLabel)
        assertEquals("BOGO", deal(dealType = "bogo", discountValue = null).valueLabel)
    }

    @Test
    fun `dealTypeLabel maps known types`() {
        assertEquals("% Off", deal(dealType = "percentage").dealTypeLabel)
        assertEquals("Free Item", deal(dealType = "free_item").dealTypeLabel)
        assertEquals("Deal", deal(dealType = "mystery").dealTypeLabel)
    }

    @Test
    fun `isActiveNow respects the date window`() {
        assertFalse(deal(endDate = "2000-01-01T00:00:00Z").isActiveNow())
        assertFalse(deal(startDate = "2099-01-01T00:00:00Z").isActiveNow())
        assertTrue(deal(startDate = "2000-01-01T00:00:00Z", endDate = "2099-01-01T00:00:00Z").isActiveNow())
    }

    @Test
    fun `isActiveNow checks recurring day + time window`() {
        // Friday 2026-07-03, 4:00 PM Central (CDT, -05:00) - within Mon-Fri 3-6pm.
        val friday4pm = OffsetDateTime.parse("2026-07-03T16:00:00-05:00")
        val happyHour = deal(days = listOf("mon", "tue", "wed", "thu", "fri"), startTime = "15:00:00", endTime = "18:00:00")
        assertTrue(happyHour.isActiveNow(friday4pm))

        // Saturday is outside Mon-Fri.
        val saturday = OffsetDateTime.parse("2026-07-04T16:00:00-05:00")
        assertFalse(happyHour.isActiveNow(saturday))

        // Friday 8pm is past the window.
        val friday8pm = OffsetDateTime.parse("2026-07-03T20:00:00-05:00")
        assertFalse(happyHour.isActiveNow(friday8pm))
    }

    @Test
    fun `isActiveNow reads the schedule on the Des Moines clock, not the instant's offset`() {
        val happyHour = deal(days = listOf("mon", "tue", "wed", "thu", "fri"), startTime = "15:00:00", endTime = "18:00:00")

        // Saturday 2026-07-04 00:30 UTC is Friday 7:30pm Central: Friday, but past 6pm.
        assertFalse(happyHour.isActiveNow(OffsetDateTime.parse("2026-07-04T00:30:00Z")))

        // Friday 2026-07-03 21:00 UTC is Friday 4pm Central, inside the window,
        // though the UTC wall clock reads 9pm.
        assertTrue(happyHour.isActiveNow(OffsetDateTime.parse("2026-07-03T21:00:00Z")))

        // Saturday 2026-07-04 01:00 UTC is Friday 8pm Central. A Friday-only 7-9pm
        // deal is live; the UTC weekday (Saturday) would have said no.
        val fridayNight = deal(days = listOf("fri"), startTime = "19:00:00", endTime = "21:00:00")
        assertTrue(fridayNight.isActiveNow(OffsetDateTime.parse("2026-07-04T01:00:00Z")))

        // The same instant seen from a Tokyo phone (+09:00, Saturday 10am) is still Friday 8pm here.
        assertTrue(fridayNight.isActiveNow(OffsetDateTime.parse("2026-07-04T10:00:00+09:00")))

        // Winter: Central is -06:00. Monday 2026-01-05 21:30 UTC is 3:30pm Central.
        assertTrue(happyHour.isActiveNow(OffsetDateTime.parse("2026-01-05T21:30:00Z")))
        assertFalse(happyHour.isActiveNow(OffsetDateTime.parse("2026-01-06T00:30:00Z"))) // 6:30pm Central
    }

    @Test
    fun `isActiveNow treats an end time before the start time as running past midnight`() {
        // Mirrors iOS testActiveNowHandlesOvernightWindow. 2026-06-05 is a Friday.
        val lateNight = deal(days = listOf("fri"), startTime = "21:00:00", endTime = "02:00:00")
        assertTrue(lateNight.isActiveNow(OffsetDateTime.parse("2026-06-05T22:00:00-05:00"))) // Fri 10pm
        assertTrue(lateNight.isActiveNow(OffsetDateTime.parse("2026-06-06T01:00:00-05:00"))) // Sat 1am, Friday's deal
        assertFalse(lateNight.isActiveNow(OffsetDateTime.parse("2026-06-06T03:00:00-05:00"))) // Sat 3am, closed
        assertFalse(lateNight.isActiveNow(OffsetDateTime.parse("2026-06-05T20:00:00-05:00"))) // Fri 8pm, not yet
        assertFalse(lateNight.isActiveNow(OffsetDateTime.parse("2026-06-07T01:00:00-05:00"))) // Sun 1am, Sat not scheduled
    }

    @Test
    fun `scheduleText renders a consecutive day range with times`() {
        val schedule = deal(days = listOf("mon", "tue", "wed", "thu", "fri"), startTime = "15:00:00", endTime = "18:00:00").scheduleText
        assertEquals("Mon–Fri · 3:00 PM–6:00 PM", schedule)
        assertNull(deal(days = null).scheduleText)
    }
}
