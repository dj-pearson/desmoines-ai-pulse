package com.desmoines.aipulse.data.repository

import com.desmoines.aipulse.util.AppLogger
import com.desmoines.aipulse.data.local.CacheManager
import com.desmoines.aipulse.data.local.CachedEventsPage
import com.desmoines.aipulse.data.model.Event
import com.desmoines.aipulse.data.remote.EventsQuery
import com.desmoines.aipulse.data.remote.EventsRemoteDataSource
import com.desmoines.aipulse.data.remote.EventsResponse
import com.desmoines.aipulse.util.suspendRunCatching
import javax.inject.Inject
import javax.inject.Singleton
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
        cacheManager.getCachedEventsPage(cacheKey)?.let { page ->
            return Result.success(cachedEventsResponse(page, query))
        }

        // Fetch from remote
        return suspendRunCatching {
            remoteDataSource.fetchEvents(query).also { response ->
                cacheManager.cacheEvents(cacheKey, response.events, totalCount = response.totalCount)
            }
        }.recoverCatching { error ->
            AppLogger.network.error("fetchEvents failed, trying stale cache: ${error.message}", error)
            val stale = cacheManager.getCachedEventsPage(cacheKey, allowStale = true)
                ?: throw error
            cachedEventsResponse(stale, query)
        }
    }

    override suspend fun fetchEvent(id: String): Result<Event> {
        // Fresh cache first; getCachedEvent applies the TTL of the query that cached it
        cacheManager.getCachedEvent(id)?.let { cached ->
            return Result.success(cached)
        }

        return suspendRunCatching {
            remoteDataSource.fetchEvent(id).also { event ->
                cacheManager.cacheEvents(CacheManager.eventsKey("single", id), listOf(event))
            }
        }.recoverCatching { error ->
            AppLogger.network.error("fetchEvent($id) failed, trying stale cache: ${error.message}", error)
            cacheManager.getCachedEvent(id, allowStale = true) ?: throw error
        }
    }

    override suspend fun fetchFeaturedEvents(limit: Int): Result<List<Event>> {
        val cacheKey = CacheManager.eventsKey("featured", limit)

        if (cacheManager.isCacheFresh(cacheKey)) {
            cacheManager.getCachedEvents(cacheKey)?.let { return Result.success(it) }
        }

        return suspendRunCatching {
            remoteDataSource.fetchFeaturedEvents(limit).also { events ->
                cacheManager.cacheEvents(cacheKey, events)
            }
        }.recoverCatching { error ->
            AppLogger.network.error("fetchFeaturedEvents failed, trying stale cache: ${error.message}", error)
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

        return suspendRunCatching {
            remoteDataSource.fetchRelatedEvents(eventId, category, limit).also { events ->
                cacheManager.cacheEvents(cacheKey, events)
            }
        }.recoverCatching { error ->
            AppLogger.network.error("fetchRelatedEvents failed, trying stale cache: ${error.message}", error)
            cacheManager.getCachedEvents(cacheKey, allowStale = true) ?: throw error
        }
    }

    override suspend fun fuzzySearchEvents(query: String, limit: Int): Result<List<Event>> {
        val cacheKey = CacheManager.eventsKey("fuzzy", query, limit)

        if (cacheManager.isCacheFresh(cacheKey)) {
            cacheManager.getCachedEvents(cacheKey)?.let { return Result.success(it) }
        }

        return suspendRunCatching {
            remoteDataSource.fuzzySearchEvents(query, limit).also { events ->
                cacheManager.cacheEvents(cacheKey, events)
            }
        }.recoverCatching { error ->
            AppLogger.network.error("fuzzySearchEvents failed, trying stale cache: ${error.message}", error)
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

        return suspendRunCatching {
            remoteDataSource.fetchNearbyEvents(latitude, longitude, radiusMiles, limit).also { events ->
                cacheManager.cacheEvents(cacheKey, events)
            }
        }.recoverCatching { error ->
            AppLogger.network.error("fetchNearbyEvents failed, trying stale cache: ${error.message}", error)
            cacheManager.getCachedEvents(cacheKey, allowStale = true) ?: throw error
        }
    }
}

/**
 * Rebuild a paginated response from a cached page. The cache used to answer
 * hasMore = false, which ended infinite scroll after page one for as long as
 * the 5-minute TTL held. hasMore follows the same rule as EventsRemoteDataSource.
 *
 * A page with no stored count can only be a row written before total_count
 * existed; it falls back to "a full page may have more", which costs at most
 * one empty fetch rather than hiding the rest of the list.
 */
internal fun cachedEventsResponse(page: CachedEventsPage, query: EventsQuery): EventsResponse {
    val total = page.totalCount
    return if (total != null) {
        EventsResponse(
            events = page.events,
            totalCount = total,
            hasMore = query.offset + query.limit < total,
        )
    } else {
        EventsResponse(
            events = page.events,
            totalCount = query.offset + page.events.size,
            hasMore = page.events.size >= query.limit,
        )
    }
}
