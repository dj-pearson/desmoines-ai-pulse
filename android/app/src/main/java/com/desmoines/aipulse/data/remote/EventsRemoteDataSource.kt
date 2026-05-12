package com.desmoines.aipulse.data.remote

import android.util.Log
import com.desmoines.aipulse.data.model.Event
import com.desmoines.aipulse.data.model.EventSortOption
import com.desmoines.aipulse.util.Config
import io.github.jan.supabase.SupabaseClient
import io.github.jan.supabase.postgrest.from
import io.github.jan.supabase.postgrest.postgrest
import io.github.jan.supabase.postgrest.query.Count
import io.github.jan.supabase.postgrest.query.Order
import io.github.jan.supabase.postgrest.query.filter.TextSearchType
import io.github.jan.supabase.postgrest.rpc
import kotlinx.serialization.Serializable
import java.time.LocalDate
import java.time.ZoneOffset
import java.time.format.DateTimeFormatter
import javax.inject.Inject
import javax.inject.Singleton

private const val TAG = "EventsRemoteDataSource"

/**
 * Query parameters for fetching events.
 * Mirrors iOS EventsService.EventsQuery.
 */
data class EventsQuery(
    val searchText: String? = null,
    val category: String? = null,
    val dateStart: String? = null,
    val dateEnd: String? = null,
    val isFeatured: Boolean? = null,
    val freeOnly: Boolean = false,
    val cities: List<String>? = null,
    val sortBy: EventSortOption = EventSortOption.SOONEST,
    val limit: Int = Config.DEFAULT_PAGE_SIZE,
    val offset: Int = 0,
)

/**
 * Response wrapper for paginated event queries.
 * Mirrors iOS EventsService.EventsResponse.
 */
data class EventsResponse(
    val events: List<Event>,
    val totalCount: Int,
    val hasMore: Boolean,
)

/**
 * Remote data source for events, querying Supabase.
 * Mirrors iOS EventsService.swift — same table, same filters, same RPCs.
 */
@Singleton
class EventsRemoteDataSource @Inject constructor(
    private val supabaseClient: SupabaseClient?,
) {

    private fun db(): SupabaseClient =
        supabaseClient ?: throw IllegalStateException("Supabase client is not configured.")

    private fun todayIso(): String {
        val today = LocalDate.now()
        return today.atStartOfDay().atOffset(ZoneOffset.UTC)
            .format(DateTimeFormatter.ISO_OFFSET_DATE_TIME)
    }

    // region Fetch Events

    /**
     * Fetch events with filtering, full-text search, and pagination.
     * Matches iOS fetchEvents(query:) exactly.
     */
    suspend fun fetchEvents(query: EventsQuery = EventsQuery()): EventsResponse {
        val client = db()
        val today = todayIso()

        val result = client.from("events").select {
            count(Count.EXACT)
            // Only future events
            filter {
                gte("date", today)

                // Full-text search
                if (!query.searchText.isNullOrBlank()) {
                    textSearch("search_vector", query.searchText, textSearchType = TextSearchType.WEBSEARCH, config = "english")
                }

                // Category filter
                if (!query.category.isNullOrBlank()) {
                    eq("category", query.category)
                }

                // Date range
                query.dateStart?.let { gte("date", it) }
                query.dateEnd?.let { lt("date", it) }

                // Featured only
                if (query.isFeatured == true) {
                    eq("is_featured", true)
                }

                // City list filter
                if (!query.cities.isNullOrEmpty()) {
                    isIn("city", query.cities)
                }
            }

            when (query.sortBy) {
                EventSortOption.SOONEST -> {
                    order("date", Order.ASCENDING)
                }
                EventSortOption.FEATURED -> {
                    order("is_featured", Order.DESCENDING)
                    order("date", Order.ASCENDING)
                }
                EventSortOption.POPULARITY -> {
                    order("popularity_score", Order.DESCENDING)
                    order("date", Order.ASCENDING)
                }
            }
            range(query.offset.toLong(), (query.offset + query.limit - 1).toLong())
        }

        val events = result.decodeList<Event>()
        val total = result.countOrNull()?.toInt() ?: events.size

        Log.d(TAG, "fetchEvents: ${events.size} events, total=$total, offset=${query.offset}")

        return EventsResponse(
            events = events,
            totalCount = total,
            hasMore = query.offset + query.limit < total,
        )
    }

    // endregion

    // region Fetch Single Event

    /**
     * Fetch a single event by ID.
     * Matches iOS fetchEvent(id:).
     */
    suspend fun fetchEvent(id: String): Event {
        val client = db()
        return client.from("events").select {
            filter { eq("id", id) }
            limit(1)
            single()
        }.decodeAs<Event>()
    }

    // endregion

    // region Featured Events

    /**
     * Fetch featured events.
     * Matches iOS fetchFeaturedEvents(limit:).
     */
    suspend fun fetchFeaturedEvents(limit: Int = 10): List<Event> {
        val client = db()
        val today = todayIso()

        return client.from("events").select {
            filter {
                eq("is_featured", true)
                gte("date", today)
            }
            order("date", Order.ASCENDING)
            limit(limit.toLong())
        }.decodeList<Event>()
    }

    // endregion

    // region Related Events

    /**
     * Fetch events related to a given event (same category, excluding self).
     * Matches iOS fetchRelatedEvents(eventId:category:limit:).
     */
    suspend fun fetchRelatedEvents(eventId: String, category: String, limit: Int = 6): List<Event> {
        val client = db()
        val today = todayIso()

        return client.from("events").select {
            filter {
                eq("category", category)
                neq("id", eventId)
                gte("date", today)
            }
            order("date", Order.ASCENDING)
            limit(limit.toLong())
        }.decodeList<Event>()
    }

    // endregion

    // region Fuzzy Search

    @Serializable
    private data class FuzzyParams(
        val search_query: String,
        val search_limit: Int,
    )

    /**
     * Fuzzy search events via RPC.
     * Matches iOS fuzzySearchEvents(query:limit:).
     */
    suspend fun fuzzySearchEvents(query: String, limit: Int = 20): List<Event> {
        val client = db()
        return client.postgrest.rpc(
            function = "fuzzy_search_events",
            parameters = FuzzyParams(search_query = query, search_limit = limit),
        ).decodeList<Event>()
    }

    // endregion

    // region Nearby Events

    @Serializable
    private data class NearbyParams(
        val user_lat: Double,
        val user_lon: Double,
        val radius_meters: Int,
        val search_limit: Int,
    )

    /**
     * Fetch nearby events. Tries PostGIS RPC first, falls back to client-side filtering.
     * Matches iOS fetchNearbyEvents(latitude:longitude:radiusMiles:limit:).
     */
    suspend fun fetchNearbyEvents(
        latitude: Double,
        longitude: Double,
        radiusMiles: Double = Config.DEFAULT_SEARCH_RADIUS_MILES,
        limit: Int = 50,
    ): List<Event> {
        // Try PostGIS RPC first
        try {
            val rpcResults = fetchNearbyEventsViaRPC(latitude, longitude, radiusMiles, limit)
            if (rpcResults.isNotEmpty()) return rpcResults
        } catch (e: Exception) {
            Log.w(TAG, "Nearby events RPC failed, falling back to table query: ${e.message}")
        }

        // Fallback: direct table query with client-side distance filtering
        return fetchNearbyEventsViaTable(latitude, longitude, radiusMiles, limit)
    }

    private suspend fun fetchNearbyEventsViaRPC(
        latitude: Double,
        longitude: Double,
        radiusMiles: Double,
        limit: Int,
    ): List<Event> {
        val client = db()
        return client.postgrest.rpc(
            function = "search_events_near_location",
            parameters = NearbyParams(
                user_lat = latitude,
                user_lon = longitude,
                radius_meters = (radiusMiles * 1609.34).toInt(),
                search_limit = limit,
            ),
        ).decodeList<Event>()
    }

    private suspend fun fetchNearbyEventsViaTable(
        latitude: Double,
        longitude: Double,
        radiusMiles: Double,
        limit: Int,
    ): List<Event> {
        val client = db()
        val today = todayIso()
        val radiusMeters = radiusMiles * 1609.34

        // Fetch events with coordinates, filter nulls client-side for compatibility
        val events = client.from("events").select {
            filter {
                gte("date", today)
            }
            order("date", Order.ASCENDING)
            limit((limit * 3).toLong()) // Over-fetch since we filter client-side
        }.decodeList<Event>().filter { it.latitude != null && it.longitude != null }

        // Client-side distance filtering using Haversine formula
        return events.filter { event ->
            val coord = event.coordinate ?: return@filter false
            val distanceMeters = haversineDistance(
                latitude, longitude,
                coord.latitude, coord.longitude,
            )
            distanceMeters <= radiusMeters
        }
    }

    // endregion

    companion object {
        /**
         * Haversine distance in meters between two coordinates.
         * Replaces iOS CLLocation.distance(from:).
         */
        fun haversineDistance(
            lat1: Double, lon1: Double,
            lat2: Double, lon2: Double,
        ): Double {
            val earthRadiusMeters = 6_371_000.0
            val dLat = Math.toRadians(lat2 - lat1)
            val dLon = Math.toRadians(lon2 - lon1)
            val a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                Math.cos(Math.toRadians(lat1)) * Math.cos(Math.toRadians(lat2)) *
                Math.sin(dLon / 2) * Math.sin(dLon / 2)
            val c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
            return earthRadiusMeters * c
        }
    }
}
