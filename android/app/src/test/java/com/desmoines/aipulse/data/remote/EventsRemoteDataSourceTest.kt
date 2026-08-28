package com.desmoines.aipulse.data.remote

import com.desmoines.aipulse.util.Config
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

/**
 * Unit tests for EventsQuery builder logic and Haversine distance calculation.
 *
 * On JUnit 5 (Jupiter). This file was the only JUnit 4 test left in the module,
 * and with `useJUnitPlatform()` set and no vintage engine on the classpath, the
 * platform silently discovered none of its seven tests -- `./gradlew test`
 * reported green while never running them.
 */
class EventsRemoteDataSourceTest {

    // region EventsQuery tests

    @Test
    fun `default query has correct defaults`() {
        val query = EventsQuery()
        assertNull(query.searchText)
        assertNull(query.category)
        assertNull(query.dateStart)
        assertNull(query.dateEnd)
        assertNull(query.isFeatured)
        assertEquals(Config.DEFAULT_PAGE_SIZE, query.limit)
        assertEquals(0, query.offset)
    }

    @Test
    fun `query with all filters populated`() {
        val query = EventsQuery(
            searchText = "jazz",
            category = "Music",
            dateStart = "2026-03-27T00:00:00Z",
            dateEnd = "2026-03-28T00:00:00Z",
            isFeatured = true,
            limit = 10,
            offset = 20,
        )
        assertEquals("jazz", query.searchText)
        assertEquals("Music", query.category)
        assertEquals("2026-03-27T00:00:00Z", query.dateStart)
        assertEquals("2026-03-28T00:00:00Z", query.dateEnd)
        assertTrue(query.isFeatured!!)
        assertEquals(10, query.limit)
        assertEquals(20, query.offset)
    }

    @Test
    fun `EventsResponse hasMore is correct`() {
        val responseHasMore = EventsResponse(
            events = emptyList(),
            totalCount = 100,
            hasMore = true,
        )
        assertTrue(responseHasMore.hasMore)

        val responseNoMore = EventsResponse(
            events = emptyList(),
            totalCount = 5,
            hasMore = false,
        )
        assertFalse(responseNoMore.hasMore)
    }

    // endregion

    // region Haversine distance tests

    @Test
    fun `haversine distance between same point is zero`() {
        val distance = EventsRemoteDataSource.haversineDistance(
            41.5868, -93.625,
            41.5868, -93.625,
        )
        assertEquals(0.0, distance, 0.01)
    }

    @Test
    fun `haversine distance Des Moines to Ames is approximately correct`() {
        // Des Moines (41.5868, -93.625) to Ames (42.0347, -93.6199)
        // Actual ~50 km / 31 miles
        val distance = EventsRemoteDataSource.haversineDistance(
            41.5868, -93.625,
            42.0347, -93.6199,
        )
        // Approximately 49-50 km
        assertTrue(distance in 48_000.0..52_000.0, "Distance should be ~49-51 km, was ${distance / 1000} km")
    }

    @Test
    fun `haversine distance is symmetric`() {
        val d1 = EventsRemoteDataSource.haversineDistance(41.5868, -93.625, 42.0347, -93.6199)
        val d2 = EventsRemoteDataSource.haversineDistance(42.0347, -93.6199, 41.5868, -93.625)
        assertEquals(d1, d2, 0.01)
    }

    @Test
    fun `miles to meters conversion matches iOS`() {
        // iOS uses radiusMiles * 1609.34
        val thirtyMiles = 30.0 * 1609.34
        assertEquals(48_280.2, thirtyMiles, 0.1)
    }

    // endregion
}
