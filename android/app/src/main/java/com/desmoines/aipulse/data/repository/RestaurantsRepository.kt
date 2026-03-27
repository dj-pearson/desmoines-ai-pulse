package com.desmoines.aipulse.data.repository

import com.desmoines.aipulse.data.model.Restaurant
import com.desmoines.aipulse.data.remote.RestaurantsQuery
import com.desmoines.aipulse.data.remote.RestaurantsResponse

/**
 * Repository interface for restaurants.
 * Mirrors iOS RestaurantsService actor pattern, wrapping remote calls with error handling.
 */
interface RestaurantsRepository {

    /** Fetch restaurants with filtering, search, sorting, and pagination. */
    suspend fun fetchRestaurants(query: RestaurantsQuery = RestaurantsQuery()): Result<RestaurantsResponse>

    /** Fetch a single restaurant by ID. */
    suspend fun fetchRestaurant(id: String): Result<Restaurant>

    /** Fuzzy search restaurants via RPC. */
    suspend fun fuzzySearchRestaurants(query: String, limit: Int = 20): Result<List<Restaurant>>

    /** Fetch nearby restaurants using coordinates. */
    suspend fun fetchNearbyRestaurants(
        latitude: Double,
        longitude: Double,
        radiusMiles: Double = 25.0,
        limit: Int = 100,
    ): Result<List<Restaurant>>

    /** Fetch available cuisine types for filter UI. */
    suspend fun fetchAvailableCuisines(): Result<List<String>>
}
