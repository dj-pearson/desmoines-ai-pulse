package com.desmoines.aipulse.data.model

import androidx.compose.runtime.Immutable
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import java.time.OffsetDateTime
import java.time.format.DateTimeFormatter
import java.util.Locale

/** Author fields embedded from `profiles` on a review row. */
@Immutable
@Serializable
data class ReviewAuthor(
    @SerialName("first_name") val firstName: String? = null,
    @SerialName("last_name") val lastName: String? = null,
    @SerialName("user_role") val userRole: String? = null,
)

/**
 * A single review from `user_ratings` (web useRatings parity), with the
 * author joined from `profiles`. The `rating` column is a `rating_value`
 * enum serialized as a "1".."5" string.
 */
@Immutable
@Serializable
data class Review(
    val id: String,
    @SerialName("content_type") val contentType: String = "",
    @SerialName("content_id") val contentId: String = "",
    @SerialName("user_id") val userId: String = "",
    val rating: String = "0",
    @SerialName("review_text") val reviewText: String? = null,
    @SerialName("is_verified") val isVerified: Boolean? = null,
    @SerialName("moderation_status") val moderationStatus: String? = null,
    @SerialName("created_at") val createdAt: String? = null,
    val profiles: ReviewAuthor? = null,
) {
    /** Star value 0–5 parsed from the enum string. */
    val ratingValue: Int get() = rating.toIntOrNull()?.coerceIn(0, 5) ?: 0

    val hasText: Boolean get() = !reviewText?.trim().isNullOrEmpty()

    val isVerifiedReviewer: Boolean get() = isVerified == true

    /**
     * Hidden when moderation hasn't cleared (pending / flagged / rejected).
     * Null/unknown status is treated as visible so older rows are unaffected —
     * mirrors the web `HIDDEN` set.
     */
    val isVisible: Boolean
        get() = (moderationStatus?.trim()?.lowercase() ?: "approved") !in HIDDEN_STATUSES

    /** "You" for the signed-in author, otherwise a display name or "Guest". */
    fun authorName(currentUserId: String?): String {
        if (currentUserId != null && userId == currentUserId) return "You"
        val name = listOfNotNull(
            profiles?.firstName?.trim()?.takeIf { it.isNotEmpty() },
            profiles?.lastName?.trim()?.takeIf { it.isNotEmpty() },
        ).joinToString(" ")
        return name.ifEmpty { "Guest" }
    }

    /** "Mar 4, 2026" formatted from the ISO timestamp, or null. */
    val formattedDate: String?
        get() = createdAt?.let { iso ->
            runCatching { OffsetDateTime.parse(iso).format(DATE_FORMAT) }.getOrNull()
        }

    companion object {
        private val HIDDEN_STATUSES = setOf("pending", "flagged", "rejected")
        private val DATE_FORMAT = DateTimeFormatter.ofPattern("MMM d, yyyy", Locale.US)
    }
}

/** Aggregate stats from `content_rating_aggregates` for a piece of content. */
@Immutable
@Serializable
data class RatingAggregate(
    @SerialName("average_rating") val averageRating: Double = 0.0,
    @SerialName("total_ratings") val totalRatings: Int = 0,
    @SerialName("weighted_average") val weightedAverage: Double = 0.0,
) {
    val hasRatings: Boolean get() = totalRatings > 0

    /** "4.5" formatted average. */
    val averageLabel: String get() = String.format(Locale.US, "%.1f", averageRating)
}

/** Combined reviews payload for a detail screen. */
@Immutable
data class ReviewsData(
    val reviews: List<Review> = emptyList(),
    val aggregate: RatingAggregate? = null,
)
