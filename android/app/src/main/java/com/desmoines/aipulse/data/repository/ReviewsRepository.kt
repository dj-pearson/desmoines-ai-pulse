package com.desmoines.aipulse.data.repository

import com.desmoines.aipulse.data.model.ReviewsData
import com.desmoines.aipulse.data.remote.ReviewsRemoteDataSource
import javax.inject.Inject
import javax.inject.Singleton

/** Reads moderation-visible reviews + aggregate, and writes the caller's own review. */
interface ReviewsRepository {
    suspend fun fetchReviews(contentType: String, contentId: String): Result<ReviewsData>
    suspend fun submitReview(
        userId: String,
        contentType: String,
        contentId: String,
        rating: Int,
        reviewText: String?,
    ): Result<Unit>
    suspend fun deleteReview(id: String, userId: String): Result<Unit>
    suspend fun reportReview(ratingId: String): Result<Unit>
}

@Singleton
class ReviewsRepositoryImpl @Inject constructor(
    private val remote: ReviewsRemoteDataSource,
) : ReviewsRepository {

    override suspend fun fetchReviews(contentType: String, contentId: String): Result<ReviewsData> =
        runCatching {
            // Raw rows; the ViewModel applies moderation visibility with author
            // awareness so the caller can still see/manage their own pending review.
            val reviews = remote.fetchReviews(contentType, contentId)
            val aggregate = runCatching { remote.fetchAggregate(contentType, contentId) }.getOrNull()
            ReviewsData(reviews = reviews, aggregate = aggregate)
        }

    override suspend fun submitReview(
        userId: String,
        contentType: String,
        contentId: String,
        rating: Int,
        reviewText: String?,
    ): Result<Unit> = runCatching {
        remote.upsertReview(userId, contentType, contentId, rating, reviewText)
    }

    override suspend fun deleteReview(id: String, userId: String): Result<Unit> =
        runCatching { remote.deleteReview(id, userId) }

    override suspend fun reportReview(ratingId: String): Result<Unit> =
        runCatching { remote.reportReview(ratingId) }
}
