package com.desmoines.aipulse.data.remote

import android.util.Log
import com.desmoines.aipulse.data.model.Restaurant
import com.desmoines.aipulse.data.model.RestaurantSortOption
import com.desmoines.aipulse.util.Config
import io.github.jan.supabase.SupabaseClient
import io.github.jan.supabase.postgrest.from
import io.github.jan.supabase.postgrest.postgrest
import io.github.jan.supabase.postgrest.query.Count
import io.github.jan.supabase.postgrest.query.Order
import io.github.jan.supabase.postgrest.query.filter.TextSearchType
import io.github.jan.supabase.postgrest.rpc
import kotlinx.serialization.Serializable
import javax.inject.Inject
import javax.inject.Singleton

private const val TAG = "RestaurantsRemoteDS"

/**
 * Query parameters for fetching restaurants.
 * Mirrors iOS RestaurantsService.RestaurantsQuery.
 */
data class RestaurantsQuery(
    val searchText: String? = null,
    val cuisines: List<String>? = null,
    val priceRanges: List<String>? = null,
    val locations: List<String>? = null,
    val minRating: Double? = null,
    val isFeatured: Boolean? = null,
    val sortBy: RestaurantSortOption = RestaurantSortOption.POPULARITY,
    val limit: Int = Config.DEFAULT_PAGE_SIZE,
    val offset: Int = 0,
)

/**
 * Response wrapper for paginated restaurant queries.
 * Mirrors iOS RestaurantsService.RestaurantsResponse.
 */
data class RestaurantsResponse(
    val restaurants: List<Restaurant>,
    val totalCount: Int,
    val hasMore: Boolean,
)

/**
 * Remote data source for restaurants, querying Supabase.
 * Mirrors iOS RestaurantsService.swift — same table, same filters, same RPCs.
 */
@Singleton
class RestaurantsRemoteDataSource @Inject constructor(
    private val supabaseClient: SupabaseClient?,
) {

    private fun db(): SupabaseClient =
        supabaseClient ?: throw IllegalStateException("Supabase client is not configured.")

    // region Fetch Restaurants

    /**
     * Fetch restaurants with filtering, full-text search, sorting, and pagination.
     * Matches iOS fetchRestaurants(query:) exactly.
     */
    suspend fun fetchRestaurants(query: RestaurantsQuery = RestaurantsQuery()): RestaurantsResponse {
        val client = db()

        val result = client.from("restaurants").select {
            count(Count.EXACT)
            filter {
                // Full-text search
                if (!query.searchText.isNullOrBlank()) {
                    textSearch("search_vector", query.searchText, textSearchType = TextSearchType.WEBSEARCH, config = "english")
                }

                // Cuisine filter
                if (!query.cuisines.isNullOrEmpty()) {
                    isIn("cuisine", query.cuisines)
                }

                // Price range filter
                if (!query.priceRanges.isNullOrEmpty()) {
                    isIn("price_range", query.priceRanges)
                }

                // Location filter
                if (!query.locations.isNullOrEmpty()) {
                    isIn("location", query.locations)
                }

                // Rating filter
                query.minRating?.let { gte("rating", it) }

                // Featured only
                if (query.isFeatured == true) {
                    eq("is_featured", true)
                }
            }

            // Sorting — each option has specific ordering to match iOS exactly
            when (query.sortBy) {
                RestaurantSortOption.POPULARITY -> {
                    order("popularity_score", Order.DESCENDING)
                    order("is_featured", Order.DESCENDING)
                    order("created_at", Order.DESCENDING)
                }
                RestaurantSortOption.RATING -> {
                    order("rating", Order.DESCENDING)
                    order("popularity_score", Order.DESCENDING)
                }
                RestaurantSortOption.NEWEST -> {
                    order("created_at", Order.DESCENDING)
                }
                RestaurantSortOption.ALPHABETICAL -> {
                    order("name", Order.ASCENDING)
                }
                RestaurantSortOption.PRICE_LOW -> {
                    order("price_range", Order.ASCENDING)
                    order("popularity_score", Order.DESCENDING)
                }
                RestaurantSortOption.PRICE_HIGH -> {
                    order("price_range", Order.DESCENDING)
                    order("popularity_score", Order.DESCENDING)
                }
            }

            range(query.offset.toLong(), (query.offset + query.limit - 1).toLong())
        }

        val restaurants = result.decodeList<Restaurant>()
        val total = result.countOrNull()?.toInt() ?: restaurants.size

        Log.d(TAG, "fetchRestaurants: ${restaurants.size} restaurants, total=$total, offset=${query.offset}")

        return RestaurantsResponse(
            restaurants = restaurants,
            totalCount = total,
            hasMore = query.offset + query.limit < total,
        )
    }

    // endregion

    // region Fetch Single Restaurant

    /**
     * Fetch a single restaurant by ID.
     * Matches iOS fetchRestaurant(id:).
     */
    suspend fun fetchRestaurant(id: String): Restaurant {
        val client = db()
        return client.from("restaurants").select {
            filter { eq("id", id) }
            limit(1)
            single()
        }.decodeAs<Restaurant>()
    }

    // endregion

    // region Nearby Restaurants

    @Serializable
    private data class NearbyParams(
        val center_lat: Double,
        val center_lng: Double,
        val radius_miles: Double,
        val limit_count: Int,
    )

    /**
     * Fetch nearby restaurants. Tries PostGIS RPC first, falls back to client-side filtering.
     * Matches iOS fetchNearbyRestaurants(latitude:longitude:radiusMiles:limit:).
     */
    suspend fun fetchNearbyRestaurants(
        latitude: Double,
        longitude: Double,
        radiusMiles: Double = 25.0,
        limit: Int = 100,
    ): List<Restaurant> {
        // Try PostGIS RPC first
        try {
            val rpcResults = fetchNearbyRestaurantsViaRPC(latitude, longitude, radiusMiles, limit)
            if (rpcResults.isNotEmpty()) return rpcResults
        } catch (e: Exception) {
            Log.w(TAG, "Nearby restaurants RPC failed, falling back to table query: ${e.message}")
        }

        // Fallback: direct table query with client-side distance filtering
        return fetchNearbyRestaurantsViaTable(latitude, longitude, radiusMiles, limit)
    }

    private suspend fun fetchNearbyRestaurantsViaRPC(
        latitude: Double,
        longitude: Double,
        radiusMiles: Double,
        limit: Int,
    ): List<Restaurant> {
        val client = db()
        return client.postgrest.rpc(
            function = "restaurants_within_radius",
            parameters = NearbyParams(
                center_lat = latitude,
                center_lng = longitude,
                radius_miles = radiusMiles,
                limit_count = limit,
            ),
        ).decodeList<Restaurant>()
    }

    private suspend fun fetchNearbyRestaurantsViaTable(
        latitude: Double,
        longitude: Double,
        radiusMiles: Double,
        limit: Int,
    ): List<Restaurant> {
        val client = db()
        val radiusMeters = radiusMiles * 1609.34

        // Fetch restaurants with coordinates, filter client-side for distance
        val restaurants = client.from("restaurants").select {
            filter {
                neq("latitude", "null")
                neq("longitude", "null")
            }
            limit(limit.toLong())
        }.decodeList<Restaurant>().filter { it.latitude != null && it.longitude != null }

        // Client-side distance filtering using Haversine formula
        return restaurants.filter { restaurant ->
            val coord = restaurant.coordinate ?: return@filter false
            val distanceMeters = EventsRemoteDataSource.haversineDistance(
                latitude, longitude,
                coord.latitude, coord.longitude,
            )
            distanceMeters <= radiusMeters
        }
    }

    // endregion

    // region Fuzzy Search

    @Serializable
    private data class FuzzyParams(
        val search_query: String,
        val search_limit: Int,
    )

    /**
     * Fuzzy search restaurants via RPC.
     * Matches iOS fuzzySearchRestaurants(query:limit:).
     */
    suspend fun fuzzySearchRestaurants(query: String, limit: Int = 20): List<Restaurant> {
        val client = db()
        return client.postgrest.rpc(
            function = "fuzzy_search_restaurants",
            parameters = FuzzyParams(search_query = query, search_limit = limit),
        ).decodeList<Restaurant>()
    }

    // endregion

    // region Cuisine List

    @Serializable
    private data class CuisineRow(
        val cuisine: String? = null,
    )

    /**
     * Fetch available cuisine types.
     * Matches iOS fetchAvailableCuisines().
     */
    suspend fun fetchAvailableCuisines(): List<String> {
        val client = db()
        val rows = client.from("restaurants").select(
            io.github.jan.supabase.postgrest.query.Columns.list("cuisine"),
        ) {
            order("cuisine", Order.ASCENDING)
        }.decodeList<CuisineRow>()

        return rows.mapNotNull { it.cuisine }.distinct().sorted()
    }

    // endregion
}
