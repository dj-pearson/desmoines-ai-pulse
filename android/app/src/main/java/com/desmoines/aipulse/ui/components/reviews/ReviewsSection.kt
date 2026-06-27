package com.desmoines.aipulse.ui.components.reviews

import android.widget.Toast
import androidx.compose.foundation.clickable
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
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.Flag
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material.icons.filled.RateReview
import androidx.compose.material.icons.filled.Star
import androidx.compose.material.icons.filled.StarOutline
import androidx.compose.material.icons.filled.Verified
import androidx.compose.material.icons.outlined.Delete
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.desmoines.aipulse.data.model.RatingAggregate
import com.desmoines.aipulse.data.model.Review

private val StarGold = Color(0xFFFFC107)

/**
 * Reusable reviews section (ANDP-035 read + ANDP-036 write) embeddable in any
 * detail screen. Loads reviews + aggregate for `(contentType, contentId)` via
 * its own Hilt ViewModel and gates writing to authenticated Insider+ users.
 *
 * `contentType` must be a valid `content_type` enum value
 * ("event" / "restaurant" / "attraction" / "playground").
 *
 * @param onNavigateToSubscription invoked when a non-premium user taps "Write a review".
 * @param onNavigateToAuth invoked when a signed-out user taps "Write a review" / "Report".
 */
@Composable
fun ReviewsSection(
    contentType: String,
    contentId: String,
    modifier: Modifier = Modifier,
    onNavigateToSubscription: () -> Unit = {},
    onNavigateToAuth: () -> Unit = {},
) {
    val viewModel: ReviewsViewModel = hiltViewModel(key = "reviews-$contentType-$contentId")
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    val context = LocalContext.current

    LaunchedEffect(contentType, contentId) {
        viewModel.load(contentType, contentId)
    }

    // One-shot toast.
    LaunchedEffect(state.toastMessage) {
        state.toastMessage?.let {
            Toast.makeText(context, it, Toast.LENGTH_SHORT).show()
            viewModel.consumeToast()
        }
    }

    // One-shot gate navigation.
    LaunchedEffect(state.navEvent) {
        when (state.navEvent) {
            ReviewsNavEvent.REQUIRE_AUTH -> onNavigateToAuth()
            ReviewsNavEvent.REQUIRE_PAYWALL -> onNavigateToSubscription()
            null -> Unit
        }
        if (state.navEvent != null) viewModel.consumeNavEvent()
    }

    Column(modifier = modifier.fillMaxWidth().padding(horizontal = 16.dp)) {
        ReviewsHeader(aggregate = state.aggregate)
        Spacer(Modifier.height(8.dp))

        WriteReviewButton(
            isEditing = state.userReview != null,
            onClick = viewModel::onWriteReviewClicked,
        )
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
                    val isOwn = review.userId == state.currentUserId
                    ReviewRow(
                        review = review,
                        currentUserId = state.currentUserId,
                        isOwn = isOwn,
                        onEdit = viewModel::onWriteReviewClicked,
                        onDelete = viewModel::requestDeleteOwnReview,
                        onReport = { viewModel.reportReview(review.id) },
                    )
                }
            }
        }
    }

    if (state.isComposerVisible) {
        ReviewComposerDialog(
            isEditing = state.isEditing,
            rating = state.draftRating,
            text = state.draftText,
            isSubmitting = state.isSubmitting,
            canSubmit = state.canSubmit,
            onRatingChange = viewModel::onDraftRatingChanged,
            onTextChange = viewModel::onDraftTextChanged,
            onSubmit = viewModel::submitReview,
            onDismiss = viewModel::dismissComposer,
        )
    }

    if (state.showDeleteConfirm) {
        AlertDialog(
            onDismissRequest = viewModel::dismissDeleteConfirm,
            title = { Text("Delete your review?") },
            text = { Text("This permanently removes your rating and review for this listing.") },
            confirmButton = {
                TextButton(onClick = viewModel::confirmDeleteOwnReview) { Text("Delete") }
            },
            dismissButton = {
                TextButton(onClick = viewModel::dismissDeleteConfirm) { Text("Cancel") }
            },
        )
    }
}

@Composable
private fun WriteReviewButton(isEditing: Boolean, onClick: () -> Unit) {
    OutlinedButton(onClick = onClick, modifier = Modifier.fillMaxWidth()) {
        Icon(Icons.Filled.RateReview, contentDescription = null, modifier = Modifier.size(18.dp))
        Spacer(Modifier.width(8.dp))
        Text(if (isEditing) "Edit your review" else "Write a review")
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
private fun ReviewRow(
    review: Review,
    currentUserId: String?,
    isOwn: Boolean,
    onEdit: () -> Unit,
    onDelete: () -> Unit,
    onReport: () -> Unit,
) {
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
            ReviewRowMenu(isOwn = isOwn, onEdit = onEdit, onDelete = onDelete, onReport = onReport)
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
private fun ReviewRowMenu(
    isOwn: Boolean,
    onEdit: () -> Unit,
    onDelete: () -> Unit,
    onReport: () -> Unit,
) {
    var expanded by remember { mutableStateOf(false) }
    Box {
        IconButton(onClick = { expanded = true }, modifier = Modifier.size(28.dp)) {
            Icon(
                Icons.Filled.MoreVert,
                contentDescription = if (isOwn) "Review options" else "Report review",
                tint = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.size(18.dp),
            )
        }
        DropdownMenu(expanded = expanded, onDismissRequest = { expanded = false }) {
            if (isOwn) {
                DropdownMenuItem(
                    text = { Text("Edit") },
                    leadingIcon = { Icon(Icons.Filled.Edit, contentDescription = null) },
                    onClick = { expanded = false; onEdit() },
                )
                DropdownMenuItem(
                    text = { Text("Delete") },
                    leadingIcon = { Icon(Icons.Outlined.Delete, contentDescription = null) },
                    onClick = { expanded = false; onDelete() },
                )
            } else {
                DropdownMenuItem(
                    text = { Text("Report") },
                    leadingIcon = { Icon(Icons.Filled.Flag, contentDescription = null) },
                    onClick = { expanded = false; onReport() },
                )
            }
        }
    }
}

@Composable
private fun ReviewComposerDialog(
    isEditing: Boolean,
    rating: Int,
    text: String,
    isSubmitting: Boolean,
    canSubmit: Boolean,
    onRatingChange: (Int) -> Unit,
    onTextChange: (String) -> Unit,
    onSubmit: () -> Unit,
    onDismiss: () -> Unit,
) {
    AlertDialog(
        onDismissRequest = { if (!isSubmitting) onDismiss() },
        title = { Text(if (isEditing) "Edit your review" else "Write a review") },
        text = {
            Column {
                Text("Your rating", style = MaterialTheme.typography.labelLarge)
                Spacer(Modifier.height(6.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                    for (star in 1..5) {
                        Icon(
                            imageVector = if (star <= rating) Icons.Filled.Star else Icons.Filled.StarOutline,
                            contentDescription = "$star star${if (star == 1) "" else "s"}",
                            tint = if (star <= rating) StarGold else Color.Gray.copy(alpha = 0.4f),
                            modifier = Modifier
                                .size(32.dp)
                                .clickable(enabled = !isSubmitting) { onRatingChange(star) },
                        )
                    }
                }
                Spacer(Modifier.height(12.dp))
                OutlinedTextField(
                    value = text,
                    onValueChange = onTextChange,
                    modifier = Modifier.fillMaxWidth(),
                    placeholder = { Text("Share your experience (optional)") },
                    enabled = !isSubmitting,
                    minLines = 3,
                )
            }
        },
        confirmButton = {
            TextButton(onClick = onSubmit, enabled = canSubmit) {
                if (isSubmitting) {
                    CircularProgressIndicator(modifier = Modifier.size(18.dp))
                } else {
                    Text(if (isEditing) "Update" else "Submit")
                }
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss, enabled = !isSubmitting) { Text("Cancel") }
        },
    )
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
