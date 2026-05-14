package com.desmoines.aipulse.data.repository

import com.desmoines.aipulse.data.model.Event
import com.desmoines.aipulse.data.model.Restaurant

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
     */
    suspend fun toggleEventFavorite(userId: String, eventId: String, currentIds: Set<String>): Result<Boolean>

    /**
     * Toggle a restaurant favorite. Returns true if now favorited, false if removed.
     */
    suspend fun toggleRestaurantFavorite(userId: String, restaurantId: String, currentIds: Set<String>): Result<Boolean>

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
}

/**
 * Holds the current set of favorite IDs for events and restaurants.
 */
data class FavoritesState(
    val favoriteEventIds: Set<String> = emptySet(),
    val favoriteRestaurantIds: Set<String> = emptySet(),
)
