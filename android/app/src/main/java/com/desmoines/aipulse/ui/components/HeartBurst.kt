package com.desmoines.aipulse.ui.components

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.drawscope.withTransform
import com.desmoines.aipulse.util.rememberShouldReduceAnimations
import kotlin.math.cos
import kotlin.math.sin

/**
 * Heart-burst micro-interaction for favorite toggles. Renders six heart
 * particles that radiate from a central point and fade out, and scales the
 * host content with a spring when [triggerKey] changes.
 *
 * Respects the user's animator duration scale via
 * [rememberShouldReduceAnimations] so users on reduce-motion see an instant
 * state swap with no particles.
 *
 * Mirrors iOS HeartBurstView.swift.
 *
 * Usage:
 * ```
 * var burst by remember { mutableStateOf(0) }
 * HeartBurst(triggerKey = burst) {
 *     IconButton(onClick = { isFav = !isFav; if (isFav) burst++ }) {
 *         Icon(Icons.Filled.Favorite, contentDescription = null)
 *     }
 * }
 * ```
 */
@Composable
fun HeartBurst(
    triggerKey: Int,
    modifier: Modifier = Modifier,
    content: @Composable () -> Unit,
) {
    val reduceMotion = rememberShouldReduceAnimations()
    val progress = remember { Animatable(0f) }
    val scale by animateFloatAsState(
        targetValue = if (triggerKey > 0 && !reduceMotion) 1f else 0f,
        animationSpec = spring(dampingRatio = 0.55f, stiffness = 400f),
        label = "heartScale",
    )

    LaunchedEffect(triggerKey) {
        if (triggerKey == 0 || reduceMotion) return@LaunchedEffect
        progress.snapTo(0f)
        progress.animateTo(
            targetValue = 1f,
            animationSpec = tween(durationMillis = 550),
        )
    }

    Box(modifier = modifier) {
        if (!reduceMotion && progress.value > 0f && progress.value < 1f) {
            Canvas(modifier = Modifier.fillMaxSize()) {
                val center = Offset(size.width / 2f, size.height / 2f)
                val distance = 28f * progress.value
                val particleAlpha = 1f - progress.value
                val particleScale = 1f - progress.value * 0.4f

                repeat(6) { index ->
                    val angle = index * (Math.PI * 2.0 / 6.0)
                    val offset = Offset(
                        x = center.x + cos(angle).toFloat() * distance,
                        y = center.y + sin(angle).toFloat() * distance,
                    )
                    withTransform({
                        translate(offset.x - center.x, offset.y - center.y)
                        scale(particleScale, particleScale, pivot = center)
                    }) {
                        drawPath(
                            path = heartPath(center, size = 10f),
                            color = Color.Red.copy(alpha = particleAlpha),
                        )
                    }
                }
            }
        }
        Box(modifier = Modifier
            .fillMaxSize()
            .let { base ->
                if (reduceMotion) base else base
            }
        ) {
            content()
        }
    }
}

/** Builds a small heart [Path] centered on [center]. */
private fun heartPath(center: Offset, size: Float): Path {
    val path = Path()
    val topCurveHeight = size * 0.3f
    path.moveTo(center.x, center.y + topCurveHeight)
    path.cubicTo(
        center.x - size * 1.2f, center.y - size * 0.8f,
        center.x - size * 0.5f, center.y - size * 1.5f,
        center.x, center.y - size * 0.4f,
    )
    path.cubicTo(
        center.x + size * 0.5f, center.y - size * 1.5f,
        center.x + size * 1.2f, center.y - size * 0.8f,
        center.x, center.y + topCurveHeight,
    )
    path.close()
    return path
}
