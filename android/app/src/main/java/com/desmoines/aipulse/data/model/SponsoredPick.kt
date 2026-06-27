package com.desmoines.aipulse.data.model

import androidx.compose.runtime.Immutable
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/**
 * A clearly-labeled sponsored listing surfaced in an AI flow, from the
 * `get-sponsored-pick` edge function. Mirrors iOS SponsoredPick.
 */
@Immutable
@Serializable
data class SponsoredPick(
    val itemType: String,
    val itemId: String,
    val title: String = "",
    val reason: String = "",
    val imageUrl: String? = null,
    val campaignId: String = "",
) {
    val isEvent: Boolean get() = itemType == "event"
    val isRenderable: Boolean get() = title.isNotBlank() && itemId.isNotBlank()
}

/** Envelope for the edge function response (`{ pick: ... | null }`). */
@Serializable
data class SponsoredPickResponse(
    val pick: SponsoredPick? = null,
)
