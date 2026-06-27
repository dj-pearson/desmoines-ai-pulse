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
