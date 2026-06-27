package com.desmoines.aipulse.ui.components.reviews

import androidx.compose.runtime.Immutable
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.desmoines.aipulse.data.model.RatingAggregate
import com.desmoines.aipulse.data.model.Review
import com.desmoines.aipulse.data.model.SubscriptionTier
import com.desmoines.aipulse.data.remote.BillingService
import com.desmoines.aipulse.data.repository.AuthRepository
import com.desmoines.aipulse.data.repository.ReviewsRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

/** One-shot navigation the section must perform on behalf of the gate. */
enum class ReviewsNavEvent { REQUIRE_AUTH, REQUIRE_PAYWALL }

@Immutable
data class ReviewsUiState(
    val reviews: List<Review> = emptyList(),
    val aggregate: RatingAggregate? = null,
    val currentUserId: String? = null,
    val currentTier: SubscriptionTier = SubscriptionTier.FREE,
    val isLoading: Boolean = true,
    val errorMessage: String? = null,
    // Composer
    val isComposerVisible: Boolean = false,
    val isEditing: Boolean = false,
    val draftRating: Int = 0,
    val draftText: String = "",
    val isSubmitting: Boolean = false,
    // Delete confirmation
    val showDeleteConfirm: Boolean = false,
    // One-shot signals
    val toastMessage: String? = null,
    val navEvent: ReviewsNavEvent? = null,
) {
    val isEmpty: Boolean get() = reviews.isEmpty() && !isLoading && errorMessage == null
    val isAuthenticated: Boolean get() = currentUserId != null
    /** The caller's own review for this content, if any. */
    val userReview: Review? get() = currentUserId?.let { uid -> reviews.firstOrNull { it.userId == uid } }
    val canSubmit: Boolean get() = draftRating in 1..5 && !isSubmitting
}

/**
 * Backs the embeddable reviews section (ANDP-035 read, ANDP-036 write).
 * Writing is gated to authenticated Insider+ users; any signed-in user can
 * report another review. Atomic upsert mirrors iOS BUG-002. Mirrors iOS
 * ReviewsSection / web useRatings.
 */
@HiltViewModel
class ReviewsViewModel @Inject constructor(
    private val repository: ReviewsRepository,
    private val authRepository: AuthRepository,
    private val billingService: BillingService,
) : ViewModel() {

    private val _uiState = MutableStateFlow(ReviewsUiState())
    val uiState: StateFlow<ReviewsUiState> = _uiState.asStateFlow()

    private var contentType: String? = null
    private var contentId: String? = null

    fun load(contentType: String, contentId: String) {
        this.contentType = contentType
        this.contentId = contentId
        _uiState.update {
            it.copy(
                isLoading = true,
                errorMessage = null,
                currentUserId = authRepository.currentUserId,
                currentTier = billingService.currentTier.value,
            )
        }
        viewModelScope.launch {
            val currentUserId = authRepository.currentUserId
            repository.fetchReviews(contentType, contentId)
                .onSuccess { data ->
                    // Hide un-moderated reviews, but always keep the caller's own
                    // row so they can edit/delete a just-submitted (pending) review.
                    val visible = data.reviews.filter { it.isVisible || it.userId == currentUserId }
                    _uiState.update {
                        it.copy(reviews = visible, aggregate = data.aggregate, isLoading = false, errorMessage = null)
                    }
                }
                .onFailure {
                    _uiState.update { it.copy(isLoading = false, errorMessage = "Couldn't load reviews. Tap to retry.") }
                }
        }
    }

    fun retry() {
        val type = contentType ?: return
        val id = contentId ?: return
        load(type, id)
    }

    // MARK: - Composer / gating

    fun onWriteReviewClicked() {
        val userId = authRepository.currentUserId
        if (userId == null) {
            _uiState.update { it.copy(navEvent = ReviewsNavEvent.REQUIRE_AUTH) }
            return
        }
        if (!billingService.currentTier.value.isPremium) {
            _uiState.update { it.copy(currentTier = billingService.currentTier.value, navEvent = ReviewsNavEvent.REQUIRE_PAYWALL) }
            return
        }
        val existing = _uiState.value.userReview
        _uiState.update {
            it.copy(
                currentUserId = userId,
                isComposerVisible = true,
                isEditing = existing != null,
                draftRating = existing?.ratingValue ?: 0,
                draftText = existing?.reviewText ?: "",
            )
        }
    }

    fun onDraftRatingChanged(rating: Int) {
        _uiState.update { it.copy(draftRating = rating.coerceIn(0, 5)) }
    }

    fun onDraftTextChanged(text: String) {
        _uiState.update { it.copy(draftText = text) }
    }

    fun dismissComposer() {
        _uiState.update { it.copy(isComposerVisible = false) }
    }

    fun submitReview() {
        val state = _uiState.value
        val userId = state.currentUserId ?: return
        val type = contentType ?: return
        val id = contentId ?: return
        if (state.draftRating !in 1..5 || state.isSubmitting) return

        val text = state.draftText
        _uiState.update { it.copy(isSubmitting = true) }
        viewModelScope.launch {
            repository.submitReview(userId, type, id, state.draftRating, text)
                .onSuccess {
                    val hadText = text.trim().isNotEmpty()
                    _uiState.update {
                        it.copy(
                            isSubmitting = false,
                            isComposerVisible = false,
                            toastMessage = if (hadText) "Thanks! Your review is being reviewed and will appear shortly." else "Thanks for your feedback!",
                        )
                    }
                    load(type, id)
                }
                .onFailure {
                    _uiState.update { it.copy(isSubmitting = false, toastMessage = "Couldn't submit your review. Please try again.") }
                }
        }
    }

    // MARK: - Delete own review

    fun requestDeleteOwnReview() {
        _uiState.update { it.copy(showDeleteConfirm = true) }
    }

    fun dismissDeleteConfirm() {
        _uiState.update { it.copy(showDeleteConfirm = false) }
    }

    fun confirmDeleteOwnReview() {
        val state = _uiState.value
        val review = state.userReview ?: return
        val userId = state.currentUserId ?: return
        val type = contentType ?: return
        val id = contentId ?: return
        _uiState.update { it.copy(showDeleteConfirm = false) }
        viewModelScope.launch {
            repository.deleteReview(review.id, userId)
                .onSuccess {
                    _uiState.update { it.copy(toastMessage = "Your review has been removed.") }
                    load(type, id)
                }
                .onFailure {
                    _uiState.update { it.copy(toastMessage = "Couldn't delete your review. Please try again.") }
                }
        }
    }

    // MARK: - Report another review

    fun reportReview(ratingId: String) {
        if (authRepository.currentUserId == null) {
            _uiState.update { it.copy(navEvent = ReviewsNavEvent.REQUIRE_AUTH) }
            return
        }
        viewModelScope.launch {
            repository.reportReview(ratingId)
                .onSuccess { _uiState.update { it.copy(toastMessage = "Thanks — our team will take a look.") } }
                .onFailure { _uiState.update { it.copy(toastMessage = "Couldn't submit your report. Please try again.") } }
        }
    }

    // MARK: - One-shot consumption

    fun consumeToast() {
        _uiState.update { it.copy(toastMessage = null) }
    }

    fun consumeNavEvent() {
        _uiState.update { it.copy(navEvent = null) }
    }
}
