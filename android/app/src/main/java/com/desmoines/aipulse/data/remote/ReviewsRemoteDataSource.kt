package com.desmoines.aipulse.data.remote

import com.desmoines.aipulse.data.model.RatingAggregate
import com.desmoines.aipulse.data.model.Review
import io.github.jan.supabase.SupabaseClient
import io.github.jan.supabase.postgrest.from
import io.github.jan.supabase.postgrest.postgrest
import io.github.jan.supabase.postgrest.query.Columns
import io.github.jan.supabase.postgrest.query.Order
import io.github.jan.supabase.postgrest.rpc
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Reads reviews + aggregate ratings for a piece of content. Mirrors iOS
 * RatingsService / web useRatings (read path). Writing lands in ANDP-036.
 */
@Singleton
class ReviewsRemoteDataSource @Inject constructor(
    private val supabaseClient: SupabaseClient?,
) {
    private fun db(): SupabaseClient =
        supabaseClient ?: throw IllegalStateException("Supabase client is not configured.")

    /** All reviews for `(contentType, contentId)`, author joined, newest first. */
    suspend fun fetchReviews(contentType: String, contentId: String): List<Review> =
        db().from("user_ratings")
            .select(Columns.raw("*, profiles:user_id(first_name, last_name, user_role)")) {
                filter {
                    eq("content_type", contentType)
                    eq("content_id", contentId)
                }
                order("created_at", Order.DESCENDING)
            }
            .decodeList<Review>()

    /** Aggregate row, or null when the content has no ratings yet. */
    suspend fun fetchAggregate(contentType: String, contentId: String): RatingAggregate? =
        db().from("content_rating_aggregates")
            .select {
                filter {
                    eq("content_type", contentType)
                    eq("content_id", contentId)
                }
                limit(1L)
            }
            .decodeSingleOrNull<RatingAggregate>()

    @Serializable
    private data class RatingUpsert(
        @SerialName("user_id") val userId: String,
        @SerialName("content_type") val contentType: String,
        @SerialName("content_id") val contentId: String,
        val rating: String,
        @SerialName("review_text") val reviewText: String?,
        @SerialName("photo_urls") val photoUrls: List<String>,
        @SerialName("moderation_status") val moderationStatus: String,
    )

    /**
     * Atomic upsert of the caller's review (web useRatings parity): inserts or
     * updates on conflict `(user_id, content_type, content_id)` — never a
     * delete-then-insert. A review with text is held `pending` until the
     * server moderates it; a bare star rating is immediately `approved`.
     */
    suspend fun upsertReview(
        userId: String,
        contentType: String,
        contentId: String,
        rating: Int,
        reviewText: String?,
    ) {
        val trimmed = reviewText?.trim()?.takeIf { it.isNotEmpty() }
        db().from("user_ratings").upsert(
            RatingUpsert(
                userId = userId,
                contentType = contentType,
                contentId = contentId,
                rating = rating.toString(),
                reviewText = trimmed,
                photoUrls = emptyList(),
                moderationStatus = if (trimmed != null) "pending" else "approved",
            ),
        ) {
            onConflict = "user_id,content_type,content_id"
        }
    }

    /** Deletes the caller's own review (RLS + explicit user_id guard). */
    suspend fun deleteReview(id: String, userId: String) {
        db().from("user_ratings").delete {
            filter {
                eq("id", id)
                eq("user_id", userId)
            }
        }
    }

    @Serializable
    private data class ReportParams(@SerialName("p_rating_id") val ratingId: String)

    /** Flags another user's review for admin attention via the report_review RPC. */
    suspend fun reportReview(ratingId: String) {
        db().postgrest.rpc("report_review", ReportParams(ratingId = ratingId))
    }
}
