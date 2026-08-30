package com.desmoines.aipulse.data.model

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class ReviewTest {

    private fun review(
        userId: String = "u1",
        rating: String = "4",
        moderation: String? = "approved",
        first: String? = "Jane",
        last: String? = "Doe",
    ) = Review(
        id = "r1", userId = userId, rating = rating, moderationStatus = moderation,
        profiles = ReviewAuthor(firstName = first, lastName = last),
    )

    @Test
    fun `ratingValue parses and clamps the enum string`() {
        assertEquals(4, review(rating = "4").ratingValue)
        assertEquals(0, review(rating = "nonsense").ratingValue)
    }

    @Test
    fun `isVisible hides only un-cleared moderation states`() {
        assertTrue(review(moderation = "approved").isVisible)
        assertTrue(review(moderation = null).isVisible)
        assertFalse(review(moderation = "pending").isVisible)
        assertFalse(review(moderation = "flagged").isVisible)
        assertFalse(review(moderation = "rejected").isVisible)
    }

    @Test
    fun `authorName shows You for the current user, else a display name`() {
        assertEquals("You", review(userId = "me").authorName(currentUserId = "me"))
        assertEquals("Jane Doe", review(userId = "other").authorName(currentUserId = "me"))
        assertEquals("Guest", review(first = null, last = null).authorName(currentUserId = null))
    }

    @Test
    fun `formattedDate renders an ISO timestamp`() {
        val r = Review(id = "r1", createdAt = "2026-03-04T12:00:00Z")
        assertEquals("Mar 4, 2026", r.formattedDate)
    }

    @Test
    fun `aggregate averageLabel formats to one decimal`() {
        assertEquals("4.5", RatingAggregate(averageRating = 4.5, totalRatings = 3).averageLabel)
        assertTrue(RatingAggregate(totalRatings = 1).hasRatings)
        assertFalse(RatingAggregate(totalRatings = 0).hasRatings)
    }
}
