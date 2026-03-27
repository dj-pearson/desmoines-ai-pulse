package com.desmoines.aipulse.data.repository

import android.util.Log
import com.desmoines.aipulse.data.local.CacheManager
import com.desmoines.aipulse.data.model.Event
import com.desmoines.aipulse.data.remote.EventsQuery
import com.desmoines.aipulse.data.remote.EventsRemoteDataSource
import com.desmoines.aipulse.data.remote.EventsResponse
import javax.inject.Inject
import javax.inject.Singleton

private const val TAG = "EventsRepository"

/**
 * Repository implementation wrapping [EventsRemoteDataSource] with cache-first strategy.
 * Returns cached data immediately if fresh, fetches from remote otherwise.
 * When offline, serves stale cache instead of error.
 */
@Singleton
class EventsRepositoryImpl @Inject constructor(
    private val remoteDataSource: EventsRemoteDataSource,
    private val cacheManager: CacheManager,
) : EventsRepository {

    override suspend fun fetchEvents(query: EventsQuery): Result<EventsResponse> {
        val cacheKey = CacheManager.eventsKey(
            "list", query.searchText, query.category, query.dateStart, query.dateEnd,
            query.isFeatured, query.limit, query.offset,
        )

        // Return fresh cache if available
        if (cacheManager.isCacheFresh(cacheKey)) {
            cacheManager.getCachedEvents(cacheKey)?.let { cached ->
                return Result.success(EventsResponse(events = cached, totalCount = cached.size, hasMore = false))
            }
        }

        // Fetch from remote
        return runCatching {
            remoteDataSource.fetchEvents(query).also { response ->
                cacheManager.cacheEvents(cacheKey, response.events)
            }
        }.recoverCatching { error ->
            Log.e(TAG, "fetchEvents failed, trying stale cache: ${error.message}", error)
            val stale = cacheManager.getCachedEvents(cacheKey, allowStale = true)
                ?: throw error
            EventsResponse(events = stale, totalCount = stale.size, hasMore = false)
        }
    }

    override suspend fun fetchEvent(id: String): Result<Event> {
        // Check cache first
        cacheManager.getCachedEvent(id)?.let { cached ->
            return Result.success(cached)
        }

        return runCatching {
            remoteDataSource.fetchEvent(id).also { event ->
                cacheManager.cacheEvents(CacheManager.eventsKey("single", id), listOf(event))
            }
        }.onFailure { Log.e(TAG, "fetchEvent($id) failed: ${it.message}", it) }
    }

    override suspend fun fetchFeaturedEvents(limit: Int): Result<List<Event>> {
        val cacheKey = CacheManager.eventsKey("featured", limit)

        if (cacheManager.isCacheFresh(cacheKey)) {
            cacheManager.getCachedEvents(cacheKey)?.let { return Result.success(it) }
        }

        return runCatching {
            remoteDataSource.fetchFeaturedEvents(limit).also { events ->
                cacheManager.cacheEvents(cacheKey, events)
            }
        }.recoverCatching { error ->
            Log.e(TAG, "fetchFeaturedEvents failed, trying stale cache: ${error.message}", error)
            cacheManager.getCachedEvents(cacheKey, allowStale = true) ?: throw error
        }
    }

    override suspend fun fetchRelatedEvents(
        eventId: String,
        category: String,
        limit: Int,
    ): Result<List<Event>> {
        val cacheKey = CacheManager.eventsKey("related", eventId, category, limit)

        if (cacheManager.isCacheFresh(cacheKey)) {
            cacheManager.getCachedEvents(cacheKey)?.let { return Result.success(it) }
        }

        return runCatching {
            remoteDataSource.fetchRelatedEvents(eventId, category, limit).also { events ->
                cacheManager.cacheEvents(cacheKey, events)
            }
        }.recoverCatching { error ->
            Log.e(TAG, "fetchRelatedEvents failed, trying stale cache: ${error.message}", error)
            cacheManager.getCachedEvents(cacheKey, allowStale = true) ?: throw error
        }
    }

    override suspend fun fuzzySearchEvents(query: String, limit: Int): Result<List<Event>> {
        val cacheKey = CacheManager.eventsKey("fuzzy", query, limit)

        if (cacheManager.isCacheFresh(cacheKey)) {
            cacheManager.getCachedEvents(cacheKey)?.let { return Result.success(it) }
        }

        return runCatching {
            remoteDataSource.fuzzySearchEvents(query, limit).also { events ->
                cacheManager.cacheEvents(cacheKey, events)
            }
        }.recoverCatching { error ->
            Log.e(TAG, "fuzzySearchEvents failed, trying stale cache: ${error.message}", error)
            cacheManager.getCachedEvents(cacheKey, allowStale = true) ?: throw error
        }
    }

    override suspend fun fetchNearbyEvents(
        latitude: Double,
        longitude: Double,
        radiusMiles: Double,
        limit: Int,
    ): Result<List<Event>> {
        val cacheKey = CacheManager.eventsKey("nearby", latitude, longitude, radiusMiles, limit)

        if (cacheManager.isCacheFresh(cacheKey)) {
            cacheManager.getCachedEvents(cacheKey)?.let { return Result.success(it) }
        }

        return runCatching {
            remoteDataSource.fetchNearbyEvents(latitude, longitude, radiusMiles, limit).also { events ->
                cacheManager.cacheEvents(cacheKey, events)
            }
        }.recoverCatching { error ->
            Log.e(TAG, "fetchNearbyEvents failed, trying stale cache: ${error.message}", error)
            cacheManager.getCachedEvents(cacheKey, allowStale = true) ?: throw error
        }
    }
}
