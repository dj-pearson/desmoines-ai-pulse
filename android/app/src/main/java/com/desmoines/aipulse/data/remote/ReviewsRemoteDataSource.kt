package com.desmoines.aipulse.data.remote

import com.desmoines.aipulse.data.model.RatingAggregate
import com.desmoines.aipulse.data.model.Review
import io.github.jan.supabase.SupabaseClient
import io.github.jan.supabase.postgrest.from
import io.github.jan.supabase.postgrest.query.Columns
import io.github.jan.supabase.postgrest.query.Order
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
}
