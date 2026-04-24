package com.desmoines.aipulse.data.model

import androidx.compose.runtime.Immutable
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import java.time.LocalDate
import java.time.OffsetDateTime
import java.time.format.DateTimeFormatter
import java.time.format.DateTimeParseException
import java.time.temporal.ChronoUnit

/**
 * Event data model matching the Supabase `events` table.
 * Mirrors iOS Event.swift.
 */
@Immutable
@Serializable
data class Event(
    val id: String,
    val title: String,
    val date: String,
    val location: String? = null,
    val venue: String? = null,
    val city: String? = null,
    val category: String? = null,
    val price: String? = null,
    val description: String? = null,
    @SerialName("enhanced_description") val enhancedDescription: String? = null,
    @SerialName("original_description") val originalDescription: String? = null,
    @SerialName("image_url") val imageUrl: String? = null,
    @SerialName("source_url") val sourceUrl: String? = null,
    @SerialName("is_featured") val isFeatured: Boolean? = null,
    @SerialName("is_enhanced") val isEnhanced: Boolean? = null,
    val latitude: Double? = null,
    val longitude: Double? = null,
    @SerialName("ai_writeup") val aiWriteup: String? = null,
    @SerialName("event_start_utc") val eventStartUtc: String? = null,
    @SerialName("event_start_local") val eventStartLocal: String? = null,
    @SerialName("event_timezone") val eventTimezone: String? = null,
    @SerialName("is_recurring") val isRecurring: Boolean? = null,
    @SerialName("seo_title") val seoTitle: String? = null,
    @SerialName("seo_description") val seoDescription: String? = null,
    @SerialName("seo_keywords") val seoKeywords: List<String>? = null,
    @SerialName("created_at") val createdAt: String? = null,
    @SerialName("updated_at") val updatedAt: String? = null,
) {

    // region Computed Properties

    /** Parsed EventCategory from the category string. */
    val eventCategory: EventCategory
        get() = EventCategory.from(category)

    /**
     * Parse the date string into an OffsetDateTime.
     * Tries ISO 8601 with fractional seconds, then without, then common formats.
     */
    val parsedDate: OffsetDateTime?
        get() {
            val formats = listOf(
                DateTimeFormatter.ISO_OFFSET_DATE_TIME,
                DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm:ss"),
                DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss"),
                DateTimeFormatter.ofPattern("yyyy-MM-dd"),
            )
            for (fmt in formats) {
                try {
                    return OffsetDateTime.parse(date, fmt)
                } catch (_: DateTimeParseException) {
                    // Try next format
                }
            }
            // For date-only or datetime-without-offset formats, parse as LocalDate/LocalDateTime
            try {
                val ld = LocalDate.parse(date, DateTimeFormatter.ofPattern("yyyy-MM-dd"))
                return ld.atStartOfDay().atOffset(java.time.ZoneOffset.UTC)
            } catch (_: DateTimeParseException) {
                // ignore
            }
            try {
                val ldt = java.time.LocalDateTime.parse(date, DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm:ss"))
                return ldt.atOffset(java.time.ZoneOffset.UTC)
            } catch (_: DateTimeParseException) {
                // ignore
            }
            try {
                val ldt = java.time.LocalDateTime.parse(date, DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss"))
                return ldt.atOffset(java.time.ZoneOffset.UTC)
            } catch (_: DateTimeParseException) {
                // ignore
            }
            return null
        }

    /** LatLng coordinate from latitude/longitude, or null if unavailable/zero. */
    val coordinate: LatLng?
        get() {
            val lat = latitude ?: return null
            val lng = longitude ?: return null
            if (lat == 0.0 && lng == 0.0) return null
            return LatLng(lat, lng)
        }

    /** Whether the event is free (price is "Free", "$0", "0", or empty). */
    val isFree: Boolean
        get() {
            val p = price?.lowercase()?.trim() ?: return false
            return p == "free" || p == "\$0" || p == "0" || p.isEmpty()
        }

    /** Best available description: enhanced > aiWriteup > original > description. */
    val displayDescription: String
        get() = enhancedDescription ?: aiWriteup ?: originalDescription ?: description ?: ""

    /** Display-friendly location combining venue and city. */
    val displayLocation: String
        get() {
            val parts = listOfNotNull(venue, city).filter { it.isNotEmpty() }
            return if (parts.isEmpty()) location ?: "Des Moines" else parts.joinToString(", ")
        }

    /**
     * Urgency label: "Today", "Tomorrow", or "In X days" (up to 7 days).
     * Returns null if date is unparseable or too far out.
     */
    val urgencyLabel: String?
        get() {
            val eventDate = parsedDate?.toLocalDate() ?: return null
            val today = LocalDate.now()
            val days = ChronoUnit.DAYS.between(today, eventDate)
            return when {
                days == 0L -> "Today"
                days == 1L -> "Tomorrow"
                days in 2..7 -> "In $days days"
                else -> null
            }
        }

    /** Full accessibility label for a featured card (title, category, date, price). */
    val featuredCardAccessibilityLabel: String
        get() {
            val parts = mutableListOf(title, eventCategory.displayName)
            parsedDate?.let {
                parts.add(it.format(DateTimeFormatter.ofPattern("EEEE, MMMM d")))
            }
            if (isFree) {
                parts.add("Free event")
            } else if (!price.isNullOrEmpty()) {
                parts.add(price)
            }
            return parts.joinToString(". ")
        }

    // endregion

    companion object {
        /** Preview instance for Compose previews. */
        val preview = Event(
            id = "preview-1",
            title = "Downtown Farmers Market",
            date = OffsetDateTime.now().format(DateTimeFormatter.ISO_OFFSET_DATE_TIME),
            location = "Court Avenue, Des Moines",
            venue = "Historic Court District",
            city = "Des Moines",
            category = "Food & Drink",
            price = "Free",
            description = "The Downtown Des Moines Farmers' Market is one of the largest in the country.",
            isFeatured = true,
            latitude = 41.5868,
            longitude = -93.625,
        )

        val previewList = listOf(
            preview,
            Event(
                id = "preview-2",
                title = "Jazz in July Concert",
                date = OffsetDateTime.now().plusDays(1).format(DateTimeFormatter.ISO_OFFSET_DATE_TIME),
                location = "Simon Estes Amphitheater",
                venue = "Simon Estes Amphitheater",
                city = "Des Moines",
                category = "Music",
                price = "$15",
                isFeatured = false,
                latitude = 41.584,
                longitude = -93.629,
            ),
            Event(
                id = "preview-3",
                title = "Des Moines Art Festival",
                date = OffsetDateTime.now().plusDays(2).format(DateTimeFormatter.ISO_OFFSET_DATE_TIME),
                location = "Western Gateway Park",
                city = "Des Moines",
                category = "Art & Culture",
                price = "Free",
                isFeatured = true,
                latitude = 41.587,
                longitude = -93.639,
            ),
        )
    }
}
