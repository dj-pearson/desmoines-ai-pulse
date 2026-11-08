package com.desmoines.aipulse.data.model

import com.desmoines.aipulse.util.EventSlug
import com.desmoines.aipulse.util.EventTimeText
import androidx.compose.runtime.Immutable
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import java.time.LocalDate
import java.time.OffsetDateTime
import java.time.format.DateTimeFormatter
import java.time.format.DateTimeParseException

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
    /** When a multi-day run ends (end_date, 20260316000002). Null for a single sitting. */
    @SerialName("end_date") val endDate: String? = null,
    /** The source published a date but no start time (time_tbd, 20260902000016). */
    @SerialName("time_tbd") val timeTbd: Boolean? = null,
    /** Which ingest path wrote the row, e.g. "seatgeek". */
    val source: String? = null,
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
        get() = parseTimestamp(date)

    /** [endDate] parsed the same way as [parsedDate], or null when absent or unparseable. */
    val parsedEndDate: OffsetDateTime?
        get() = endDate?.let { parseTimestamp(it) }

    /**
     * Whether the row carries a real start time, as iOS Event.hasSpecificTime
     * decides it (IOS-DD-EVENTS-05). False for an explicit time_tbd, for a
     * SeatGeek row at its 03:30 placeholder, for the 19:31:58 no-time marker,
     * and for a bare yyyy-MM-dd date, which has no time to show.
     */
    val hasSpecificTime: Boolean
        get() {
            if (timeTbd == true) return false
            if (date.trim().length == DATE_ONLY_LENGTH) return false
            val start = parsedDate
            val fromSeatGeek = listOf(source, sourceUrl).any { it?.contains("seatgeek", ignoreCase = true) == true }
            if (fromSeatGeek && start != null && centralWallTime(start) == SEATGEEK_PLACEHOLDER) return false
            val local = eventStartLocal
            val tIndex = local?.indexOf('T') ?: -1
            if (local != null && tIndex >= 0) {
                return local.substring(tIndex + 1).take(8) != NO_TIME_MARKER
            }
            if (start != null && centralWallTime(start) == NO_TIME_MARKER) return false
            return true
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
     * Urgency label: "Today", "Tomorrow", or "In X days" (up to 7 days), by
     * Des Moines day. Returns null if date is unparseable or too far out.
     */
    val urgencyLabel: String?
        get() = EventTimeText.urgencyLabel(this)

    /** Full accessibility label for a featured card (title, category, Des Moines date, price). */
    val featuredCardAccessibilityLabel: String
        get() {
            val parts = mutableListOf(title, eventCategory.displayName)
            EventTimeText.dayText(this, "EEEE, MMMM d")?.let { parts.add(it) }
            if (isFree) {
                parts.add("Free event")
            } else if (!price.isNullOrEmpty()) {
                parts.add(price)
            }
            return parts.joinToString(". ")
        }

    // endregion

    companion object {
        /** The ingest pipeline's "no time" wall clock in Central (iOS DesMoinesTime.noTimeMarker). */
        const val NO_TIME_MARKER = "19:31:58"

        /** SeatGeek's placeholder for an unannounced showtime (WEB-BE-038). */
        const val SEATGEEK_PLACEHOLDER = "03:30:00"

        private const val DATE_ONLY_LENGTH = 10

        private val WALL_TIME: DateTimeFormatter = DateTimeFormatter.ofPattern("HH:mm:ss")

        private fun centralWallTime(instant: OffsetDateTime): String =
            instant.atZoneSameInstant(EventSlug.CENTRAL).format(WALL_TIME)

        /**
         * Tries ISO 8601 with an offset, then the offset-less forms, which are
         * read as UTC. Shared by [parsedDate] and [parsedEndDate].
         */
        fun parseTimestamp(raw: String): OffsetDateTime? {
            try {
                return OffsetDateTime.parse(raw, DateTimeFormatter.ISO_OFFSET_DATE_TIME)
            } catch (_: DateTimeParseException) {
                // Try the offset-less forms
            }
            try {
                val ld = LocalDate.parse(raw, DateTimeFormatter.ofPattern("yyyy-MM-dd"))
                return ld.atStartOfDay().atOffset(java.time.ZoneOffset.UTC)
            } catch (_: DateTimeParseException) {
                // ignore
            }
            for (pattern in listOf("yyyy-MM-dd'T'HH:mm:ss", "yyyy-MM-dd HH:mm:ss")) {
                try {
                    val ldt = java.time.LocalDateTime.parse(raw, DateTimeFormatter.ofPattern(pattern))
                    return ldt.atOffset(java.time.ZoneOffset.UTC)
                } catch (_: DateTimeParseException) {
                    // ignore
                }
            }
            return null
        }

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
