package com.desmoines.aipulse.ui.components.reviews

import com.desmoines.aipulse.data.model.RatingAggregate
import com.desmoines.aipulse.data.model.Review
import com.desmoines.aipulse.data.model.ReviewsData
import com.desmoines.aipulse.data.model.SubscriptionTier
import com.desmoines.aipulse.data.remote.BillingService
import com.desmoines.aipulse.data.repository.AuthRepository
import com.desmoines.aipulse.data.repository.ReviewsRepository
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.every
import io.mockk.mockk
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test

@OptIn(ExperimentalCoroutinesApi::class)
class ReviewsViewModelTest {

    private val testDispatcher = StandardTestDispatcher()
    private lateinit var repository: ReviewsRepository
    private lateinit var authRepository: AuthRepository
    private lateinit var billingService: BillingService

    @BeforeEach
    fun setup() {
        Dispatchers.setMain(testDispatcher)
        repository = mockk(relaxed = true)
        authRepository = mockk(relaxed = true)
        billingService = mockk(relaxed = true)
        every { authRepository.currentUserId } returns "u1"
        every { billingService.currentTier } returns MutableStateFlow(SubscriptionTier.INSIDER)
    }

    @AfterEach
    fun tearDown() = Dispatchers.resetMain()

    private fun review(id: String, userId: String = "other") =
        Review(id = id, contentType = "restaurant", contentId = "r1", userId = userId, rating = "5")

    private fun vm() = ReviewsViewModel(repository, authRepository, billingService)

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
    fun `write tap while signed out requires auth`() = runTest(testDispatcher) {
        every { authRepository.currentUserId } returns null
        val viewModel = vm()

        viewModel.onWriteReviewClicked()

        assertEquals(ReviewsNavEvent.REQUIRE_AUTH, viewModel.uiState.value.navEvent)
        assertFalse(viewModel.uiState.value.isComposerVisible)
    }

    @Test
    fun `write tap while free tier requires paywall`() = runTest(testDispatcher) {
        every { billingService.currentTier } returns MutableStateFlow(SubscriptionTier.FREE)
        val viewModel = vm()

        viewModel.onWriteReviewClicked()

        assertEquals(ReviewsNavEvent.REQUIRE_PAYWALL, viewModel.uiState.value.navEvent)
        assertFalse(viewModel.uiState.value.isComposerVisible)
    }

    @Test
    fun `write tap as insider opens composer, prefilled when editing`() = runTest(testDispatcher) {
        coEvery { repository.fetchReviews("restaurant", "r1") } returns Result.success(
            ReviewsData(reviews = listOf(Review(id = "own", contentType = "restaurant", contentId = "r1", userId = "u1", rating = "3", reviewText = "ok"))),
        )
        val viewModel = vm()
        viewModel.load("restaurant", "r1")
        advanceUntilIdle()

        viewModel.onWriteReviewClicked()

        val state = viewModel.uiState.value
        assertTrue(state.isComposerVisible)
        assertTrue(state.isEditing)
        assertEquals(3, state.draftRating)
        assertEquals("ok", state.draftText)
    }

    @Test
    fun `submit upserts and reloads`() = runTest(testDispatcher) {
        coEvery { repository.fetchReviews("restaurant", "r1") } returns Result.success(ReviewsData())
        coEvery { repository.submitReview("u1", "restaurant", "r1", 4, any()) } returns Result.success(Unit)
        val viewModel = vm()
        viewModel.load("restaurant", "r1")
        advanceUntilIdle()

        viewModel.onWriteReviewClicked()
        viewModel.onDraftRatingChanged(4)
        viewModel.onDraftTextChanged("Great spot")
        viewModel.submitReview()
        advanceUntilIdle()

        coVerify { repository.submitReview("u1", "restaurant", "r1", 4, "Great spot") }
        assertFalse(viewModel.uiState.value.isComposerVisible)
        assertFalse(viewModel.uiState.value.isSubmitting)
        assertEquals("Thanks! Your review is being reviewed and will appear shortly.", viewModel.uiState.value.toastMessage)
    }

    @Test
    fun `delete own review calls repository and reloads`() = runTest(testDispatcher) {
        coEvery { repository.fetchReviews("restaurant", "r1") } returns Result.success(
            ReviewsData(reviews = listOf(Review(id = "own", contentType = "restaurant", contentId = "r1", userId = "u1", rating = "5"))),
        )
        coEvery { repository.deleteReview("own", "u1") } returns Result.success(Unit)
        val viewModel = vm()
        viewModel.load("restaurant", "r1")
        advanceUntilIdle()

        viewModel.requestDeleteOwnReview()
        assertTrue(viewModel.uiState.value.showDeleteConfirm)
        viewModel.confirmDeleteOwnReview()
        advanceUntilIdle()

        coVerify { repository.deleteReview("own", "u1") }
        assertEquals("Your review has been removed.", viewModel.uiState.value.toastMessage)
    }

    @Test
    fun `report review posts and toasts`() = runTest(testDispatcher) {
        coEvery { repository.reportReview("x") } returns Result.success(Unit)
        val viewModel = vm()

        viewModel.reportReview("x")
        advanceUntilIdle()

        coVerify { repository.reportReview("x") }
        assertEquals("Thanks — our team will take a look.", viewModel.uiState.value.toastMessage)
    }
}
