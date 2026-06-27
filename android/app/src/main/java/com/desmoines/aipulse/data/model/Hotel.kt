package com.desmoines.aipulse.data.model

import androidx.compose.runtime.Immutable
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/**
 * A hotel / place to stay from the `hotels` table (web useHotels parity).
 * Mirrors iOS Hotel, with display helpers for cards and detail rows.
 */
@Immutable
@Serializable
data class Hotel(
    val id: String,
    val name: String,
    val description: String? = null,
    @SerialName("short_description") val shortDescription: String? = null,
    val address: String = "",
    val area: String? = null,
    val latitude: Double? = null,
    val longitude: Double? = null,
    @SerialName("image_url") val imageUrl: String? = null,
    @SerialName("star_rating") val starRating: Double? = null,
    @SerialName("price_range") val priceRange: String? = null,
    val amenities: List<String>? = null,
    @SerialName("chain_name") val chainName: String? = null,
    @SerialName("is_featured") val isFeatured: Boolean? = null,
    @SerialName("is_active") val isActive: Boolean? = null,
    @SerialName("sort_order") val sortOrder: Int? = null,
) {
    val isSponsored: Boolean get() = isFeatured == true

    /** Short blurb for cards: prefers the short description. */
    val displaySummary: String
        get() = shortDescription?.takeIf { it.isNotBlank() }
            ?: description?.takeIf { it.isNotBlank() }
            ?: ""

    /** Star rating formatted ("4" or "4.5"), or null when unrated. */
    val ratingLabel: String?
        get() = starRating?.let { r ->
            if (r % 1.0 == 0.0) "%.0f".format(r) else "%.1f".format(r)
        }

    /** Price tier as-is ("$$"), or null. */
    val priceLabel: String? get() = priceRange?.trim()?.takeIf { it.isNotEmpty() }

    /** "Downtown · Marriott" style subtitle, omitting blanks. */
    val locationLine: String
        get() = listOfNotNull(
            area?.takeIf { it.isNotBlank() },
            chainName?.takeIf { it.isNotBlank() },
        ).joinToString(" · ")

    /** First few amenities for a chip row. */
    fun amenityPreview(limit: Int = 3): List<String> =
        amenities.orEmpty().mapNotNull { it.trim().takeIf { a -> a.isNotEmpty() } }.take(limit)
}
