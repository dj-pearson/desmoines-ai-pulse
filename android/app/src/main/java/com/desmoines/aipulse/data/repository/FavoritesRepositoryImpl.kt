package com.desmoines.aipulse.data.repository

import android.content.Context
import android.util.Log
import com.desmoines.aipulse.data.model.Event
import com.desmoines.aipulse.data.model.Restaurant
import com.desmoines.aipulse.data.model.SubscriptionTier
import com.desmoines.aipulse.data.remote.FavoritesException
import com.desmoines.aipulse.data.remote.FavoritesRemoteDataSource
import dagger.hilt.android.qualifiers.ApplicationContext
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

    // In-memory cache of favorite IDs
    private var _favoriteEventIds: Set<String> = emptySet()
    private var _favoriteRestaurantIds: Set<String> = emptySet()

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
    ): Result<Boolean> = runCatching {
        if (currentIds.contains(eventId)) {
            // Remove
            remoteDataSource.removeEventFavorite(userId, eventId)
            _favoriteEventIds = _favoriteEventIds - eventId
            false
        } else {
            // Add — check limit
            val totalFavorites = currentIds.size + _favoriteRestaurantIds.size
            val maxFavorites = SubscriptionTier.FREE.maxFavorites
            if (maxFavorites > 0 && totalFavorites >= maxFavorites) {
                throw FavoritesException.LimitReached(maxFavorites)
            }
            remoteDataSource.addEventFavorite(userId, eventId)
            _favoriteEventIds = _favoriteEventIds + eventId
            true
        }
    }.onFailure { Log.e(TAG, "Failed to toggle event favorite", it) }

    override suspend fun toggleRestaurantFavorite(
        userId: String,
        restaurantId: String,
        currentIds: Set<String>,
    ): Result<Boolean> = runCatching {
        if (currentIds.contains(restaurantId)) {
            // Remove
            try {
                remoteDataSource.removeRestaurantFavorite(userId, restaurantId)
            } catch (e: Exception) {
                saveLocalRestaurantFavorite(restaurantId, add = false)
            }
            _favoriteRestaurantIds = _favoriteRestaurantIds - restaurantId
            false
        } else {
            // Add — check limit
            val totalFavorites = _favoriteEventIds.size + currentIds.size
            val maxFavorites = SubscriptionTier.FREE.maxFavorites
            if (maxFavorites > 0 && totalFavorites >= maxFavorites) {
                throw FavoritesException.LimitReached(maxFavorites)
            }
            try {
                remoteDataSource.addRestaurantFavorite(userId, restaurantId)
            } catch (e: Exception) {
                saveLocalRestaurantFavorite(restaurantId, add = true)
            }
            _favoriteRestaurantIds = _favoriteRestaurantIds + restaurantId
            true
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
