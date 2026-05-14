package com.desmoines.aipulse.data.remote

import android.util.Log
import com.desmoines.aipulse.data.model.Event
import com.desmoines.aipulse.data.model.Restaurant
import com.desmoines.aipulse.data.model.UserEventInteraction
import com.desmoines.aipulse.data.model.UserRestaurantInteraction
import io.github.jan.supabase.SupabaseClient
import io.github.jan.supabase.postgrest.from
import io.github.jan.supabase.postgrest.query.Order
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import javax.inject.Inject
import javax.inject.Singleton

private const val TAG = "FavoritesRemoteDataSource"

/**
 * Remote data source for favorites operations.
 * Mirrors iOS FavoritesService.swift — uses user_event_interactions and user_restaurant_interactions tables.
 */
@Singleton
class FavoritesRemoteDataSource @Inject constructor(
    private val supabaseClient: SupabaseClient?,
) {

    private fun db(): SupabaseClient =
        supabaseClient ?: throw FavoritesException.NotConfigured

    // ================================================================
    // Event Favorites
    // ================================================================

    /**
     * Load all favorited event IDs for a user.
     */
    suspend fun loadEventFavoriteIds(userId: String): Set<String> {
        @Serializable
        data class FavoriteRow(@SerialName("event_id") val eventId: String)

        val rows = db().from("user_event_interactions")
            .select {
                filter {
                    eq("user_id", userId)
                    eq("interaction_type", "favorite")
                }
            }
            .decodeList<FavoriteRow>()

        return rows.map { it.eventId }.toSet()
    }

    /**
     * Add an event favorite.
     */
    suspend fun addEventFavorite(userId: String, eventId: String) {
        db().from("user_event_interactions")
            .insert(
                UserEventInteraction(
                    userId = userId,
                    eventId = eventId,
                    interactionType = "favorite",
                )
            )
    }

    /**
     * Remove an event favorite.
     */
    suspend fun removeEventFavorite(userId: String, eventId: String) {
        db().from("user_event_interactions")
            .delete {
                filter {
                    eq("user_id", userId)
                    eq("event_id", eventId)
                    eq("interaction_type", "favorite")
                }
            }
    }

    /**
     * Fetch full Event objects for a set of event IDs, ordered by date ascending.
     */
    suspend fun fetchFavoriteEvents(eventIds: Set<String>): List<Event> {
        if (eventIds.isEmpty()) return emptyList()
        return db().from("events")
            .select {
                filter {
                    isIn("id", eventIds.toList())
                }
                order("date", Order.ASCENDING)
            }
            .decodeList()
    }

    // ================================================================
    // Restaurant Favorites
    // ================================================================

    /**
     * Load all favorited restaurant IDs for a user.
     */
    suspend fun loadRestaurantFavoriteIds(userId: String): Set<String> {
        @Serializable
        data class FavoriteRow(@SerialName("restaurant_id") val restaurantId: String)

        val rows = db().from("user_restaurant_interactions")
            .select {
                filter {
                    eq("user_id", userId)
                    eq("interaction_type", "favorite")
                }
            }
            .decodeList<FavoriteRow>()

        return rows.map { it.restaurantId }.toSet()
    }

    /**
     * Add a restaurant favorite.
     */
    suspend fun addRestaurantFavorite(userId: String, restaurantId: String) {
        db().from("user_restaurant_interactions")
            .insert(
                UserRestaurantInteraction(
                    userId = userId,
                    restaurantId = restaurantId,
                    interactionType = "favorite",
                )
            )
    }

    /**
     * Remove a restaurant favorite.
     */
    suspend fun removeRestaurantFavorite(userId: String, restaurantId: String) {
        db().from("user_restaurant_interactions")
            .delete {
                filter {
                    eq("user_id", userId)
                    eq("restaurant_id", restaurantId)
                    eq("interaction_type", "favorite")
                }
            }
    }

    /**
     * Fetch full Restaurant objects for a set of restaurant IDs, ordered by name ascending.
     */
    suspend fun fetchFavoriteRestaurants(restaurantIds: Set<String>): List<Restaurant> {
        if (restaurantIds.isEmpty()) return emptyList()
        return db().from("restaurants")
            .select {
                filter {
                    isIn("id", restaurantIds.toList())
                }
                order("name", Order.ASCENDING)
            }
            .decodeList()
    }
}

/**
 * Errors specific to favorites operations.
 * Mirrors iOS FavoritesService.FavoritesError.
 */
sealed class FavoritesException(message: String) : Exception(message) {
    data object NotConfigured : FavoritesException("Supabase is not configured.")
    data object NotAuthenticated : FavoritesException("Please sign in to save favorites.")
    data class LimitReached(val max: Int) :
        FavoritesException("You've reached the limit of $max favorites. Upgrade to Insider for unlimited saves.")
}
