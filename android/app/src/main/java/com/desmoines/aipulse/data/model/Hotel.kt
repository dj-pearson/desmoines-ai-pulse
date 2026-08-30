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
    val city: String? = null,
    val state: String? = null,
    val zip: String? = null,
    val area: String? = null,
    val latitude: Double? = null,
    val longitude: Double? = null,
    val phone: String? = null,
    val website: String? = null,
    @SerialName("affiliate_url") val affiliateUrl: String? = null,
    @SerialName("affiliate_provider") val affiliateProvider: String? = null,
    @SerialName("image_url") val imageUrl: String? = null,
    @SerialName("gallery_urls") val galleryUrls: List<String>? = null,
    @SerialName("star_rating") val starRating: Double? = null,
    @SerialName("price_range") val priceRange: String? = null,
    @SerialName("avg_nightly_rate") val avgNightlyRate: Int? = null,
    val amenities: List<String>? = null,
    @SerialName("hotel_type") val hotelType: String? = null,
    @SerialName("chain_name") val chainName: String? = null,
    @SerialName("brand_parent") val brandParent: String? = null,
    @SerialName("total_rooms") val totalRooms: Int? = null,
    @SerialName("check_in_time") val checkInTime: String? = null,
    @SerialName("check_out_time") val checkOutTime: String? = null,
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

    /** Cleaned amenity list for the detail screen. */
    val displayAmenities: List<String>
        get() = amenities.orEmpty().mapNotNull { it.trim().takeIf { a -> a.isNotEmpty() } }

    /**
     * Affiliate booking link, falling back to the hotel's own website — mirrors
     * the web HotelCard (`affiliate_url || website`). Null when neither exists.
     */
    val bookingUrl: String?
        get() = affiliateUrl?.trim()?.takeIf { it.isNotEmpty() }
            ?: website?.trim()?.takeIf { it.isNotEmpty() }

    /** True when the booking CTA points at a tracked affiliate link (not the bare site). */
    val isAffiliateBooking: Boolean
        get() = !affiliateUrl?.trim().isNullOrEmpty()

    /** "Book on Expedia" / "Book Now" depending on whether a provider is known. */
    val bookCtaLabel: String
        get() = affiliateProvider?.trim()?.takeIf { it.isNotEmpty() && isAffiliateBooking }
            ?.let { "Book on $it" } ?: "Book Now"

    /** "From $129/night", or null when no rate is published. */
    val nightlyRateLabel: String?
        get() = avgNightlyRate?.takeIf { it > 0 }?.let { "From $$it/night" }

    /** "Hampton Inn by Hilton" style brand line, or null. */
    val brandLine: String?
        get() {
            val chain = chainName?.trim()?.takeIf { it.isNotEmpty() }
            val parent = brandParent?.trim()?.takeIf { it.isNotEmpty() }
            return when {
                chain != null && parent != null && !chain.equals(parent, ignoreCase = true) -> "$chain by $parent"
                chain != null -> chain
                else -> parent
            }
        }

    /** "123 Main St, Des Moines, IA 50309" assembled from address parts. */
    val fullAddress: String
        get() {
            val cityState = listOfNotNull(
                city?.trim()?.takeIf { it.isNotEmpty() },
                state?.trim()?.takeIf { it.isNotEmpty() },
            ).joinToString(", ")
            val tail = listOfNotNull(
                cityState.takeIf { it.isNotEmpty() },
                zip?.trim()?.takeIf { it.isNotEmpty() },
            ).joinToString(" ")
            return listOfNotNull(
                address.trim().takeIf { it.isNotEmpty() },
                tail.takeIf { it.isNotEmpty() },
            ).joinToString(", ")
        }

    /** True when the hotel has usable map coordinates. */
    val hasCoordinates: Boolean get() = latitude != null && longitude != null
}
