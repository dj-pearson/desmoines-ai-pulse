package com.desmoines.aipulse.data.model

import android.net.Uri
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import java.util.Locale

/**
 * Attraction data model matching the Supabase `attractions` table.
 * Mirrors iOS Attraction.swift.
 */
@Serializable
data class Attraction(
    val id: String,
    val name: String,
    val type: String,
    val location: String? = null,
    val description: String? = null,
    val rating: Double? = null,
    val website: String? = null,
    @SerialName("image_url") val imageUrl: String? = null,
    @SerialName("is_featured") val isFeatured: Boolean? = null,
    val latitude: Double? = null,
    val longitude: Double? = null,
    @SerialName("created_at") val createdAt: String? = null,
    @SerialName("updated_at") val updatedAt: String? = null,
) {

    /** Parsed AttractionType from the type string. */
    val attractionType: AttractionType
        get() = AttractionType.from(type)

    val coordinate: LatLng?
        get() {
            val lat = latitude ?: return null
            val lng = longitude ?: return null
            if (lat == 0.0 && lng == 0.0) return null
            return LatLng(lat, lng)
        }

    val websiteUri: Uri?
        get() {
            if (website.isNullOrEmpty()) return null
            val url = if (website.startsWith("http")) website else "https://$website"
            return Uri.parse(url)
        }

    val ratingText: String
        get() = rating?.let { String.format(Locale.US, "%.1f", it) } ?: "No rating"

    companion object {
        val preview = Attraction(
            id = "preview-1",
            name = "Pappajohn Sculpture Park",
            type = "Park",
            location = "1330 Grand Ave, Des Moines",
            description = "A 4.4-acre park featuring 30+ world-renowned sculptures by internationally acclaimed artists.",
            rating = 4.8,
            website = "https://desmoinesartcenter.org",
            isFeatured = true,
            latitude = 41.5862,
            longitude = -93.6354,
        )
    }
}
