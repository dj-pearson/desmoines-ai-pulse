package com.desmoines.aipulse.data.model

import androidx.compose.runtime.Immutable
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/**
 * A single curated "Surprise Me" pick. Decoded from the get_surprise_pick RPC
 * (snake_case row). Mirrors iOS SurpriseMeService.Pick.
 */
@Immutable
@Serializable
data class SurprisePick(
    @SerialName("item_type") val itemType: String,
    @SerialName("item_id") val itemId: String,
    val title: String? = null,
    val description: String? = null,
    @SerialName("image_url") val imageUrl: String? = null,
    val reason: String = "",
    @SerialName("reason_template") val reasonTemplate: String? = null,
) {
    val isEvent: Boolean get() = itemType == "event"
}
