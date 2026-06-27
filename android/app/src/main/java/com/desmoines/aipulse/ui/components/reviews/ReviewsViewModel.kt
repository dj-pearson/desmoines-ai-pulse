package com.desmoines.aipulse.ui.components.reviews

import androidx.compose.runtime.Immutable
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.desmoines.aipulse.data.model.RatingAggregate
import com.desmoines.aipulse.data.model.Review
import com.desmoines.aipulse.data.repository.AuthRepository
import com.desmoines.aipulse.data.repository.ReviewsRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

@Immutable
data class ReviewsUiState(
    val reviews: List<Review> = emptyList(),
    val aggregate: RatingAggregate? = null,
    val currentUserId: String? = null,
    val isLoading: Boolean = true,
    val errorMessage: String? = null,
) {
    val isEmpty: Boolean get() = reviews.isEmpty() && !isLoading && errorMessage == null
}

/**
 * Backs the embeddable reviews section (ANDP-035). Reading is free; the
 * write/edit/report path lands in ANDP-036 (#275). Mirrors iOS ReviewsSection.
 */
@HiltViewModel
class ReviewsViewModel @Inject constructor(
    private val repository: ReviewsRepository,
    private val authRepository: AuthRepository,
) : ViewModel() {

    private val _uiState = MutableStateFlow(ReviewsUiState())
    val uiState: StateFlow<ReviewsUiState> = _uiState.asStateFlow()

    private var contentType: String? = null
    private var contentId: String? = null

    /** Loads reviews for the given content; safe to call repeatedly (no-op while same target loads). */
    fun load(contentType: String, contentId: String) {
        this.contentType = contentType
        this.contentId = contentId
        _uiState.update { it.copy(isLoading = true, errorMessage = null, currentUserId = authRepository.currentUserId) }
        viewModelScope.launch {
            repository.fetchReviews(contentType, contentId)
                .onSuccess { data ->
                    _uiState.update {
                        it.copy(reviews = data.reviews, aggregate = data.aggregate, isLoading = false, errorMessage = null)
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
}
