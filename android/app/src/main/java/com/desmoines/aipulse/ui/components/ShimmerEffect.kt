package com.desmoines.aipulse.ui.components

import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import com.desmoines.aipulse.util.rememberShouldReduceAnimations

/**
 * Creates a shimmer brush for skeleton loading placeholders.
 * Respects the system "reduce animations" / ANIMATOR_DURATION_SCALE setting.
 * When animations are disabled, returns a static gradient.
 *
 * Mirrors iOS shimmer loading patterns across EventCardSkeleton,
 * RestaurantCardSkeleton, and DetailHeroSkeleton.
 *
 * @param durationMillis Duration of one shimmer sweep in milliseconds (default 1200).
 * @param targetValue The distance the shimmer travels (default 1000f).
 */
@Composable
fun rememberShimmerBrush(
    durationMillis: Int = 1200,
    targetValue: Float = 1000f,
): Brush {
    val reduceAnimations = rememberShouldReduceAnimations()
    val surfaceVariant = MaterialTheme.colorScheme.surfaceVariant

    return if (reduceAnimations) {
        // Static background when animations are disabled
        Brush.linearGradient(colors = listOf(surfaceVariant, surfaceVariant))
    } else {
        val shimmerColors = listOf(
            surfaceVariant,
            surfaceVariant.copy(alpha = 0.5f),
            surfaceVariant,
        )
        val transition = rememberInfiniteTransition(label = "shimmer")
        val translateAnim by transition.animateFloat(
            initialValue = 0f,
            targetValue = targetValue,
            animationSpec = infiniteRepeatable(
                animation = tween(durationMillis = durationMillis, easing = LinearEasing),
                repeatMode = RepeatMode.Restart,
            ),
            label = "shimmerTranslate",
        )
        Brush.linearGradient(
            colors = shimmerColors,
            start = Offset(translateAnim - (targetValue / 2f), 0f),
            end = Offset(translateAnim, 0f),
        )
    }
}
