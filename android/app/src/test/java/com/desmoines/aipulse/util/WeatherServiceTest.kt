package com.desmoines.aipulse.util

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class WeatherServiceTest {

    @Test
    fun `maps WMO codes to condition buckets`() {
        assertEquals(WeatherCondition.CLEAR, WeatherService.bucketFor(0))
        assertEquals(WeatherCondition.CLOUDY, WeatherService.bucketFor(2))
        assertEquals(WeatherCondition.FOG, WeatherService.bucketFor(48))
        assertEquals(WeatherCondition.RAIN, WeatherService.bucketFor(61))
        assertEquals(WeatherCondition.SNOW, WeatherService.bucketFor(75))
        assertEquals(WeatherCondition.THUNDER, WeatherService.bucketFor(95))
        assertEquals(WeatherCondition.UNKNOWN, WeatherService.bucketFor(123))
    }

    @Test
    fun `rounds coordinates to two decimals`() {
        assertEquals(41.59, WeatherService.roundCoord(41.586789), 0.0001)
        assertEquals(12.34, WeatherService.roundCoord(12.344), 0.0001)
    }

    @Test
    fun `does not refetch fresh cache at same location`() {
        val prev = WeatherSnapshot(70.0, WeatherCondition.CLEAR, fetchedAt = 0L, lat = 41.59, lon = -93.62)
        val now = WeatherService.CACHE_TTL_MILLIS - 1
        assertFalse(WeatherService.shouldRefetch(prev, 41.59, -93.62, now))
    }

    @Test
    fun `refetches when cache is stale`() {
        val prev = WeatherSnapshot(70.0, WeatherCondition.CLEAR, fetchedAt = 0L, lat = 41.59, lon = -93.62)
        assertTrue(WeatherService.shouldRefetch(prev, 41.59, -93.62, WeatherService.CACHE_TTL_MILLIS))
    }

    @Test
    fun `refetches when device moved appreciably`() {
        val prev = WeatherSnapshot(70.0, WeatherCondition.CLEAR, fetchedAt = 0L, lat = 41.59, lon = -93.62)
        assertTrue(WeatherService.shouldRefetch(prev, 41.70, -93.62, now = 1L))
    }
}
