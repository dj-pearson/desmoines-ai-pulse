package com.desmoines.aipulse.data.model

import androidx.compose.runtime.Immutable
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import java.time.OffsetDateTime

/**
 * A local deal from the `deals` table (web useDeals parity). Mirrors iOS Deal,
 * including recurring schedule fields rendered as readable text.
 */
@Immutable
@Serializable
data class Deal(
    val id: String,
    val title: String,
    val description: String? = null,
    @SerialName("business_name") val businessName: String = "",
    @SerialName("entity_type") val entityType: String = "",
    @SerialName("entity_id") val entityId: String? = null,
    @SerialName("deal_type") val dealType: String = "",
    @SerialName("discount_value") val discountValue: String? = null,
    val code: String? = null,
    val terms: String? = null,
    @SerialName("start_date") val startDate: String? = null,
    @SerialName("end_date") val endDate: String? = null,
    @SerialName("image_url") val imageUrl: String? = null,
    @SerialName("is_verified") val isVerified: Boolean? = null,
    @SerialName("is_featured") val isFeatured: Boolean? = null,
    @SerialName("redemption_count") val redemptionCount: Int? = null,
    @SerialName("days_of_week") val daysOfWeek: List<String>? = null,
    @SerialName("start_time") val startTime: String? = null,
    @SerialName("end_time") val endTime: String? = null,
) {
    val isSponsored: Boolean get() = isFeatured == true
    val isRecurring: Boolean get() = !daysOfWeek.isNullOrEmpty()

    /** Mirrors the web getDealTypeLabel. */
    val dealTypeLabel: String
        get() = when (dealType) {
            "percentage" -> "% Off"
            "dollar_off" -> "$ Off"
            "bogo" -> "BOGO"
            "free_item" -> "Free Item"
            "package" -> "Package"
            else -> "Deal"
        }

    /** Headline value badge, e.g. "20% Off". */
    val valueLabel: String
        get() {
            val value = discountValue
            if (!value.isNullOrEmpty()) {
                return when (dealType) {
                    "percentage", "dollar_off" -> "$value Off"
                    else -> value
                }
            }
            return dealTypeLabel
        }

    /** Human-readable recurring schedule, e.g. "Mon–Fri · 3:00–6:00 PM", or null. */
    val scheduleText: String?
        get() {
            if (!isRecurring) return null
            val days = (daysOfWeek ?: emptyList())
                .map { it.lowercase() }
                .filter { DAY_NAME.containsKey(it) }
                .sortedBy { DAY_ORDER.indexOf(it) }
            if (days.isEmpty()) return null
            val daysLabel = when {
                days.size == 7 -> "Daily"
                isConsecutive(days) -> "${DAY_NAME[days.first()]}–${DAY_NAME[days.last()]}"
                else -> days.mapNotNull { DAY_NAME[it] }.joinToString(", ")
            }
            val startLabel = startTime?.let { timeLabel(it) }
            val endLabel = endTime?.let { timeLabel(it) }
            return if (startLabel != null && endLabel != null) "$daysLabel · $startLabel–$endLabel" else daysLabel
        }

    /** Whether the deal is live right now (date window + recurring schedule). */
    fun isActiveNow(now: OffsetDateTime = OffsetDateTime.now()): Boolean {
        startDate?.let { s -> parse(s)?.let { if (now.isBefore(it)) return false } }
        endDate?.let { e -> parse(e)?.let { if (now.isAfter(it)) return false } }
        if (!isRecurring) return true

        val token = DAY_ORDER_SUN_FIRST[now.dayOfWeek.value % 7] // DayOfWeek: Mon=1..Sun=7
        if ((daysOfWeek ?: emptyList()).map { it.lowercase() }.none { it == token }) return false

        val startMin = startTime?.let { minutesOfDay(it) }
        val endMin = endTime?.let { minutesOfDay(it) }
        if (startMin != null && endMin != null) {
            val nowMin = now.hour * 60 + now.minute
            return nowMin in startMin..endMin
        }
        return true
    }

    private companion object {
        val DAY_ORDER = listOf("mon", "tue", "wed", "thu", "fri", "sat", "sun")
        // Indexed by DayOfWeek.value % 7 (Sun→0, Mon→1 … Sat→6).
        val DAY_ORDER_SUN_FIRST = listOf("sun", "mon", "tue", "wed", "thu", "fri", "sat")
        val DAY_NAME = mapOf(
            "mon" to "Mon", "tue" to "Tue", "wed" to "Wed", "thu" to "Thu",
            "fri" to "Fri", "sat" to "Sat", "sun" to "Sun",
        )

        fun isConsecutive(days: List<String>): Boolean {
            val indices = days.mapNotNull { DAY_ORDER.indexOf(it).takeIf { i -> i >= 0 } }
            if (indices.size != days.size || indices.size <= 1) return days.size == 1
            return indices.zipWithNext().all { (a, b) -> b == a + 1 }
        }

        fun timeLabel(time: String): String? {
            val minutes = minutesOfDay(time) ?: return null
            val hour24 = minutes / 60
            val minute = minutes % 60
            val period = if (hour24 >= 12) "PM" else "AM"
            var hour12 = hour24 % 12
            if (hour12 == 0) hour12 = 12
            return "%d:%02d %s".format(hour12, minute, period)
        }

        fun minutesOfDay(time: String): Int? {
            val parts = time.split(":")
            val h = parts.getOrNull(0)?.toIntOrNull() ?: return null
            val m = parts.getOrNull(1)?.toIntOrNull() ?: return null
            return h * 60 + m
        }

        fun parse(iso: String): OffsetDateTime? =
            runCatching { OffsetDateTime.parse(iso) }.getOrNull()
    }
}
