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
        // Friday 2026-07-03, 4:00 PM — within Mon-Fri 3-6pm.
        val friday4pm = OffsetDateTime.parse("2026-07-03T16:00:00Z")
        val happyHour = deal(days = listOf("mon", "tue", "wed", "thu", "fri"), startTime = "15:00:00", endTime = "18:00:00")
        assertTrue(happyHour.isActiveNow(friday4pm))

        // Saturday is outside Mon-Fri.
        val saturday = OffsetDateTime.parse("2026-07-04T16:00:00Z")
        assertFalse(happyHour.isActiveNow(saturday))

        // Friday 8pm is past the window.
        val friday8pm = OffsetDateTime.parse("2026-07-03T20:00:00Z")
        assertFalse(happyHour.isActiveNow(friday8pm))
    }

    @Test
    fun `scheduleText renders a consecutive day range with times`() {
        val schedule = deal(days = listOf("mon", "tue", "wed", "thu", "fri"), startTime = "15:00:00", endTime = "18:00:00").scheduleText
        assertEquals("Mon–Fri · 3:00 PM–6:00 PM", schedule)
        assertNull(deal(days = null).scheduleText)
    }
}
