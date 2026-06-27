package com.desmoines.aipulse.data.model

import androidx.compose.runtime.Immutable
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/** A user's vote in a Best Of category (`votes` table). Mirrors iOS Vote. */
@Immutable
@Serializable
data class Vote(
    val id: String,
    @SerialName("category_id") val categoryId: String,
    @SerialName("entity_type") val entityType: String,
    @SerialName("entity_id") val entityId: String? = null,
    @SerialName("custom_entry") val customEntry: String? = null,
    @SerialName("user_id") val userId: String,
    @SerialName("created_at") val createdAt: String? = null,
) {
    val isCustom: Boolean get() = entityType == "custom"
}

/**
 * A searchable nominee (restaurant or attraction) the user can vote for in a
 * Best Of category. A pure UI model assembled from the content tables.
 */
@Immutable
data class Nominee(
    val id: String,
    val name: String,
    val imageUrl: String?,
    /** "restaurant" or "attraction". */
    val entityType: String,
) {
    val typeLabel: String
        get() = when (entityType) {
            "restaurant" -> "Restaurant"
            "attraction" -> "Attraction"
            "event" -> "Event"
            else -> entityType.replaceFirstChar { it.uppercase() }
        }
}

/**
 * An aggregated standing in a category leaderboard. [key] uniquely identifies a
 * nominee (the entity id, or a "custom:" key for write-ins) so optimistic
 * updates can target a row.
 */
@Immutable
data class LeaderboardEntry(
    val key: String,
    val entityType: String,
    val entityId: String?,
    val customEntry: String?,
    val name: String,
    val imageUrl: String?,
    val voteCount: Int,
) {
    /** Vote share of [total], clamped to 0..1 for safe bar widths (iOS audit fix). */
    fun fraction(total: Int): Float =
        if (total <= 0) 0f else (voteCount.toFloat() / total).coerceIn(0f, 1f)

    /** Whole-percent share for the row label. */
    fun percent(total: Int): Int = (fraction(total) * 100).toInt()
}

