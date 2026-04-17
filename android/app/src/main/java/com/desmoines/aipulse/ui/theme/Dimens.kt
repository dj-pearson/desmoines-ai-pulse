package com.desmoines.aipulse.ui.theme

import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp

/**
 * Standard spacing values used throughout the app.
 * Provides consistent spacing scale following Material Design guidelines.
 */
object Dimens {
    val SpacingXxs = 2.dp
    val SpacingXs = 4.dp
    val SpacingSm = 8.dp
    val SpacingMd = 12.dp
    val SpacingLg = 16.dp
    val SpacingXl = 24.dp
    val SpacingXxl = 32.dp
    val SpacingXxxl = 48.dp

    // Component-specific dimensions
    val CardElevation = 2.dp
    val CardCornerRadius = 12.dp
    val IconSizeSmall = 16.dp
    val IconSizeMedium = 24.dp
    val IconSizeLarge = 32.dp
    val ButtonHeight = 48.dp
    val BottomBarHeight = 80.dp
    val HeroImageHeight = 300.dp
    val FeaturedCardWidth = 260.dp
    val CompactCardWidth = 180.dp
    val BadgeCornerRadius = 16.dp
}

/**
 * Premium design tokens shared across iOS (PremiumTokens.swift) and Android.
 * Keep values in sync with ios/DesMoinesInsider/Configuration/PremiumTokens.swift.
 *
 * Provides a single source of truth for elevation, corner radii, gradients,
 * and motion durations so both platforms render identically.
 */
object PremiumTokens {
    // Elevation scale (ambient shadow dp)
    val Elevation0 = 0.dp
    val Elevation1 = 1.dp
    val Elevation2 = 2.dp
    val Elevation4 = 4.dp
    val Elevation8 = 8.dp
    val Elevation16 = 16.dp

    // Corner radii
    val CornerSm = 8.dp
    val CornerMd = 12.dp
    val CornerLg = 20.dp
    val CornerXl = 28.dp

    val ShapeSm = RoundedCornerShape(CornerSm)
    val ShapeMd = RoundedCornerShape(CornerMd)
    val ShapeLg = RoundedCornerShape(CornerLg)
    val ShapeXl = RoundedCornerShape(CornerXl)

    // Motion durations (ms) — match iOS withAnimation(.easeOut(duration:))
    const val MotionFastMs = 150
    const val MotionBaseMs = 280
    const val MotionSlowMs = 450

    // Premium gold gradient for VIP accents (must match iOS premiumGoldGradient)
    val GoldStart = Color(0xFFF6D365)
    val GoldMid = Color(0xFFE9B949)
    val GoldEnd = Color(0xFFB8860B)

    val PremiumGoldGradient: Brush = Brush.linearGradient(
        colors = listOf(GoldStart, GoldMid, GoldEnd)
    )

    // Signature brand gradient for hero / CTA surfaces
    val BrandGradientStart = Color(0xFF7C3AED)
    val BrandGradientEnd = Color(0xFF2563EB)
    val BrandGradient: Brush = Brush.linearGradient(
        colors = listOf(BrandGradientStart, BrandGradientEnd)
    )

    // Shadow color for light mode layered shadows
    val ShadowKey = Color(0x26000000)     // ~15% black
    val ShadowAmbient = Color(0x0F000000) // ~6% black

    // Glassmorphism — keep in sync with iOS View+Glass.swift
    // Background tints painted on top of the Material blur.
    val GlassTintLight = Color(0x59FFFFFF)  // ~35% white
    val GlassTintDark = Color(0x47000000)   // ~28% black
    val GlassBorderLight = Color(0x73FFFFFF) // ~45% white
    val GlassBorderDark = Color(0x1AFFFFFF)  // ~10% white
    val GlassHighlightLight = Color(0x8CFFFFFF)
    val GlassHighlightDark = Color(0x14FFFFFF)

    // Layered accent gradients
    val HeroWarmGradient: Brush = Brush.linearGradient(
        colors = listOf(Color(0xFFFF7E5F), Color(0xFFFEB47A))
    )
    val HeroCoolGradient: Brush = Brush.linearGradient(
        colors = listOf(Color(0xFF1E1B4B), Color(0xFF3B2F82), Color(0xFF2563EB))
    )
    val ImageScrim: Brush = Brush.verticalGradient(
        colors = listOf(
            Color.Transparent,
            Color(0x59000000),
            Color(0xB3000000)
        )
    )
}

/**
 * Shared motion curves. Match iOS `springSnappy`, `springSmooth`, `springBouncy`
 * in PremiumTokens.swift so the two platforms feel the same on interaction.
 */
object PremiumMotion {
    // Snappy spring for chips/toggles/icons
    const val SnappyDurationMs = 260
    // Balanced spring for cards/sheets
    const val SmoothDurationMs = 360
    // Bouncy spring for celebratory moments
    const val BouncyDurationMs = 420
}
