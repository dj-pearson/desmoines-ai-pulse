package com.desmoines.aipulse.data.repository

import android.util.Log
import com.desmoines.aipulse.data.model.Restaurant
import com.desmoines.aipulse.data.remote.RestaurantsQuery
import com.desmoines.aipulse.data.remote.RestaurantsRemoteDataSource
import com.desmoines.aipulse.data.remote.RestaurantsResponse
import javax.inject.Inject
import javax.inject.Singleton

private const val TAG = "RestaurantsRepository"

/**
 * Repository implementation wrapping [RestaurantsRemoteDataSource] with error handling.
 * Returns [Result] types so callers handle success/failure uniformly.
 */
@Singleton
class RestaurantsRepositoryImpl @Inject constructor(
    private val remoteDataSource: RestaurantsRemoteDataSource,
) : RestaurantsRepository {

    override suspend fun fetchRestaurants(query: RestaurantsQuery): Result<RestaurantsResponse> = runCatching {
        remoteDataSource.fetchRestaurants(query)
    }.onFailure { Log.e(TAG, "fetchRestaurants failed: ${it.message}", it) }

    override suspend fun fetchRestaurant(id: String): Result<Restaurant> = runCatching {
        remoteDataSource.fetchRestaurant(id)
    }.onFailure { Log.e(TAG, "fetchRestaurant($id) failed: ${it.message}", it) }

    override suspend fun fuzzySearchRestaurants(query: String, limit: Int): Result<List<Restaurant>> = runCatching {
        remoteDataSource.fuzzySearchRestaurants(query, limit)
    }.onFailure { Log.e(TAG, "fuzzySearchRestaurants($query) failed: ${it.message}", it) }

    override suspend fun fetchNearbyRestaurants(
        latitude: Double,
        longitude: Double,
        radiusMiles: Double,
        limit: Int,
    ): Result<List<Restaurant>> = runCatching {
        remoteDataSource.fetchNearbyRestaurants(latitude, longitude, radiusMiles, limit)
    }.onFailure { Log.e(TAG, "fetchNearbyRestaurants failed: ${it.message}", it) }

    override suspend fun fetchAvailableCuisines(): Result<List<String>> = runCatching {
        remoteDataSource.fetchAvailableCuisines()
    }.onFailure { Log.e(TAG, "fetchAvailableCuisines failed: ${it.message}", it) }
}
