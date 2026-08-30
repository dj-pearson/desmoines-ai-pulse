package com.desmoines.aipulse.data.model

import androidx.compose.runtime.Immutable
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/**
 * A single event recommendation row returned by the `get_personalized_recommendations`
 * / `get_trending_events` RPCs. Mirrors iOS ForYouService recommendation shape.
 * All fields but [id] are optional so a sparse RPC row never fails to decode.
 */
@Immutable
@Serializable
data class Recommendation(
    val id: String,
    val title: String? = null,
    val date: String? = null,
    val category: String? = null,
    @SerialName("image_url") val imageUrl: String? = null,
    val venue: String? = null,
    @SerialName("recommendation_reason") val recommendationReason: String? = null,
    @SerialName("recommendation_score") val recommendationScore: Double? = null,
    @SerialName("is_featured") val isFeatured: Boolean? = null,
)
