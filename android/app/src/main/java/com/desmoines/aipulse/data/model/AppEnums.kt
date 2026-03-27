package com.desmoines.aipulse.data.model

import androidx.compose.ui.graphics.Color
import java.time.DayOfWeek
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.LocalTime
import java.time.temporal.TemporalAdjusters

// region Event Category

enum class EventCategory(val displayName: String, val iconName: String, val color: Color) {
    GENERAL("General", "calendar", Color(0xFF2196F3)),           // blue
    MUSIC("Music", "music_note", Color(0xFF9C27B0)),             // purple
    FOOD("Food & Drink", "restaurant", Color(0xFFFF9800)),       // orange
    ART("Art & Culture", "palette", Color(0xFFE91E63)),          // pink
    OUTDOOR("Outdoor", "eco", Color(0xFF4CAF50)),                // green
    FAMILY("Family", "family_restroom", Color(0xFF00BCD4)),      // cyan
    SPORTS("Sports", "sports_tennis", Color(0xFF4DB6AC)),        // mint
    NIGHTLIFE("Nightlife", "nightlife", Color(0xFF3F51B5)),      // indigo
    BUSINESS("Business", "business_center", Color(0xFF9E9E9E)),  // gray
    EDUCATION("Education", "school", Color(0xFF009688)),         // teal
    CHARITY("Charity", "favorite", Color(0xFFF44336)),           // red
    HOLIDAY("Holiday", "card_giftcard", Color(0xFFFFEB3B));      // yellow

    companion object {
        /**
         * Initialize from a database string, falling back to GENERAL.
         * Mirrors iOS EventCategory.init(from:)
         */
        fun from(rawString: String?): EventCategory {
            if (rawString == null) return GENERAL
            // Try exact match on displayName
            entries.firstOrNull { it.displayName == rawString }?.let { return it }
            // Try case-insensitive match
            val lowered = rawString.lowercase()
            return entries.firstOrNull {
                it.displayName.lowercase() == lowered || lowered.contains(it.displayName.lowercase())
            } ?: GENERAL
        }
    }
}

// endregion

// region Price Range

enum class PriceRange(val symbol: String, val displayName: String) {
    BUDGET("$", "Budget ($)"),
    MODERATE("$$", "Moderate ($$)"),
    UPSCALE("$$$", "Upscale ($$$)"),
    FINE_DINING("$$$$", "Fine Dining ($$$$)");

    companion object {
        fun fromSymbol(symbol: String?): PriceRange? =
            entries.firstOrNull { it.symbol == symbol }
    }
}

// endregion

// region Location Area

enum class LocationArea(val displayName: String) {
    DOWNTOWN("Downtown Des Moines"),
    WEST_DES_MOINES("West Des Moines"),
    ANKENY("Ankeny"),
    URBANDALE("Urbandale"),
    CLIVE("Clive"),
    JOHNSTON("Johnston"),
    ALTOONA("Altoona"),
    WINDSOR_HEIGHTS("Windsor Heights"),
    WAUKEE("Waukee"),
    PLEASANT_HILL("Pleasant Hill");
}

// endregion

// region Attraction Type

enum class AttractionType(val displayName: String, val iconName: String) {
    MUSEUM("Museum", "museum"),
    PARK("Park", "park"),
    HISTORIC_SITE("Historic Site", "account_balance"),
    ENTERTAINMENT("Entertainment", "theater_comedy"),
    ZOO("Zoo", "pets"),
    GARDEN("Garden", "eco"),
    SPORTS("Sports Venue", "sports_tennis"),
    SHOPPING("Shopping", "shopping_bag"),
    OTHER("Other", "place");

    companion object {
        fun from(rawString: String?): AttractionType =
            entries.firstOrNull { it.displayName == rawString } ?: OTHER
    }
}

// endregion

// region Content Type

enum class ContentType(val value: String) {
    EVENT("event"),
    RESTAURANT("restaurant"),
    ATTRACTION("attraction"),
    PLAYGROUND("playground");
}

// endregion

// region User Role

enum class UserRole(val value: String) {
    USER("user"),
    MODERATOR("moderator"),
    ADMIN("admin"),
    ROOT_ADMIN("root_admin");

    companion object {
        fun from(rawString: String?): UserRole =
            entries.firstOrNull { it.value == rawString } ?: USER
    }
}

// endregion

// region Sort Options

enum class EventSortOption(val displayName: String) {
    DATE("Date"),
    DISTANCE("Distance"),
    POPULARITY("Popularity");
}

enum class RestaurantSortOption(val displayName: String) {
    POPULARITY("Popular"),
    RATING("Rating"),
    NEWEST("Newest"),
    ALPHABETICAL("A-Z"),
    PRICE_LOW("Price: Low"),
    PRICE_HIGH("Price: High");
}

// endregion

// region Date Filter Preset

enum class DateFilterPreset(val displayName: String) {
    TODAY("Today"),
    TOMORROW("Tomorrow"),
    THIS_WEEKEND("This Weekend"),
    THIS_WEEK("This Week"),
    NEXT_WEEK("Next Week"),
    THIS_MONTH("This Month");

    /**
     * Computes the date range for this preset.
     * Mirrors iOS DateFilterPreset.dateRange computed property.
     */
    val dateRange: Pair<LocalDateTime, LocalDateTime>
        get() {
            val now = LocalDate.now()
            val startOfToday = now.atStartOfDay()

            return when (this) {
                TODAY -> startOfToday to startOfToday.plusDays(1)
                TOMORROW -> startOfToday.plusDays(1) to startOfToday.plusDays(2)
                THIS_WEEKEND -> {
                    val dayOfWeek = now.dayOfWeek
                    val saturday = if (dayOfWeek == DayOfWeek.SATURDAY) {
                        now
                    } else if (dayOfWeek == DayOfWeek.SUNDAY) {
                        // If Sunday, still show "this weekend" as today..Monday
                        now.minusDays(1)
                    } else {
                        now.with(TemporalAdjusters.next(DayOfWeek.SATURDAY))
                    }
                    val monday = saturday.plusDays(2)
                    saturday.atStartOfDay() to monday.atStartOfDay()
                }
                THIS_WEEK -> startOfToday to startOfToday.plusDays(7)
                NEXT_WEEK -> startOfToday.plusDays(7) to startOfToday.plusDays(14)
                THIS_MONTH -> startOfToday to startOfToday.plusMonths(1)
            }
        }
}

// endregion

// region Subscription Tier

enum class SubscriptionTier(val displayName: String) {
    FREE("Free"),
    INSIDER("Insider"),
    VIP("VIP");

    val maxFavorites: Int
        get() = when (this) {
            FREE -> 3
            INSIDER, VIP -> Int.MAX_VALUE
        }

    val features: List<String>
        get() = when (this) {
            FREE -> listOf(
                "Browse events & restaurants",
                "Save up to 3 favorites",
                "Basic text search",
                "View ratings & reviews",
                "Weekly email digest",
            )
            INSIDER -> listOf(
                "Everything in Free, plus:",
                "AI Trip Planner (5 trips/month)",
                "Unlimited favorites",
                "Advanced filters (distance, price, rating)",
                "Write reviews & ratings",
                "Saved searches & event alerts",
                "Ad-free experience",
                "Early access to events",
                "2x XP earning rate",
            )
            VIP -> listOf(
                "Everything in Insider, plus:",
                "Unlimited AI Trip Planner",
                "VIP-exclusive events",
                "Restaurant reservation help",
                "SMS alerts",
                "Monthly local business perks",
                "Concierge support",
                "3x XP earning rate",
            )
        }

    companion object {
        fun from(rawString: String?): SubscriptionTier =
            entries.firstOrNull { it.name.lowercase() == rawString?.lowercase() } ?: FREE
    }
}

// endregion
