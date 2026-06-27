package com.desmoines.aipulse.data.repository

import com.desmoines.aipulse.data.model.ReviewsData
import com.desmoines.aipulse.data.remote.ReviewsRemoteDataSource
import javax.inject.Inject
import javax.inject.Singleton

/** Reads moderation-visible reviews + aggregate for a piece of content. */
interface ReviewsRepository {
    suspend fun fetchReviews(contentType: String, contentId: String): Result<ReviewsData>
}

@Singleton
class ReviewsRepositoryImpl @Inject constructor(
    private val remote: ReviewsRemoteDataSource,
) : ReviewsRepository {

    override suspend fun fetchReviews(contentType: String, contentId: String): Result<ReviewsData> =
        runCatching {
            val reviews = remote.fetchReviews(contentType, contentId).filter { it.isVisible }
            val aggregate = runCatching { remote.fetchAggregate(contentType, contentId) }.getOrNull()
            ReviewsData(reviews = reviews, aggregate = aggregate)
        }
}
