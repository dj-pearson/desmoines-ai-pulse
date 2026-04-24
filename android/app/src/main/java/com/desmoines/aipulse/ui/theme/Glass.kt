package com.desmoines.aipulse.ui.theme

import android.content.Context
import android.os.Build
import android.os.PowerManager
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.blur
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp

/**
 * Glass intensity controls how much tint + border weight a glass surface uses.
 * Kept in parity with iOS `View+Glass.swift` GlassIntensity.
 */
enum class GlassIntensity {
    /** Primary surfaces: cards (events, restaurants, attractions). */
    Card,

    /** Smallest surfaces: filter chips, toggle pills, badges. */
    Chip,

    /** Floating bars: bottom nav, FABs, scroll-to-top. */
    Bar,

    /** Surfaces painted directly on top of imagery. */
    Overlay,
}

/**
 * Applies the shared glassmorphism look — translucent tint + hairline border +
 * layered shadow on a rounded shape. Compose does not expose a real backdrop
 * blur across API levels, so we approximate the "frosted glass" look with a
 * softly tinted surface and let a parent `Modifier.blur()` (optional) on the
 * content beneath do the rest on Android 12+.
 *
 * Mirrors iOS `.glassCard`, `.glassChip`, `.glassBar`, `.glassOverlay` modifiers.
 */
@Composable
fun Modifier.glassSurface(
    shape: Shape = MaterialTheme.shapes.large,
    intensity: GlassIntensity = GlassIntensity.Card,
    elevation: Dp = when (intensity) {
        GlassIntensity.Card -> PremiumTokens.Elevation4
        GlassIntensity.Chip -> PremiumTokens.Elevation1
        GlassIntensity.Bar -> PremiumTokens.Elevation8
        GlassIntensity.Overlay -> PremiumTokens.Elevation0
    },
): Modifier {
    val dark = isSystemInDarkTheme()
    val tint = when (intensity) {
        GlassIntensity.Card -> if (dark) PremiumTokens.GlassTintDark else PremiumTokens.GlassTintLight
        GlassIntensity.Chip -> if (dark) Color(0x0FFFFFFF) else Color(0x73FFFFFF)
        GlassIntensity.Bar -> if (dark) Color(0x59000000) else Color(0x8CFFFFFF)
        GlassIntensity.Overlay -> Color.Transparent
    }
    val borderBrush = Brush.verticalGradient(
        colors = listOf(
            if (dark) PremiumTokens.GlassBorderDark else PremiumTokens.GlassBorderLight,
            if (dark) Color(0x05FFFFFF) else Color(0x2DFFFFFF),
        )
    )
    val borderWidth = when (intensity) {
        GlassIntensity.Card, GlassIntensity.Bar -> 1.dp
        GlassIntensity.Chip, GlassIntensity.Overlay -> 0.5.dp
    }

    return this
        .then(if (elevation > 0.dp) Modifier.premiumShadow(elevation = elevation, shape = shape) else Modifier)
        .clip(shape)
        .background(tint)
        .border(BorderStroke(borderWidth, borderBrush), shape)
}

/**
 * Composable wrapper around `Modifier.glassSurface` that also paints a bottom
 * highlight (a subtle lit edge) — useful when you want the content you compose
 * inside the box to sit on a clearly defined "lifted glass" panel.
 */
@Composable
fun GlassCard(
    modifier: Modifier = Modifier,
    shape: Shape = RoundedCornerShape(PremiumTokens.CornerLg),
    intensity: GlassIntensity = GlassIntensity.Card,
    elevation: Dp = PremiumTokens.Elevation4,
    content: @Composable () -> Unit,
) {
    Box(
        modifier = modifier
            .glassSurface(shape = shape, intensity = intensity, elevation = elevation)
    ) {
        // Top lit highlight: thin gradient at the top of the surface
        Box(
            modifier = Modifier
                .fillMaxSize()
                .padding(1.dp)
        ) {
            content()
        }
    }
}

/**
 * Tri-state for Android 12+ runtime blur availability. Callers can check
 * whether a real `Modifier.blur()` is safe to use before enabling it for a
 * surface that expects true backdrop blur. On older devices glass falls back
 * to translucent tint + border.
 */
object GlassCapabilities {
    val supportsBackdropBlur: Boolean
        get() = Build.VERSION.SDK_INT >= Build.VERSION_CODES.S

    /** Reads the system battery-saver state and returns true when power-save is on. */
    fun isInPowerSaveMode(context: Context): Boolean {
        val pm = context.getSystemService(Context.POWER_SERVICE) as? PowerManager ?: return false
        return pm.isPowerSaveMode
    }
}

/**
 * Applies a real [Modifier.blur] to a content layer on devices that support it
 * (API 31+), with a graceful no-op on older devices. Use on a background or
 * sibling layer *behind* a glass surface when you want a true frosted-backdrop
 * look — for example, a wallpaper-style hero image layered under a
 * translucent `GlassCard` title panel.
 *
 * Note: [Modifier.blur] operates on the compositing layer itself, so this
 * should be applied to the layer you want blurred (e.g., the image), not the
 * glass surface sitting on top of it.
 */
@Composable
fun Modifier.glassBackdropBlur(
    radius: androidx.compose.ui.unit.Dp = 24.dp,
): Modifier {
    if (!GlassCapabilities.supportsBackdropBlur) return this
    // Respect the user's battery-saver preference — a full-viewport
    // RenderEffect blur is one of the most expensive GPU operations we run,
    // and battery-saver explicitly signals "reduce visual polish".
    val context = LocalContext.current
    if (GlassCapabilities.isInPowerSaveMode(context)) return this
    return this.blur(radius = radius)
}
