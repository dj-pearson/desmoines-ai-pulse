package com.desmoines.aipulse.data.repository

import android.util.Log
import com.desmoines.aipulse.data.local.CacheManager
import com.desmoines.aipulse.data.model.Restaurant
import com.desmoines.aipulse.data.remote.RestaurantsQuery
import com.desmoines.aipulse.data.remote.RestaurantsRemoteDataSource
import com.desmoines.aipulse.data.remote.RestaurantsResponse
import javax.inject.Inject
import javax.inject.Singleton

private const val TAG = "RestaurantsRepository"

/**
 * Repository implementation wrapping [RestaurantsRemoteDataSource] with cache-first strategy.
 * Returns cached data immediately if fresh, fetches from remote otherwise.
 * When offline, serves stale cache instead of error.
 */
@Singleton
class RestaurantsRepositoryImpl @Inject constructor(
    private val remoteDataSource: RestaurantsRemoteDataSource,
    private val cacheManager: CacheManager,
) : RestaurantsRepository {

    override suspend fun fetchRestaurants(query: RestaurantsQuery): Result<RestaurantsResponse> {
        val cacheKey = CacheManager.restaurantsKey(
            "list", query.searchText, query.cuisines?.joinToString(","),
            query.priceRanges?.joinToString(","), query.locations?.joinToString(","),
            query.minRating, query.isFeatured, query.sortBy, query.limit, query.offset,
        )

        if (cacheManager.isCacheFresh(cacheKey)) {
            cacheManager.getCachedRestaurants(cacheKey)?.let { cached ->
                return Result.success(RestaurantsResponse(restaurants = cached, totalCount = cached.size, hasMore = false))
            }
        }

        return runCatching {
            remoteDataSource.fetchRestaurants(query).also { response ->
                cacheManager.cacheRestaurants(cacheKey, response.restaurants)
            }
        }.recoverCatching { error ->
            Log.e(TAG, "fetchRestaurants failed, trying stale cache: ${error.message}", error)
            val stale = cacheManager.getCachedRestaurants(cacheKey, allowStale = true)
                ?: throw error
            RestaurantsResponse(restaurants = stale, totalCount = stale.size, hasMore = false)
        }
    }

    override suspend fun fetchRestaurant(id: String): Result<Restaurant> {
        cacheManager.getCachedRestaurant(id)?.let { cached ->
            return Result.success(cached)
        }

        return runCatching {
            remoteDataSource.fetchRestaurant(id).also { restaurant ->
                cacheManager.cacheRestaurants(CacheManager.restaurantsKey("single", id), listOf(restaurant))
            }
        }.onFailure { Log.e(TAG, "fetchRestaurant($id) failed: ${it.message}", it) }
    }

    override suspend fun fuzzySearchRestaurants(query: String, limit: Int): Result<List<Restaurant>> {
        val cacheKey = CacheManager.restaurantsKey("fuzzy", query, limit)

        if (cacheManager.isCacheFresh(cacheKey)) {
            cacheManager.getCachedRestaurants(cacheKey)?.let { return Result.success(it) }
        }

        return runCatching {
            remoteDataSource.fuzzySearchRestaurants(query, limit).also { restaurants ->
                cacheManager.cacheRestaurants(cacheKey, restaurants)
            }
        }.recoverCatching { error ->
            Log.e(TAG, "fuzzySearchRestaurants failed, trying stale cache: ${error.message}", error)
            cacheManager.getCachedRestaurants(cacheKey, allowStale = true) ?: throw error
        }
    }

    override suspend fun fetchNearbyRestaurants(
        latitude: Double,
        longitude: Double,
        radiusMiles: Double,
        limit: Int,
    ): Result<List<Restaurant>> {
        val cacheKey = CacheManager.restaurantsKey("nearby", latitude, longitude, radiusMiles, limit)

        if (cacheManager.isCacheFresh(cacheKey)) {
            cacheManager.getCachedRestaurants(cacheKey)?.let { return Result.success(it) }
        }

        return runCatching {
            remoteDataSource.fetchNearbyRestaurants(latitude, longitude, radiusMiles, limit).also { restaurants ->
                cacheManager.cacheRestaurants(cacheKey, restaurants)
            }
        }.recoverCatching { error ->
            Log.e(TAG, "fetchNearbyRestaurants failed, trying stale cache: ${error.message}", error)
            cacheManager.getCachedRestaurants(cacheKey, allowStale = true) ?: throw error
        }
    }

    override suspend fun fetchAvailableCuisines(): Result<List<String>> {
        // Cuisines are a simple list, cache with a fixed key
        return runCatching {
            remoteDataSource.fetchAvailableCuisines()
        }.onFailure { Log.e(TAG, "fetchAvailableCuisines failed: ${it.message}", it) }
    }
}
