package com.desmoines.aipulse.ui.components

import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.unit.dp
import com.desmoines.aipulse.ui.theme.PremiumTokens

/**
 * Branded pull-to-refresh indicator matching iOS BrandedRefreshView.
 *
 * Shows a rotating stroke arc on a gradient pill. Use as the `indicator`
 * slot of a Material 3 PullToRefreshBox or inside a custom refresh hook.
 *
 * @param progress 0..1 — while the user is dragging below the threshold
 * @param isRefreshing true once the refresh has been triggered
 */
@Composable
fun BrandedRefreshIndicator(
    progress: Float,
    isRefreshing: Boolean,
    modifier: Modifier = Modifier,
) {
    // Continuous spin while refreshing
    val transition = rememberInfiniteTransition(label = "refresh-spin")
    val spin by transition.animateFloat(
        initialValue = 0f,
        targetValue = 360f,
        animationSpec = infiniteRepeatable(
            animation = tween(durationMillis = 900, easing = LinearEasing),
        ),
        label = "refresh-spin-angle",
    )

    // During drag, rotate in proportion to the progress
    val dragRotation by animateFloatAsState(
        targetValue = progress * 360f,
        label = "refresh-drag-rotation",
    )

    val rotation = if (isRefreshing) spin else dragRotation
    val color = MaterialTheme.colorScheme.primary

    Box(
        modifier = modifier
            .size(40.dp)
            .clip(CircleShape)
            .background(MaterialTheme.colorScheme.surface),
        contentAlignment = Alignment.Center,
    ) {
        Canvas(
            modifier = Modifier
                .size(24.dp)
                .rotate(rotation),
        ) {
            val strokeWidth = 3.dp.toPx()
            val inset = strokeWidth / 2
            drawArc(
                brush = PremiumTokens.BrandGradient,
                startAngle = -90f,
                // Arc grows with drag progress; full 270deg when refreshing
                sweepAngle = if (isRefreshing) 270f else (progress.coerceIn(0f, 1f) * 270f),
                useCenter = false,
                topLeft = Offset(inset, inset),
                size = androidx.compose.ui.geometry.Size(
                    width = size.width - strokeWidth,
                    height = size.height - strokeWidth,
                ),
                style = Stroke(width = strokeWidth, cap = StrokeCap.Round),
            )
        }
    }
}
