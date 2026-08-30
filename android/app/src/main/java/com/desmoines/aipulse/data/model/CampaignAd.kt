package com.desmoines.aipulse.data.model

import androidx.compose.runtime.Immutable
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/**
 * A first-party campaign ad creative from `get_active_ads`. Mirrors iOS
 * CampaignAd. All display fields are optional — a creative with no image still
 * renders as a text card; one with nothing useful is treated as absent.
 */
@Immutable
@Serializable
data class CampaignAd(
    @SerialName("campaign_id") val campaignId: String,
    @SerialName("creative_id") val creativeId: String,
    val title: String? = null,
    val description: String? = null,
    @SerialName("image_url") val imageUrl: String? = null,
    @SerialName("link_url") val linkUrl: String? = null,
    @SerialName("cta_text") val ctaText: String? = null,
) {
    val displayTitle: String? get() = title?.trim()?.takeIf { it.isNotEmpty() }
    val displayCta: String get() = ctaText?.trim()?.takeIf { it.isNotEmpty() } ?: "Learn more"

    /** Renderable when there's at least a title or an image to show. */
    val isRenderable: Boolean get() = displayTitle != null || !imageUrl.isNullOrBlank()
}
