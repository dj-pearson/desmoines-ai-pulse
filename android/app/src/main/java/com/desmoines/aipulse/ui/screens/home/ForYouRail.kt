package com.desmoines.aipulse.ui.screens.home

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.desmoines.aipulse.data.model.Recommendation
import com.desmoines.aipulse.data.repository.ForYouSource
import com.desmoines.aipulse.ui.components.CachedAsyncImage

/**
 * Home rail of personalized ("For You") or cold-start ("Trending now") event
 * recommendations. Mirrors iOS ForYouRail. Self-contained: owns its ViewModel.
 * Renders nothing when empty; a spinner while first loading.
 */
@Composable
fun ForYouRail(
    onNavigateToEvent: (String) -> Unit,
    modifier: Modifier = Modifier,
    viewModel: ForYouViewModel = hiltViewModel(),
) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()

    LaunchedEffect(Unit) { viewModel.loadIfNeeded() }

    when {
        state.isLoading && !state.hasContent -> {
            Box(
                modifier = modifier
                    .fillMaxWidth()
                    .height(160.dp),
                contentAlignment = Alignment.Center,
            ) {
                CircularProgressIndicator()
            }
        }

        !state.hasContent -> Unit // hidden — no header, no error UI (matches iOS)

        else -> {
            Column(modifier = modifier.fillMaxWidth().padding(vertical = 8.dp)) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 16.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(
                        text = if (state.source == ForYouSource.FOR_YOU) "For You" else "Trending now",
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.Bold,
                        modifier = Modifier.weight(1f),
                    )
                    IconButton(
                        onClick = viewModel::refresh,
                        enabled = !state.isLoading,
                    ) {
                        Icon(Icons.Filled.Refresh, contentDescription = "Refresh recommendations")
                    }
                }

                LazyRow(
                    contentPadding = PaddingValues(horizontal = 16.dp),
                    horizontalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    items(state.items, key = { it.id }) { recommendation ->
                        ForYouCard(
                            recommendation = recommendation,
                            onClick = { onNavigateToEvent(recommendation.id) },
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun ForYouCard(recommendation: Recommendation, onClick: () -> Unit) {
    Column(
        modifier = Modifier
            .width(200.dp)
            .clickable(onClick = onClick),
    ) {
        CachedAsyncImage(
            url = recommendation.imageUrl,
            contentDescription = recommendation.title,
            modifier = Modifier
                .width(200.dp)
                .height(120.dp)
                .clip(RoundedCornerShape(12.dp)),
        )
        Text(
            text = recommendation.title ?: "Untitled",
            style = MaterialTheme.typography.titleSmall,
            fontWeight = FontWeight.SemiBold,
            maxLines = 2,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.padding(top = 6.dp),
        )
        recommendation.recommendationReason?.takeIf { it.isNotBlank() }?.let { reason ->
            Text(
                text = reason,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.padding(top = 2.dp),
            )
        }
    }
}
