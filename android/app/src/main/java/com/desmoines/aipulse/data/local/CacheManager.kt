package com.desmoines.aipulse.data.local

import com.desmoines.aipulse.util.AppLogger
import com.desmoines.aipulse.data.local.dao.AttractionDao
import com.desmoines.aipulse.data.local.dao.CacheMetadataDao
import com.desmoines.aipulse.data.local.dao.EventDao
import com.desmoines.aipulse.data.local.dao.RestaurantDao
import com.desmoines.aipulse.data.local.entity.CacheMetadata
import com.desmoines.aipulse.data.local.entity.CachedAttraction
import com.desmoines.aipulse.data.local.entity.CachedEvent
import com.desmoines.aipulse.data.local.entity.CachedRestaurant
import com.desmoines.aipulse.data.model.Attraction
import com.desmoines.aipulse.data.model.Event
import com.desmoines.aipulse.data.model.Restaurant
import com.desmoines.aipulse.util.Config
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import javax.inject.Inject
import javax.inject.Singleton
private const val PRUNE_AGE_HOURS = 24L

/**
 * Manages offline cache for events, restaurants, and attractions.
 * Mirrors iOS QueryCache.swift behavior:
 * - TTL-based expiration (default 5 minutes from Config)
 * - Stale cache serving when offline
 * - Pruning of entries older than 24 hours on app launch
 * - Cache key includes query parameters for distinct result sets
 */
@Singleton
class CacheManager @Inject constructor(
    private val eventDao: EventDao,
    private val restaurantDao: RestaurantDao,
    private val attractionDao: AttractionDao,
    private val cacheMetadataDao: CacheMetadataDao,
    private val json: Json,
) {

    // region Events

    suspend fun getCachedEvents(cacheKey: String, allowStale: Boolean = false): List<Event>? {
        val metadata = cacheMetadataDao.get(cacheKey) ?: return null
        if (!allowStale && metadata.isExpired) return null
        return try {
            eventDao.getAllByKey(cacheKey).map { json.decodeFromString<Event>(it.jsonData) }
        } catch (e: Exception) {
            AppLogger.cache.warning("Failed to deserialize cached events for $cacheKey", e)
            null
        }
    }

    suspend fun getCachedEvent(id: String): Event? {
        return try {
            eventDao.getById(id)?.let { json.decodeFromString<Event>(it.jsonData) }
        } catch (e: Exception) {
            AppLogger.cache.warning("Failed to deserialize cached event $id", e)
            null
        }
    }

    suspend fun cacheEvents(cacheKey: String, events: List<Event>, ttlMinutes: Int = Config.CACHE_EXPIRATION_MINUTES) {
        try {
            val now = System.currentTimeMillis()
            val entities = events.map { event ->
                CachedEvent(
                    id = event.id,
                    jsonData = json.encodeToString(event),
                    cacheKey = cacheKey,
                    cachedAt = now,
                )
            }
            eventDao.deleteByKey(cacheKey)
            eventDao.insertAll(entities)
            cacheMetadataDao.upsert(
                CacheMetadata(cacheKey = cacheKey, cachedAt = now, ttlMinutes = ttlMinutes, itemCount = events.size)
            )
        } catch (e: Exception) {
            AppLogger.cache.error("Failed to cache events for $cacheKey", e)
        }
    }

    // endregion

    // region Restaurants

    suspend fun getCachedRestaurants(cacheKey: String, allowStale: Boolean = false): List<Restaurant>? {
        val metadata = cacheMetadataDao.get(cacheKey) ?: return null
        if (!allowStale && metadata.isExpired) return null
        return try {
            restaurantDao.getAllByKey(cacheKey).map { json.decodeFromString<Restaurant>(it.jsonData) }
        } catch (e: Exception) {
            AppLogger.cache.warning("Failed to deserialize cached restaurants for $cacheKey", e)
            null
        }
    }

    suspend fun getCachedRestaurant(id: String): Restaurant? {
        return try {
            restaurantDao.getById(id)?.let { json.decodeFromString<Restaurant>(it.jsonData) }
        } catch (e: Exception) {
            AppLogger.cache.warning("Failed to deserialize cached restaurant $id", e)
            null
        }
    }

    suspend fun cacheRestaurants(cacheKey: String, restaurants: List<Restaurant>, ttlMinutes: Int = Config.CACHE_EXPIRATION_MINUTES) {
        try {
            val now = System.currentTimeMillis()
            val entities = restaurants.map { restaurant ->
                CachedRestaurant(
                    id = restaurant.id,
                    jsonData = json.encodeToString(restaurant),
                    cacheKey = cacheKey,
                    cachedAt = now,
                )
            }
            restaurantDao.deleteByKey(cacheKey)
            restaurantDao.insertAll(entities)
            cacheMetadataDao.upsert(
                CacheMetadata(cacheKey = cacheKey, cachedAt = now, ttlMinutes = ttlMinutes, itemCount = restaurants.size)
            )
        } catch (e: Exception) {
            AppLogger.cache.error("Failed to cache restaurants for $cacheKey", e)
        }
    }

    // endregion

    // region Attractions

    suspend fun getCachedAttractions(cacheKey: String, allowStale: Boolean = false): List<Attraction>? {
        val metadata = cacheMetadataDao.get(cacheKey) ?: return null
        if (!allowStale && metadata.isExpired) return null
        return try {
            attractionDao.getAllByKey(cacheKey).map { json.decodeFromString<Attraction>(it.jsonData) }
        } catch (e: Exception) {
            AppLogger.cache.warning("Failed to deserialize cached attractions for $cacheKey", e)
            null
        }
    }

    suspend fun getCachedAttraction(id: String): Attraction? {
        return try {
            attractionDao.getById(id)?.let { json.decodeFromString<Attraction>(it.jsonData) }
        } catch (e: Exception) {
            AppLogger.cache.warning("Failed to deserialize cached attraction $id", e)
            null
        }
    }

    suspend fun cacheAttractions(cacheKey: String, attractions: List<Attraction>, ttlMinutes: Int = Config.CACHE_EXPIRATION_MINUTES) {
        try {
            val now = System.currentTimeMillis()
            val entities = attractions.map { attraction ->
                CachedAttraction(
                    id = attraction.id,
                    jsonData = json.encodeToString(attraction),
                    cacheKey = cacheKey,
                    cachedAt = now,
                )
            }
            attractionDao.deleteByKey(cacheKey)
            attractionDao.insertAll(entities)
            cacheMetadataDao.upsert(
                CacheMetadata(cacheKey = cacheKey, cachedAt = now, ttlMinutes = ttlMinutes, itemCount = attractions.size)
            )
        } catch (e: Exception) {
            AppLogger.cache.error("Failed to cache attractions for $cacheKey", e)
        }
    }

    // endregion

    // region Cache Management

    suspend fun isCacheFresh(cacheKey: String): Boolean {
        val metadata = cacheMetadataDao.get(cacheKey) ?: return false
        return !metadata.isExpired
    }

    suspend fun pruneExpired() {
        try {
            // ONE CUTOFF FOR ALL FOUR TABLES. The metadata used to be pruned on
            // its TTL instead, which is five minutes against a 24-hour retention
            // window - so a key's rows survived and the metadata that addresses
            // them did not, and allowStale could never reach them again.
            val cutoff = System.currentTimeMillis() - PRUNE_AGE_HOURS * 3600_000L
            eventDao.deleteExpired(cutoff)
            restaurantDao.deleteExpired(cutoff)
            attractionDao.deleteExpired(cutoff)
            cacheMetadataDao.deleteOlderThan(cutoff)
            AppLogger.cache.debug("Pruned expired cache entries older than ${PRUNE_AGE_HOURS}h")
        } catch (e: Exception) {
            AppLogger.cache.error("Failed to prune expired cache", e)
        }
    }

    suspend fun clearAll() {
        try {
            eventDao.deleteAll()
            restaurantDao.deleteAll()
            attractionDao.deleteAll()
            cacheMetadataDao.deleteAll()
            AppLogger.cache.debug("Cleared all cache")
        } catch (e: Exception) {
            AppLogger.cache.error("Failed to clear cache", e)
        }
    }

    // endregion

    companion object {
        fun eventsKey(vararg parts: Any?): String =
            "events:" + parts.filterNotNull().joinToString("|")

        fun restaurantsKey(vararg parts: Any?): String =
            "restaurants:" + parts.filterNotNull().joinToString("|")

        fun attractionsKey(vararg parts: Any?): String =
            "attractions:" + parts.filterNotNull().joinToString("|")
    }
}
