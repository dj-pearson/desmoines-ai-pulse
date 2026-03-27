package com.desmoines.aipulse.ui.components

import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import com.desmoines.aipulse.ui.theme.DesMoinesInsiderTheme
import com.desmoines.aipulse.ui.theme.Dimens

/**
 * Full-screen loading indicator with optional message.
 * Mirrors iOS LoadingView.swift.
 */
@Composable
fun LoadingView(
    modifier: Modifier = Modifier,
    message: String = "Loading..."
) {
    Column(
        modifier = modifier.fillMaxSize(),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        CircularProgressIndicator(
            modifier = Modifier.size(48.dp),
            color = MaterialTheme.colorScheme.primary
        )
        Spacer(modifier = Modifier.height(Dimens.SpacingLg))
        Text(
            text = message,
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
    }
}

/**
 * Inline loading indicator for "load more" in lists.
 * Mirrors iOS InlineLoadingView.
 */
@Composable
fun InlineLoadingView(
    modifier: Modifier = Modifier
) {
    Row(
        modifier = modifier
            .fillMaxWidth()
            .padding(Dimens.SpacingLg),
        horizontalArrangement = Arrangement.Center,
        verticalAlignment = Alignment.CenterVertically
    ) {
        CircularProgressIndicator(
            modifier = Modifier.size(16.dp),
            strokeWidth = 2.dp,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
        Spacer(modifier = Modifier.width(Dimens.SpacingSm))
        Text(
            text = "Loading more...",
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
    }
}

/**
 * Skeleton placeholder for detail page hero sections with shimmer animation.
 * Mirrors iOS DetailHeroSkeleton.
 */
@Composable
fun DetailHeroSkeleton(
    modifier: Modifier = Modifier
) {
    val shimmerColors = listOf(
        MaterialTheme.colorScheme.surfaceVariant,
        MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f),
        MaterialTheme.colorScheme.surfaceVariant
    )

    val transition = rememberInfiniteTransition(label = "shimmer")
    val translateAnim by transition.animateFloat(
        initialValue = 0f,
        targetValue = 1000f,
        animationSpec = infiniteRepeatable(
            animation = tween(durationMillis = 1200, easing = LinearEasing),
            repeatMode = RepeatMode.Restart
        ),
        label = "shimmerTranslate"
    )

    val brush = Brush.linearGradient(
        colors = shimmerColors,
        start = Offset(translateAnim - 500f, 0f),
        end = Offset(translateAnim, 0f)
    )

    Column(modifier = modifier) {
        // Hero image area
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .height(Dimens.HeroImageHeight)
                .background(brush)
        ) {
            // Title/badge placeholders at bottom
            Column(
                modifier = Modifier
                    .align(Alignment.BottomStart)
                    .padding(Dimens.SpacingLg)
            ) {
                // Category badge placeholder
                Box(
                    modifier = Modifier
                        .width(80.dp)
                        .height(24.dp)
                        .clip(RoundedCornerShape(6.dp))
                        .background(Color.Gray.copy(alpha = 0.3f))
                )
                Spacer(modifier = Modifier.height(Dimens.SpacingSm))
                // Title line 1
                Box(
                    modifier = Modifier
                        .width(240.dp)
                        .height(22.dp)
                        .clip(RoundedCornerShape(4.dp))
                        .background(Color.Gray.copy(alpha = 0.3f))
                )
                Spacer(modifier = Modifier.height(Dimens.SpacingSm))
                // Title line 2
                Box(
                    modifier = Modifier
                        .width(160.dp)
                        .height(22.dp)
                        .clip(RoundedCornerShape(4.dp))
                        .background(Color.Gray.copy(alpha = 0.3f))
                )
            }
        }
    }
}

@Preview(showBackground = true)
@Composable
private fun LoadingViewPreview() {
    DesMoinesInsiderTheme {
        LoadingView()
    }
}

@Preview(showBackground = true)
@Composable
private fun InlineLoadingViewPreview() {
    DesMoinesInsiderTheme {
        InlineLoadingView()
    }
}

@Preview(showBackground = true)
@Composable
private fun DetailHeroSkeletonPreview() {
    DesMoinesInsiderTheme {
        DetailHeroSkeleton()
    }
}
