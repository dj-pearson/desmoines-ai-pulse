package com.desmoines.aipulse.data.model

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/**
 * User profile data model matching the Supabase `profiles` table.
 * Mirrors iOS UserProfile.swift.
 */
@Serializable
data class UserProfile(
    val id: String,
    @SerialName("user_id") val userId: String,
    @SerialName("first_name") val firstName: String? = null,
    @SerialName("last_name") val lastName: String? = null,
    val email: String? = null,
    val phone: String? = null,
    val location: String? = null,
    val interests: List<String>? = null,
    @SerialName("user_role") val userRole: String? = null,
    @SerialName("created_at") val createdAt: String,
    @SerialName("updated_at") val updatedAt: String,
) {

    val displayName: String
        get() {
            val parts = listOfNotNull(firstName, lastName).filter { it.isNotEmpty() }
            return if (parts.isEmpty()) email ?: "User" else parts.joinToString(" ")
        }

    val initials: String
        get() {
            val first = firstName?.firstOrNull()?.uppercase() ?: ""
            val last = lastName?.firstOrNull()?.uppercase() ?: ""
            val result = "$first$last"
            return result.ifEmpty { "?" }
        }

    val role: UserRole
        get() = UserRole.from(userRole)

    companion object {
        val preview = UserProfile(
            id = "preview-1",
            userId = "user-1",
            firstName = "Jordan",
            lastName = "Smith",
            email = "jordan@example.com",
            phone = "(515) 555-0100",
            location = "Des Moines",
            interests = listOf("Food", "Music", "Outdoor"),
            userRole = "user",
            createdAt = "2026-01-01T00:00:00Z",
            updatedAt = "2026-01-01T00:00:00Z",
        )
    }
}

/**
 * User event interaction (favorites/likes).
 * Mirrors iOS UserEventInteraction.
 */
@Serializable
data class UserEventInteraction(
    val id: String? = null,
    @SerialName("user_id") val userId: String,
    @SerialName("event_id") val eventId: String,
    @SerialName("interaction_type") val interactionType: String,
    @SerialName("created_at") val createdAt: String? = null,
)

/**
 * User restaurant interaction (favorites/likes).
 * Mirrors iOS pattern for restaurant favorites.
 */
@Serializable
data class UserRestaurantInteraction(
    val id: String? = null,
    @SerialName("user_id") val userId: String,
    @SerialName("restaurant_id") val restaurantId: String,
    @SerialName("interaction_type") val interactionType: String,
    @SerialName("created_at") val createdAt: String? = null,
)

/**
 * User rating/review for events, restaurants, or attractions.
 * Mirrors iOS UserRating.
 */
@Serializable
data class UserRating(
    val id: String? = null,
    @SerialName("user_id") val userId: String,
    @SerialName("content_id") val contentId: String,
    @SerialName("content_type") val contentType: String,
    val rating: String,
    @SerialName("review_text") val reviewText: String? = null,
    @SerialName("created_at") val createdAt: String? = null,
)
