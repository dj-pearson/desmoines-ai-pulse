package com.desmoines.aipulse.data.model

import android.net.Uri
import androidx.compose.runtime.Immutable
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import java.time.LocalDate
import java.time.LocalTime
import java.util.Locale

/**
 * Restaurant data model matching the Supabase `restaurants` table.
 * Mirrors iOS Restaurant.swift.
 */
@Immutable
@Serializable
data class Restaurant(
    val id: String,
    val name: String,
    val cuisine: String? = null,
    val location: String? = null,
    val city: String? = null,
    val rating: Double? = null,
    @SerialName("price_range") val priceRange: String? = null,
    val description: String? = null,
    val phone: String? = null,
    val website: String? = null,
    @SerialName("image_url") val imageUrl: String? = null,
    @SerialName("is_featured") val isFeatured: Boolean? = null,
    val latitude: Double? = null,
    val longitude: Double? = null,
    @SerialName("popularity_score") val popularityScore: Double? = null,
    val status: String? = null,
    val slug: String? = null,
    @SerialName("ai_writeup") val aiWriteup: String? = null,
    @SerialName("business_hours") val businessHours: JsonElement? = null,
    @SerialName("dietary_options") val dietaryOptions: List<String>? = null,
    @SerialName("created_at") val createdAt: String? = null,
    @SerialName("updated_at") val updatedAt: String? = null,
) {

    // region Open/Closed Status

    companion object {
        private val DAY_NAMES = listOf("sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday")

        /**
         * Parse time string like "11:00", "11:00 AM", "9:30 PM" to minutes since midnight.
         * Mirrors iOS Restaurant.parseTime(_:)
         */
        private fun parseTime(string: String): Int? {
            val trimmed = string.trim()
            val parts = trimmed.split(":")
            if (parts.size < 2) return null
            val hour = parts[0].trim().toIntOrNull() ?: return null
            val minuteStr = parts[1].replace(Regex("[A-Za-z]"), "").trim()
            val minute = minuteStr.toIntOrNull() ?: return null

            var h = hour
            val upper = trimmed.uppercase(Locale.US)
            if (upper.endsWith("PM") && h != 12) h += 12
            if (upper.endsWith("AM") && h == 12) h = 0

            return h * 60 + minute
        }

        /**
         * Get hours string for a given day from the business_hours JSON.
         * Supports both flat {"monday": "11:00 - 22:00"} and nested {"hours": {"monday": "..."}} shapes.
         */
        private fun getHoursForDay(businessHours: JsonElement?, day: String): String? {
            if (businessHours == null || businessHours !is JsonObject) return null
            val obj = businessHours.jsonObject

            // Try flat format
            obj[day]?.let {
                if (it is JsonPrimitive) return it.jsonPrimitive.content
            }

            // Try nested format { "hours": { "monday": "..." } }
            obj["hours"]?.let { hoursEl ->
                if (hoursEl is JsonObject) {
                    hoursEl.jsonObject[day]?.let {
                        if (it is JsonPrimitive) return it.jsonPrimitive.content
                    }
                }
            }

            return null
        }

        val preview = Restaurant(
            id = "preview-1",
            name = "Zombie Burger + Drink Lab",
            cuisine = "American",
            location = "300 E Grand Ave",
            city = "Des Moines",
            rating = 4.5,
            priceRange = "$$",
            description = "Creative burgers with horror-themed names and craft cocktails in a fun, quirky atmosphere.",
            phone = "(515) 555-0123",
            website = "https://zombieburger.com",
            isFeatured = true,
            latitude = 41.5910,
            longitude = -93.6088,
        )
    }

    /**
     * Determines if the restaurant is currently open based on business_hours.
     * Returns null if hours data is unavailable.
     * Mirrors iOS Restaurant.isOpenNow(at:)
     */
    fun isOpenNow(now: java.time.LocalDateTime = java.time.LocalDateTime.now()): Boolean? {
        if (businessHours == null) return null

        val dayOfWeek = now.toLocalDate().dayOfWeek // MONDAY=1 .. SUNDAY=7
        val dayIndex = when (dayOfWeek) {
            java.time.DayOfWeek.SUNDAY -> 0
            java.time.DayOfWeek.MONDAY -> 1
            java.time.DayOfWeek.TUESDAY -> 2
            java.time.DayOfWeek.WEDNESDAY -> 3
            java.time.DayOfWeek.THURSDAY -> 4
            java.time.DayOfWeek.FRIDAY -> 5
            java.time.DayOfWeek.SATURDAY -> 6
            else -> return null
        }
        val dayName = DAY_NAMES[dayIndex]

        val dayHours = getHoursForDay(businessHours, dayName) ?: return null
        if (dayHours.isBlank() || dayHours.lowercase() == "closed") return false

        val components = dayHours.split(" - ")
        if (components.size != 2) return null

        val open = parseTime(components[0]) ?: return null
        val close = parseTime(components[1]) ?: return null

        val currentMinutes = now.hour * 60 + now.minute

        // Handle overnight hours (close < open means past midnight)
        return if (close < open) {
            currentMinutes >= open || currentMinutes < close
        } else {
            currentMinutes >= open && currentMinutes < close
        }
    }

    val openStatusText: String
        get() = when (isOpenNow()) {
            true -> "Open"
            false -> "Closed"
            null -> "Hours unknown"
        }

    // endregion

    // region Computed Properties

    val coordinate: LatLng?
        get() {
            val lat = latitude ?: return null
            val lng = longitude ?: return null
            if (lat == 0.0 && lng == 0.0) return null
            return LatLng(lat, lng)
        }

    val displayDescription: String
        get() = aiWriteup ?: description ?: ""

    val displayLocation: String
        get() = listOfNotNull(location, city).filter { it.isNotEmpty() }.joinToString(", ")

    val ratingText: String
        get() = rating?.let { String.format(Locale.US, "%.1f", it) } ?: "No rating"

    /** Count of '$' characters in priceRange. */
    val priceLevel: Int
        get() = priceRange?.count { it == '$' } ?: 0

    val callUri: Uri?
        get() {
            if (phone.isNullOrEmpty()) return null
            val cleaned = phone.replace(Regex("[^0-9+]"), "")
            return Uri.parse("tel:$cleaned")
        }

    val websiteUri: Uri?
        get() {
            if (website.isNullOrEmpty()) return null
            val url = if (website.startsWith("http")) website else "https://$website"
            return Uri.parse(url)
        }

    /** Full accessibility label for a compact card (name, cuisine, price range, rating). */
    val compactCardAccessibilityLabel: String
        get() {
            val parts = mutableListOf(name)
            cuisine?.let { parts.add(it) }
            if (!priceRange.isNullOrEmpty()) parts.add(priceRange)
            if (rating != null) parts.add("Rated $ratingText")
            return parts.joinToString(". ")
        }

    // endregion
}
