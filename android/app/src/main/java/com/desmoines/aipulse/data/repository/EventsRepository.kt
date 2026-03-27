package com.desmoines.aipulse.data.repository

import com.desmoines.aipulse.data.model.Event
import com.desmoines.aipulse.data.remote.EventsQuery
import com.desmoines.aipulse.data.remote.EventsResponse

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
