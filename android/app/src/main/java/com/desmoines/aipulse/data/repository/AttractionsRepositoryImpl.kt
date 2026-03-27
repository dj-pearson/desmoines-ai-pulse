package com.desmoines.aipulse.data.repository

import android.util.Log
import com.desmoines.aipulse.data.local.CacheManager
import com.desmoines.aipulse.data.model.Attraction
import com.desmoines.aipulse.data.remote.AttractionsQuery
import com.desmoines.aipulse.data.remote.AttractionsRemoteDataSource
import com.desmoines.aipulse.data.remote.AttractionsResponse
import javax.inject.Inject
import javax.inject.Singleton

private const val TAG = "AttractionsRepository"

/**
 * Repository implementation wrapping [AttractionsRemoteDataSource] with cache-first strategy.
 * Returns cached data immediately if fresh, fetches from remote otherwise.
 * When offline, serves stale cache instead of error.
 */
@Singleton
class AttractionsRepositoryImpl @Inject constructor(
    private val remoteDataSource: AttractionsRemoteDataSource,
    private val cacheManager: CacheManager,
) : AttractionsRepository {

    override suspend fun fetchAttractions(query: AttractionsQuery): Result<AttractionsResponse> {
        val cacheKey = CacheManager.attractionsKey(
            "list", query.searchText, query.type, query.minRating,
            query.isFeatured, query.limit, query.offset,
        )

        if (cacheManager.isCacheFresh(cacheKey)) {
            cacheManager.getCachedAttractions(cacheKey)?.let { cached ->
                return Result.success(AttractionsResponse(attractions = cached, totalCount = cached.size, hasMore = false))
            }
        }

        return runCatching {
            remoteDataSource.fetchAttractions(query).also { response ->
                cacheManager.cacheAttractions(cacheKey, response.attractions)
            }
        }.recoverCatching { error ->
            Log.e(TAG, "fetchAttractions failed, trying stale cache: ${error.message}", error)
            val stale = cacheManager.getCachedAttractions(cacheKey, allowStale = true)
                ?: throw error
            AttractionsResponse(attractions = stale, totalCount = stale.size, hasMore = false)
        }
    }

    override suspend fun fetchAttraction(id: String): Result<Attraction> {
        cacheManager.getCachedAttraction(id)?.let { cached ->
            return Result.success(cached)
        }

        return runCatching {
            remoteDataSource.fetchAttraction(id).also { attraction ->
                cacheManager.cacheAttractions(CacheManager.attractionsKey("single", id), listOf(attraction))
            }
        }.onFailure { Log.e(TAG, "fetchAttraction($id) failed: ${it.message}", it) }
    }

    override suspend fun fetchNearbyAttractions(
        latitude: Double,
        longitude: Double,
        limit: Int,
    ): Result<List<Attraction>> {
        val cacheKey = CacheManager.attractionsKey("nearby", latitude, longitude, limit)

        if (cacheManager.isCacheFresh(cacheKey)) {
            cacheManager.getCachedAttractions(cacheKey)?.let { return Result.success(it) }
        }

        return runCatching {
            remoteDataSource.fetchNearbyAttractions(latitude, longitude, limit).also { attractions ->
                cacheManager.cacheAttractions(cacheKey, attractions)
            }
        }.recoverCatching { error ->
            Log.e(TAG, "fetchNearbyAttractions failed, trying stale cache: ${error.message}", error)
            cacheManager.getCachedAttractions(cacheKey, allowStale = true) ?: throw error
        }
    }
}
