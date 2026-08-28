package com.desmoines.aipulse.data.repository

import com.desmoines.aipulse.data.model.Event
import com.desmoines.aipulse.data.model.Restaurant
import com.desmoines.aipulse.data.model.SubscriptionTier

/**
 * Repository interface for favorites operations.
 * Mirrors iOS FavoritesService.swift.
 */
interface FavoritesRepository {

    /**
     * Load all favorite IDs (events + restaurants) for the given user.
     */
    suspend fun loadFavorites(userId: String): Result<FavoritesState>

    /**
     * Toggle an event favorite. Returns true if now favorited, false if removed.
     *
     * [tier] decides the save limit. It is required rather than defaulted: the
     * limit used to be read as `SubscriptionTier.FREE.maxFavorites`
     * unconditionally, which capped paying Insider and VIP subscribers at three
     * saves while the paywall sold them "Unlimited favorites".
     */
    suspend fun toggleEventFavorite(
        userId: String,
        eventId: String,
        currentIds: Set<String>,
        tier: SubscriptionTier,
    ): Result<Boolean>

    /**
     * Toggle a restaurant favorite. Returns true if now favorited, false if removed.
     *
     * See [toggleEventFavorite] for why [tier] is a required parameter.
     */
    suspend fun toggleRestaurantFavorite(
        userId: String,
        restaurantId: String,
        currentIds: Set<String>,
        tier: SubscriptionTier,
    ): Result<Boolean>

    /**
     * Fetch full Event objects for all favorited event IDs.
     */
    suspend fun fetchFavoriteEvents(eventIds: Set<String>): Result<List<Event>>

    /**
     * Fetch full Restaurant objects for all favorited restaurant IDs.
     */
    suspend fun fetchFavoriteRestaurants(restaurantIds: Set<String>): Result<List<Restaurant>>

    /**
     * Check if an event is favorited.
     */
    fun isEventFavorited(eventId: String): Boolean

    /**
     * Check if a restaurant is favorited.
     */
    fun isRestaurantFavorited(restaurantId: String): Boolean

    /**
     * Drops every trace of the signed-in user's favorites held on this device:
     * the in-memory id caches and the local restaurant-favorites fallback.
     *
     * Both survived sign-out before, so the next account to sign in on the
     * device inherited the previous account's saves until a fresh
     * [loadFavorites] happened to overwrite them, and the local restaurant
     * fallback was never overwritten at all.
     */
    fun clearLocalState()
}

/**
 * Holds the current set of favorite IDs for events and restaurants.
 */
data class FavoritesState(
    val favoriteEventIds: Set<String> = emptySet(),
    val favoriteRestaurantIds: Set<String> = emptySet(),
)
