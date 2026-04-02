package com.desmoines.aipulse.ui.components

import android.provider.Settings
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.tween
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.composed
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.platform.LocalContext

/**
 * Staggered fade-in + slide-up entrance animation for list items.
 * Mirrors iOS entranceAnimation(index:) view modifier.
 *
 * - 0.35s easeOut animation per item
 * - 0.05s stagger delay per index (capped at 10 items)
 * - Slides up 24dp while fading in
 * - Respects Android reduce motion accessibility setting
 * - Only plays on initial appearance (Animatable starts at 0)
 */
fun Modifier.entranceAnimation(index: Int): Modifier = composed {
    val context = LocalContext.current

    // Check reduce motion setting (ANIMATOR_DURATION_SCALE = 0 means animations disabled)
    val reduceMotion = try {
        Settings.Global.getFloat(
            context.contentResolver,
            Settings.Global.ANIMATOR_DURATION_SCALE,
            1f,
        ) == 0f
    } catch (_: Exception) {
        false
    }

    if (reduceMotion) {
        return@composed this
    }

    val animatable = remember { Animatable(0f) }

    LaunchedEffect(Unit) {
        // Stagger delay: 50ms per index, capped at 10
        val staggerDelay = (index.coerceAtMost(10)) * 50

        animatable.animateTo(
            targetValue = 1f,
            animationSpec = tween(
                durationMillis = 350,
                delayMillis = staggerDelay,
                easing = FastOutSlowInEasing,
            ),
        )
    }

    this.graphicsLayer {
        alpha = animatable.value
        translationY = (1f - animatable.value) * 60f // 24dp * density ~= 60px
    }
}
