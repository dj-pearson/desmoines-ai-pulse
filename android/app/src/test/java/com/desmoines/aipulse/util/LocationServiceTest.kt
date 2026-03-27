package com.desmoines.aipulse.util

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

/**
 * Tests for LocationService distance calculation and formatting.
 * Tests the static Haversine and formatMiles methods directly.
 */
class LocationServiceTest {

    @Test
    fun `haversineDistanceMiles same point is zero`() {
        val distance = LocationService.haversineDistanceMiles(
            41.5868, -93.625,
            41.5868, -93.625,
        )
        assertEquals(0.0, distance, 0.001)
    }

    @Test
    fun `haversineDistanceMiles Des Moines to Ames is approximately 30 miles`() {
        val distance = LocationService.haversineDistanceMiles(
            41.5868, -93.625,
            42.0347, -93.6199,
        )
        // Approximately 30-32 miles
        assertTrue(distance in 29.0..33.0, "Distance should be ~30-32 miles, was $distance")
    }

    @Test
    fun `haversineDistanceMiles is symmetric`() {
        val d1 = LocationService.haversineDistanceMiles(41.5868, -93.625, 42.0347, -93.6199)
        val d2 = LocationService.haversineDistanceMiles(42.0347, -93.6199, 41.5868, -93.625)
        assertEquals(d1, d2, 0.001)
    }

    @Test
    fun `haversineDistanceMiles cross-country is reasonable`() {
        // Des Moines to New York City (~1050 miles)
        val distance = LocationService.haversineDistanceMiles(
            41.5868, -93.625,
            40.7128, -74.0060,
        )
        assertTrue(distance in 1000.0..1100.0, "DSM to NYC should be ~1050 miles, was $distance")
    }

    @Test
    fun `formatMiles very close is Nearby`() {
        assertEquals("Nearby", LocationService.formatMiles(0.05))
    }

    @Test
    fun `formatMiles under 1 mile shows feet`() {
        val result = LocationService.formatMiles(0.5)
        assertTrue(result.contains("ft away"), "Expected feet format, got: $result")
        assertTrue(result.contains("2640"), "0.5 miles = 2640 ft, got: $result")
    }

    @Test
    fun `formatMiles over 1 mile shows miles`() {
        val result = LocationService.formatMiles(5.3)
        assertEquals("5.3 mi", result)
    }

    @Test
    fun `formatMiles exactly 0_1 is feet not Nearby`() {
        // 0.1 miles >= 0.1, so should be feet
        val result = LocationService.formatMiles(0.1)
        assertTrue(result.contains("ft away"), "0.1 miles should show feet, got: $result")
    }

    @Test
    fun `formatMiles exactly 1_0 shows miles`() {
        val result = LocationService.formatMiles(1.0)
        assertEquals("1.0 mi", result)
    }

    @Test
    fun `formatMiles zero is Nearby`() {
        assertEquals("Nearby", LocationService.formatMiles(0.0))
    }
}
