package com.desmoines.aipulse.ui.components.reviews

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Star
import androidx.compose.material.icons.filled.StarOutline
import androidx.compose.material.icons.filled.Verified
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.desmoines.aipulse.data.model.RatingAggregate
import com.desmoines.aipulse.data.model.Review

private val StarGold = Color(0xFFFFC107)

/**
 * Reusable, read-only reviews section (ANDP-035) embeddable in any detail
 * screen. Loads reviews + aggregate for `(contentType, contentId)` via its
 * own Hilt ViewModel. Mirrors iOS ReviewsSection.
 *
 * `contentType` must be a valid `content_type` enum value
 * ("event" / "restaurant" / "attraction" / "playground").
 */
@Composable
fun ReviewsSection(
    contentType: String,
    contentId: String,
    modifier: Modifier = Modifier,
) {
    val viewModel: ReviewsViewModel = hiltViewModel(key = "reviews-$contentType-$contentId")
    val state by viewModel.uiState.collectAsStateWithLifecycle()

    LaunchedEffect(contentType, contentId) {
        viewModel.load(contentType, contentId)
    }

    Column(modifier = modifier.fillMaxWidth().padding(horizontal = 16.dp)) {
        ReviewsHeader(aggregate = state.aggregate)
        Spacer(Modifier.height(10.dp))

        when {
            state.isLoading -> Box(
                modifier = Modifier.fillMaxWidth().padding(vertical = 16.dp),
                contentAlignment = Alignment.Center,
            ) {
                CircularProgressIndicator(modifier = Modifier.size(28.dp))
            }

            state.errorMessage != null -> RetryBanner(state.errorMessage!!, onRetry = viewModel::retry)

            state.isEmpty -> Text(
                text = "No reviews yet. Be the first to share your experience.",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(vertical = 8.dp),
            )

            else -> Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                state.reviews.forEach { review ->
                    ReviewRow(review = review, currentUserId = state.currentUserId)
                }
            }
        }
    }
}

@Composable
private fun ReviewsHeader(aggregate: RatingAggregate?) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        Text(
            text = "Reviews",
            style = MaterialTheme.typography.titleMedium,
            fontWeight = FontWeight.Bold,
        )
        Spacer(Modifier.weight(1f))
        if (aggregate != null && aggregate.hasRatings) {
            Icon(Icons.Filled.Star, contentDescription = null, tint = StarGold, modifier = Modifier.size(18.dp))
            Spacer(Modifier.width(4.dp))
            Text(
                text = aggregate.averageLabel,
                style = MaterialTheme.typography.titleSmall,
                fontWeight = FontWeight.SemiBold,
            )
            Spacer(Modifier.width(4.dp))
            Text(
                text = "(${aggregate.totalRatings})",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

@Composable
private fun ReviewRow(review: Review, currentUserId: String?) {
    Column(modifier = Modifier.fillMaxWidth()) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            RatingStars(rating = review.ratingValue)
            Spacer(Modifier.weight(1f))
            review.formattedDate?.let { date ->
                Text(
                    text = date,
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }

        if (review.hasText) {
            Spacer(Modifier.height(4.dp))
            Text(
                text = review.reviewText!!.trim(),
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurface,
            )
        }

        Spacer(Modifier.height(4.dp))
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(
                text = review.authorName(currentUserId),
                style = MaterialTheme.typography.labelMedium,
                fontWeight = FontWeight.Medium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            if (review.isVerifiedReviewer) {
                Spacer(Modifier.width(4.dp))
                Icon(
                    Icons.Filled.Verified,
                    contentDescription = "Verified reviewer",
                    tint = MaterialTheme.colorScheme.primary,
                    modifier = Modifier.size(14.dp),
                )
            }
        }

        Spacer(Modifier.height(12.dp))
        HorizontalDivider()
    }
}

@Composable
private fun RatingStars(rating: Int) {
    Row(horizontalArrangement = Arrangement.spacedBy(2.dp)) {
        for (star in 1..5) {
            Icon(
                imageVector = if (star <= rating) Icons.Filled.Star else Icons.Filled.StarOutline,
                contentDescription = null,
                tint = if (star <= rating) StarGold else Color.Gray.copy(alpha = 0.3f),
                modifier = Modifier.size(16.dp),
            )
        }
    }
}

@Composable
private fun RetryBanner(message: String, onRetry: () -> Unit) {
    Surface(
        modifier = Modifier.fillMaxWidth().padding(vertical = 8.dp),
        shape = MaterialTheme.shapes.medium,
        color = MaterialTheme.colorScheme.errorContainer,
    ) {
        Row(modifier = Modifier.padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
            Text(
                message,
                color = MaterialTheme.colorScheme.onErrorContainer,
                style = MaterialTheme.typography.bodySmall,
                modifier = Modifier.weight(1f),
            )
            TextButton(onClick = onRetry) { Text("Retry") }
        }
    }
}
