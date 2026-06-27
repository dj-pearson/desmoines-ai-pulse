package com.desmoines.aipulse.ui.components.reviews

import com.desmoines.aipulse.data.model.RatingAggregate
import com.desmoines.aipulse.data.model.Review
import com.desmoines.aipulse.data.model.ReviewsData
import com.desmoines.aipulse.data.repository.AuthRepository
import com.desmoines.aipulse.data.repository.ReviewsRepository
import io.mockk.coEvery
import io.mockk.every
import io.mockk.mockk
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test

@OptIn(ExperimentalCoroutinesApi::class)
class ReviewsViewModelTest {

    private val testDispatcher = StandardTestDispatcher()
    private lateinit var repository: ReviewsRepository
    private lateinit var authRepository: AuthRepository

    @BeforeEach
    fun setup() {
        Dispatchers.setMain(testDispatcher)
        repository = mockk(relaxed = true)
        authRepository = mockk(relaxed = true)
        every { authRepository.currentUserId } returns "u1"
    }

    @AfterEach
    fun tearDown() = Dispatchers.resetMain()

    private fun review(id: String, userId: String = "other") =
        Review(id = id, contentType = "restaurant", contentId = "r1", userId = userId, rating = "5")

    private fun vm() = ReviewsViewModel(repository, authRepository)

    @Test
    fun `load populates reviews, aggregate, and current user`() = runTest(testDispatcher) {
        coEvery { repository.fetchReviews("restaurant", "r1") } returns Result.success(
            ReviewsData(
                reviews = listOf(review("a"), review("b")),
                aggregate = RatingAggregate(averageRating = 4.5, totalRatings = 2),
            ),
        )
        val viewModel = vm()

        viewModel.load("restaurant", "r1")
        advanceUntilIdle()

        val state = viewModel.uiState.value
        assertEquals(listOf("a", "b"), state.reviews.map { it.id })
        assertEquals("4.5", state.aggregate?.averageLabel)
        assertEquals("u1", state.currentUserId)
        assertNull(state.errorMessage)
    }

    @Test
    fun `empty result yields empty state`() = runTest(testDispatcher) {
        coEvery { repository.fetchReviews(any(), any()) } returns Result.success(ReviewsData())
        val viewModel = vm()

        viewModel.load("event", "e1")
        advanceUntilIdle()

        assertTrue(viewModel.uiState.value.isEmpty)
    }

    @Test
    fun `failure shows a retry message`() = runTest(testDispatcher) {
        coEvery { repository.fetchReviews(any(), any()) } returns Result.failure(IllegalStateException("boom"))
        val viewModel = vm()

        viewModel.load("attraction", "a1")
        advanceUntilIdle()

        assertEquals("Couldn't load reviews. Tap to retry.", viewModel.uiState.value.errorMessage)
    }

    @Test
    fun `retry reloads the last target`() = runTest(testDispatcher) {
        coEvery { repository.fetchReviews("restaurant", "r1") } returns Result.failure(IllegalStateException("boom"))
        val viewModel = vm()
        viewModel.load("restaurant", "r1")
        advanceUntilIdle()
        assertEquals("Couldn't load reviews. Tap to retry.", viewModel.uiState.value.errorMessage)

        coEvery { repository.fetchReviews("restaurant", "r1") } returns Result.success(
            ReviewsData(reviews = listOf(review("a"))),
        )
        viewModel.retry()
        advanceUntilIdle()

        assertEquals(listOf("a"), viewModel.uiState.value.reviews.map { it.id })
        assertNull(viewModel.uiState.value.errorMessage)
    }
}
