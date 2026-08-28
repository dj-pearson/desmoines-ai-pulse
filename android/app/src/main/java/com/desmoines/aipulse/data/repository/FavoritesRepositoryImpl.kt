package com.desmoines.aipulse.data.repository

import android.content.Context
import android.util.Log
import com.desmoines.aipulse.data.model.Event
import com.desmoines.aipulse.data.model.Restaurant
import com.desmoines.aipulse.data.model.SubscriptionTier
import com.desmoines.aipulse.data.remote.FavoritesException
import com.desmoines.aipulse.data.remote.FavoritesRemoteDataSource
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import java.util.concurrent.ConcurrentHashMap
import javax.inject.Inject
import javax.inject.Singleton

private const val TAG = "FavoritesRepository"
private const val LOCAL_RESTAURANT_PREFS = "restaurant_favorites_prefs"
private const val LOCAL_RESTAURANT_KEY = "localRestaurantFavorites"

/**
 * Repository implementation for favorites.
 * Mirrors iOS FavoritesService.swift with:
 * - Remote Supabase queries for event & restaurant favorites
 * - Local SharedPreferences fallback for restaurant favorites (table may not exist)
 * - Free tier limit enforcement (3 favorites max)
 */
@Singleton
class FavoritesRepositoryImpl @Inject constructor(
    private val remoteDataSource: FavoritesRemoteDataSource,
    @param:ApplicationContext private val context: Context,
) : FavoritesRepository {

    // In-memory cache of favorite IDs. Mutated only under the matching per-item
    // Mutex so a toggle's local-cache write + remote call stay atomic (ANDP-060).
    @Volatile private var _favoriteEventIds: Set<String> = emptySet()
    @Volatile private var _favoriteRestaurantIds: Set<String> = emptySet()

    // One Mutex per favorited id serializes rapid taps on that id so they can't
    // interleave into a duplicate remote write or a desynced cache.
    private val eventMutexes = ConcurrentHashMap<String, Mutex>()
    private val restaurantMutexes = ConcurrentHashMap<String, Mutex>()

    private fun eventMutex(id: String): Mutex = eventMutexes.getOrPut(id) { Mutex() }
    private fun restaurantMutex(id: String): Mutex = restaurantMutexes.getOrPut(id) { Mutex() }

    override suspend fun loadFavorites(userId: String): Result<FavoritesState> = runCatching {
        // Load event favorites
        _favoriteEventIds = try {
            remoteDataSource.loadEventFavoriteIds(userId)
        } catch (e: Exception) {
            Log.w(TAG, "Failed to load event favorites", e)
            emptySet()
        }

        // Load restaurant favorites (with local fallback)
        _favoriteRestaurantIds = try {
            remoteDataSource.loadRestaurantFavoriteIds(userId)
        } catch (e: Exception) {
            Log.w(TAG, "Failed to load restaurant favorites from remote, using local fallback", e)
            loadLocalRestaurantFavorites()
        }

        FavoritesState(
            favoriteEventIds = _favoriteEventIds,
            favoriteRestaurantIds = _favoriteRestaurantIds,
        )
    }.onFailure { Log.e(TAG, "Failed to load favorites", it) }

    override suspend fun toggleEventFavorite(
        userId: String,
        eventId: String,
        currentIds: Set<String>,
        tier: SubscriptionTier,
    ): Result<Boolean> = runCatching {
        eventMutex(eventId).withLock {
            // The caller's snapshot decides the intended direction; the authoritative
            // in-memory set decides whether that work is still needed. Rapid duplicate
            // taps therefore collapse to a single effective remote write.
            val wantFavorite = !currentIds.contains(eventId)
            val isFavorite = eventId in _favoriteEventIds
            if (wantFavorite == isFavorite) return@withLock wantFavorite

            if (wantFavorite) {
                val totalFavorites = _favoriteEventIds.size + _favoriteRestaurantIds.size
                val maxFavorites = tier.maxFavorites
                if (maxFavorites > 0 && totalFavorites >= maxFavorites) {
                    throw FavoritesException.LimitReached(maxFavorites)
                }
                // Optimistic local update, rolled back if the remote write fails.
                _favoriteEventIds = _favoriteEventIds + eventId
                runCatching { remoteDataSource.addEventFavorite(userId, eventId) }
                    .onFailure { _favoriteEventIds = _favoriteEventIds - eventId; throw it }
                true
            } else {
                _favoriteEventIds = _favoriteEventIds - eventId
                runCatching { remoteDataSource.removeEventFavorite(userId, eventId) }
                    .onFailure { _favoriteEventIds = _favoriteEventIds + eventId; throw it }
                false
            }
        }
    }.onFailure { Log.e(TAG, "Failed to toggle event favorite", it) }

    override suspend fun toggleRestaurantFavorite(
        userId: String,
        restaurantId: String,
        currentIds: Set<String>,
        tier: SubscriptionTier,
    ): Result<Boolean> = runCatching {
        restaurantMutex(restaurantId).withLock {
            val wantFavorite = !currentIds.contains(restaurantId)
            val isFavorite = restaurantId in _favoriteRestaurantIds
            if (wantFavorite == isFavorite) return@withLock wantFavorite

            if (wantFavorite) {
                val totalFavorites = _favoriteEventIds.size + _favoriteRestaurantIds.size
                val maxFavorites = tier.maxFavorites
                if (maxFavorites > 0 && totalFavorites >= maxFavorites) {
                    throw FavoritesException.LimitReached(maxFavorites)
                }
                _favoriteRestaurantIds = _favoriteRestaurantIds + restaurantId
                // Remote table may not exist — fall back to local prefs, keeping the optimistic add.
                try {
                    remoteDataSource.addRestaurantFavorite(userId, restaurantId)
                } catch (e: Exception) {
                    saveLocalRestaurantFavorite(restaurantId, add = true)
                }
                true
            } else {
                _favoriteRestaurantIds = _favoriteRestaurantIds - restaurantId
                try {
                    remoteDataSource.removeRestaurantFavorite(userId, restaurantId)
                } catch (e: Exception) {
                    saveLocalRestaurantFavorite(restaurantId, add = false)
                }
                false
            }
        }
    }.onFailure { Log.e(TAG, "Failed to toggle restaurant favorite", it) }

    override suspend fun fetchFavoriteEvents(eventIds: Set<String>): Result<List<Event>> =
        runCatching { remoteDataSource.fetchFavoriteEvents(eventIds) }
            .onFailure { Log.e(TAG, "Failed to fetch favorite events", it) }

    override suspend fun fetchFavoriteRestaurants(restaurantIds: Set<String>): Result<List<Restaurant>> =
        runCatching { remoteDataSource.fetchFavoriteRestaurants(restaurantIds) }
            .onFailure { Log.e(TAG, "Failed to fetch favorite restaurants", it) }

    override fun isEventFavorited(eventId: String): Boolean = eventId in _favoriteEventIds

    override fun isRestaurantFavorited(restaurantId: String): Boolean = restaurantId in _favoriteRestaurantIds

    override fun clearLocalState() {
        _favoriteEventIds = emptySet()
        _favoriteRestaurantIds = emptySet()
        eventMutexes.clear()
        restaurantMutexes.clear()
        getPrefs().edit().remove(LOCAL_RESTAURANT_KEY).apply()
    }

    // ================================================================
    // Local Storage Fallback (Restaurant Favorites)
    // Mirrors iOS FavoritesService local storage fallback
    // ================================================================

    private fun getPrefs() =
        context.getSharedPreferences(LOCAL_RESTAURANT_PREFS, Context.MODE_PRIVATE)

    private fun loadLocalRestaurantFavorites(): Set<String> =
        getPrefs().getStringSet(LOCAL_RESTAURANT_KEY, emptySet()) ?: emptySet()

    private fun saveLocalRestaurantFavorite(id: String, add: Boolean) {
        val favorites = loadLocalRestaurantFavorites().toMutableSet()
        if (add) favorites.add(id) else favorites.remove(id)
        getPrefs().edit().putStringSet(LOCAL_RESTAURANT_KEY, favorites).apply()
    }
}
