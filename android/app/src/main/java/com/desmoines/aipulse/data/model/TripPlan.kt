package com.desmoines.aipulse.data.model

import androidx.compose.runtime.Immutable
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/** A single stop in a generated itinerary. Matches the get_trip_itinerary RPC row (snake_case). */
@Immutable
@Serializable
data class TripPlanItem(
    @SerialName("item_id") val itemId: String? = null,
    @SerialName("day_number") val dayNumber: Int = 1,
    @SerialName("order_index") val orderIndex: Int = 0,
    @SerialName("item_type") val itemType: String = "custom",
    val title: String? = null,
    val description: String? = null,
    val location: String? = null,
    @SerialName("start_time") val startTime: String? = null,
    @SerialName("end_time") val endTime: String? = null,
    @SerialName("duration_minutes") val durationMinutes: Int? = null,
    val notes: String? = null,
    @SerialName("estimated_cost") val estimatedCost: String? = null,
    @SerialName("ai_reason") val aiReason: String? = null,
)

/**
 * A generated AI itinerary. Decoded from the generate-itinerary response `tripPlan`,
 * which spreads the trip_plans DB row (snake_case) plus camelCase items/tips/packingList.
 */
@Immutable
@Serializable
data class TripPlan(
    val id: String,
    val title: String = "",
    val description: String? = null,
    @SerialName("start_date") val startDate: String? = null,
    @SerialName("end_date") val endDate: String? = null,
    @SerialName("total_estimated_cost") val totalEstimatedCost: String? = null,
    @SerialName("share_code") val shareCode: String? = null,
    @SerialName("is_public") val isPublic: Boolean? = null,
    val items: List<TripPlanItem> = emptyList(),
    val tips: List<String> = emptyList(),
    val packingList: List<String> = emptyList(),
)

/** Budget preference sent to generate-itinerary. */
enum class TripBudget(val value: String, val label: String) {
    BUDGET("budget", "Budget"),
    MODERATE("moderate", "Moderate"),
    SPLURGE("splurge", "Splurge"),
    ANY("any", "Any"),
}

/** Pace preference sent to generate-itinerary. */
enum class TripPace(val value: String, val label: String) {
    RELAXED("relaxed", "Relaxed"),
    MODERATE("moderate", "Moderate"),
    PACKED("packed", "Packed"),
}

/** Interest options offered in the Trip Planner form. */
val TRIP_INTERESTS: List<String> = listOf(
    "music", "food", "outdoors", "arts", "sports",
    "nightlife", "shopping", "history", "family", "wellness",
)
