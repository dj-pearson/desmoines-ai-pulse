package com.desmoines.aipulse.data.remote

import android.util.Log
import com.desmoines.aipulse.data.model.Attraction
import com.desmoines.aipulse.util.Config
import io.github.jan.supabase.SupabaseClient
import io.github.jan.supabase.postgrest.from
import io.github.jan.supabase.postgrest.query.Count
import io.github.jan.supabase.postgrest.query.Order
import javax.inject.Inject
import javax.inject.Singleton

private const val TAG = "AttractionsRemoteDS"

/**
 * Query parameters for fetching attractions.
 * Mirrors iOS AttractionsService.AttractionsQuery.
 */
data class AttractionsQuery(
    val searchText: String? = null,
    val type: String? = null,
    val minRating: Double? = null,
    val isFeatured: Boolean? = null,
    val limit: Int = Config.DEFAULT_PAGE_SIZE,
    val offset: Int = 0,
)

/**
 * Response wrapper for paginated attraction queries.
 * Mirrors iOS AttractionsService.AttractionsResponse.
 */
data class AttractionsResponse(
    val attractions: List<Attraction>,
    val totalCount: Int,
    val hasMore: Boolean,
)

/**
 * Remote data source for attractions, querying Supabase.
 * Mirrors iOS AttractionsService.swift — same table, same filters, same logic.
 */
@Singleton
class AttractionsRemoteDataSource @Inject constructor(
    private val supabaseClient: SupabaseClient?,
) {

    private fun db(): SupabaseClient =
        supabaseClient ?: throw IllegalStateException("Supabase client is not configured.")

    // region Fetch Attractions

    /**
     * Fetch attractions with filtering, ILIKE search, and pagination.
     * Matches iOS fetchAttractions(query:) exactly.
     *
     * Uses multi-field ILIKE search on name, type, and location (via .or())
     * instead of full-text search, matching the iOS/web pattern.
     */
    suspend fun fetchAttractions(query: AttractionsQuery = AttractionsQuery()): AttractionsResponse {
        val client = db()

        val result = client.from("attractions").select {
            count(Count.EXACT)
            // Multi-field ILIKE search (matches iOS .or("name.ilike.%X%,type.ilike.%X%,location.ilike.%X%"))
            if (!query.searchText.isNullOrBlank()) {
                filter {
                    or {
                        ilike("name", "%${query.searchText}%")
                        ilike("type", "%${query.searchText}%")
                        ilike("location", "%${query.searchText}%")
                    }
                }
            }

            // Type filter
            if (!query.type.isNullOrBlank()) {
                filter { eq("type", query.type) }
            }

            // Rating filter
            query.minRating?.let { rating ->
                filter { gte("rating", rating) }
            }

            // Featured filter
            if (query.isFeatured == true) {
                filter { eq("is_featured", true) }
            }

            order("created_at", Order.DESCENDING)
            range(query.offset.toLong(), (query.offset + query.limit - 1).toLong())
        }

        val attractions = result.decodeList<Attraction>()
        val total = result.countOrNull()?.toInt() ?: attractions.count()

        Log.d(TAG, "fetchAttractions: ${attractions.size} attractions, total=$total, offset=${query.offset}")

        return AttractionsResponse(
            attractions = attractions,
            totalCount = total,
            hasMore = query.offset + query.limit < total,
        )
    }

    // endregion

    // region Nearby Attractions

    /**
     * Fetch nearby attractions with client-side distance filtering.
     * Matches iOS fetchNearbyAttractions(latitude:longitude:limit:).
     *
     * Attractions don't have a PostGIS RPC yet, so we query attractions with
     * non-null coordinates and filter by distance client-side.
     */
    suspend fun fetchNearbyAttractions(
        latitude: Double,
        longitude: Double,
        limit: Int = 50,
    ): List<Attraction> {
        val client = db()
        val radiusMeters = Config.DEFAULT_SEARCH_RADIUS_MILES * 1609.34

        // Fetch attractions with coordinates — filter nulls client-side for compatibility
        val attractions = client.from("attractions").select {
            limit(limit.toLong())
        }.decodeList<Attraction>().filter { it.latitude != null && it.longitude != null }

        // Client-side distance filtering using Haversine formula
        return attractions.filter { attraction ->
            val coord = attraction.coordinate ?: return@filter false
            val distanceMeters = EventsRemoteDataSource.haversineDistance(
                latitude, longitude,
                coord.latitude, coord.longitude,
            )
            distanceMeters <= radiusMeters
        }
    }

    // endregion

    // region Fetch Single Attraction

    /**
     * Fetch a single attraction by ID.
     * Matches iOS fetchAttraction(id:).
     */
    suspend fun fetchAttraction(id: String): Attraction {
        val client = db()
        return client.from("attractions").select {
            filter { eq("id", id) }
            limit(1)
            single()
        }.decodeAs<Attraction>()
    }

    // endregion
}
