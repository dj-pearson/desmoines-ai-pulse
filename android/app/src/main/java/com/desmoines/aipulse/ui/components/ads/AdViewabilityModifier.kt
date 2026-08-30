package com.desmoines.aipulse.ui.components.ads

import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.composed
import androidx.compose.ui.layout.LayoutCoordinates
import androidx.compose.ui.layout.boundsInWindow
import androidx.compose.ui.layout.onGloballyPositioned
import kotlinx.coroutines.delay

private const val VIEWABLE_FRACTION = 0.5f
private const val VIEWABLE_DWELL_MS = 1000L

/**
 * Fires [onImpression] once when this composable has been ≥50% on-screen for a
 * continuous ≥1s (the IAB-style viewability bar, with the iOS screen-bounds
 * fix). Resets when [key] changes (e.g. a new creative). Mirrors iOS
 * AdViewabilityModifier.
 */
fun Modifier.trackAdViewability(key: Any?, onImpression: () -> Unit): Modifier = composed {
    var fired by remember(key) { mutableStateOf(false) }
    var visibleEnough by remember(key) { mutableStateOf(false) }

    LaunchedEffect(visibleEnough, key) {
        if (visibleEnough && !fired) {
            delay(VIEWABLE_DWELL_MS)
            if (visibleEnough && !fired) {
                fired = true
                onImpression()
            }
        }
    }

    if (fired) {
        this
    } else {
        this.onGloballyPositioned { coords ->
            visibleEnough = visibleFraction(coords) >= VIEWABLE_FRACTION
        }
    }
}

/** Fraction of the composable currently within the window bounds (0..1). */
private fun visibleFraction(coords: LayoutCoordinates): Float {
    if (!coords.isAttached) return 0f
    val size = coords.size
    if (size.width == 0 || size.height == 0) return 0f
    val bounds = coords.boundsInWindow()
    val visibleArea = bounds.width.coerceAtLeast(0f) * bounds.height.coerceAtLeast(0f)
    val totalArea = size.width.toFloat() * size.height.toFloat()
    return (visibleArea / totalArea).coerceIn(0f, 1f)
}
