package com.desmoines.aipulse.data.repository

import com.desmoines.aipulse.data.model.Event
import com.desmoines.aipulse.data.remote.EventsQuery
import com.desmoines.aipulse.data.remote.EventsResponse
import com.desmoines.aipulse.util.EventSeriesDef
import com.desmoines.aipulse.util.SeriesEventRow

/**
 * Repository interface for events.
 * Mirrors iOS EventsService actor pattern, wrapping remote calls with error handling.
 */
interface EventsRepository {

    /** Fetch events with filtering, search, and pagination. */
    suspend fun fetchEvents(query: EventsQuery = EventsQuery()): Result<EventsResponse>

    /** Fetch a single event by ID. */
    suspend fun fetchEvent(id: String): Result<Event>

    /** Fetch featured events. */
    suspend fun fetchFeaturedEvents(limit: Int = 10): Result<List<Event>>

    /** Fetch events related to a given event (same category, excluding self). */
    suspend fun fetchRelatedEvents(eventId: String, category: String, limit: Int = 6): Result<List<Event>>

    /**
     * Every row of one annual series, hidden and archived ones included, for
     * the series screen (AND-AUDIT-042). Not cached: the screen is opened
     * from a link, and a stale edition list would hide a newly announced date.
     */
    suspend fun fetchSeriesRows(def: EventSeriesDef): Result<List<SeriesEventRow>>

    /** Fuzzy search events via RPC. */
    suspend fun fuzzySearchEvents(query: String, limit: Int = 20): Result<List<Event>>

    /** Fetch nearby events using coordinates. */
    suspend fun fetchNearbyEvents(
        latitude: Double,
        longitude: Double,
        radiusMiles: Double = 30.0,
        limit: Int = 50,
    ): Result<List<Event>>
}
