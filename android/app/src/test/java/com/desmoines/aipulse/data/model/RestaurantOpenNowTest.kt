package com.desmoines.aipulse.data.model

import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import java.time.Instant
import java.time.LocalDateTime

/**
 * AND-AUDIT-036: business_hours are Des Moines hours, so open/closed is read on
 * the Central wall clock whatever zone the phone is in.
 */
class RestaurantOpenNowTest {

    private fun restaurant(vararg hours: Pair<String, String>) = Restaurant(
        id = "r1",
        name = "Test Kitchen",
        businessHours = buildJsonObject { hours.forEach { (day, value) -> put(day, JsonPrimitive(value)) } },
    )

    @Test
    fun `02_00 UTC Saturday reads Friday evening hours in Des Moines`() {
        // 2026-11-07 is a Saturday; 02:00 UTC is 8pm Friday 2026-11-06 in CST.
        val r = restaurant("friday" to "17:00 - 22:00", "saturday" to "closed")
        assertEquals(true, r.isOpenAt(Instant.parse("2026-11-07T02:00:00Z")))
    }

    @Test
    fun `02_00 UTC under daylight time is 9pm Central the previous weekday`() {
        // 2026-07-08 is a Wednesday; 02:00 UTC is 9pm Tuesday 2026-07-07 in CDT.
        val r = restaurant("tuesday" to "11:00 - 21:30", "wednesday" to "closed")
        assertEquals(true, r.isOpenAt(Instant.parse("2026-07-08T02:00:00Z")))
    }

    @Test
    fun `the Central minute decides closing, not the UTC minute`() {
        // 2026-11-07T04:30Z is 10:30pm Friday Central; the place shut at 22:00.
        val r = restaurant("friday" to "17:00 - 22:00", "saturday" to "00:00 - 23:59")
        assertEquals(false, r.isOpenAt(Instant.parse("2026-11-07T04:30:00Z")))
    }

    @Test
    fun `overnight hours still span midnight on the Central clock`() {
        // 2026-11-07T07:00Z is 1am Saturday Central; by the iOS rule the day's own
        // 18:00 - 02:00 entry covers it. Read as 7am UTC it would be closed.
        val r = restaurant("saturday" to "6:00 PM - 2:00 AM")
        assertEquals(true, r.isOpenAt(Instant.parse("2026-11-07T07:00:00Z")))
    }

    @Test
    fun `local evaluation keeps closed, missing and malformed hours apart`() {
        val friday8pm = LocalDateTime.of(2026, 11, 6, 20, 0)
        assertFalse(restaurant("friday" to "Closed").isOpenAtLocal(friday8pm)!!)
        assertNull(restaurant("monday" to "11:00 - 21:00").isOpenAtLocal(friday8pm))
        assertNull(restaurant("friday" to "all day").isOpenAtLocal(friday8pm))
        assertNull(Restaurant(id = "r2", name = "No Hours").isOpenAt(Instant.parse("2026-11-07T02:00:00Z")))
        assertTrue(restaurant("friday" to "11:00 AM - 9:00 PM").isOpenAtLocal(friday8pm)!!)
    }
}
