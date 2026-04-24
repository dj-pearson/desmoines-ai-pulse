package com.desmoines.aipulse.ui.theme

import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.unit.Dp

/**
 * Applies a layered premium shadow matching iOS `View.premiumShadow()`.
 *
 * Compose only exposes a single shadow call, but we combine ambient and key
 * colors via two chained shadow modifiers (clipped to the same shape) to
 * approximate a layered drop shadow with depth.
 */
@Composable
fun Modifier.premiumShadow(
    elevation: Dp = PremiumTokens.Elevation4,
    shape: Shape = RoundedCornerShape(PremiumTokens.CornerMd),
): Modifier = this
    .shadow(
        elevation = elevation,
        shape = shape,
        ambientColor = PremiumTokens.ShadowAmbient,
        spotColor = PremiumTokens.ShadowKey,
        clip = false,
    )

/** Convenience: premium surface shadow that also respects the theme. */
@Composable
fun Modifier.premiumCardShadow(
    elevation: Dp = PremiumTokens.Elevation4,
): Modifier {
    val shape = MaterialTheme.shapes.medium
    return premiumShadow(elevation = elevation, shape = shape)
}
