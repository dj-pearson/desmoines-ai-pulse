package com.desmoines.aipulse.ui.components

import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.spring
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.LocalContentColor
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.scale
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.unit.dp
import com.desmoines.aipulse.ui.theme.GlassIntensity
import com.desmoines.aipulse.ui.theme.PremiumTokens
import com.desmoines.aipulse.ui.theme.glassSurface

/**
 * Brand button system for Des Moines Insider.
 *
 * Wraps Material 3 button primitives so every CTA in the app reads with the
 * same visual language — brand gradient primaries, glass secondaries, ghost
 * tertiaries, destructive reds — all plugged into the shared glass surface
 * vocabulary defined in [com.desmoines.aipulse.ui.theme.glassSurface].
 *
 * Each button supports [isLoading] (spinner + disabled state) and a press
 * scale animation. Mirrors iOS BrandButtonStyles.swift.
 */
enum class BrandButtonSize(
    val horizontalPadding: Int,
    val verticalPadding: Int,
    val minHeight: Int,
) {
    Compact(16, 8, 36),
    Regular(22, 12, 48),
    Large(28, 16, 56),
}

@Composable
fun BrandPrimaryButton(
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    isLoading: Boolean = false,
    enabled: Boolean = true,
    size: BrandButtonSize = BrandButtonSize.Regular,
    leadingIcon: ImageVector? = null,
    text: String,
) {
    val interaction = remember { MutableInteractionSource() }
    val pressed by interaction.collectIsPressedAsState()
    val scale by animateFloatAsState(
        targetValue = if (pressed) 0.98f else 1f,
        animationSpec = spring(),
        label = "pressScale",
    )

    Button(
        onClick = onClick,
        modifier = modifier
            .fillMaxWidth()
            .scale(scale)
            .glassSurface(
                shape = RoundedCornerShape(PremiumTokens.CornerLg),
                intensity = GlassIntensity.Bar,
                elevation = PremiumTokens.Elevation8,
            )
            .background(PremiumTokens.BrandGradient)
            .heightIn(min = size.minHeight.dp),
        enabled = enabled && !isLoading,
        shape = RoundedCornerShape(PremiumTokens.CornerLg),
        colors = ButtonDefaults.buttonColors(
            containerColor = Color.Transparent,
            contentColor = Color.White,
            disabledContainerColor = Color.Transparent,
            disabledContentColor = Color.White.copy(alpha = 0.6f),
        ),
        contentPadding = androidx.compose.foundation.layout.PaddingValues(
            horizontal = size.horizontalPadding.dp,
            vertical = size.verticalPadding.dp,
        ),
        interactionSource = interaction,
    ) {
        ButtonContent(isLoading = isLoading, leadingIcon = leadingIcon, text = text)
    }
}

@Composable
fun BrandSecondaryButton(
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    isLoading: Boolean = false,
    enabled: Boolean = true,
    size: BrandButtonSize = BrandButtonSize.Regular,
    leadingIcon: ImageVector? = null,
    text: String,
) {
    val primary = MaterialTheme.colorScheme.primary
    val interaction = remember { MutableInteractionSource() }
    val pressed by interaction.collectIsPressedAsState()
    val scale by animateFloatAsState(
        targetValue = if (pressed) 0.98f else 1f,
        animationSpec = spring(),
        label = "pressScale",
    )

    OutlinedButton(
        onClick = onClick,
        modifier = modifier
            .fillMaxWidth()
            .scale(scale)
            .glassSurface(
                shape = RoundedCornerShape(PremiumTokens.CornerLg),
                intensity = GlassIntensity.Chip,
                elevation = PremiumTokens.Elevation2,
            )
            .heightIn(min = size.minHeight.dp),
        enabled = enabled && !isLoading,
        shape = RoundedCornerShape(PremiumTokens.CornerLg),
        border = BorderStroke(1.dp, primary.copy(alpha = 0.45f)),
        colors = ButtonDefaults.outlinedButtonColors(
            containerColor = primary.copy(alpha = 0.08f),
            contentColor = primary,
        ),
        contentPadding = androidx.compose.foundation.layout.PaddingValues(
            horizontal = size.horizontalPadding.dp,
            vertical = size.verticalPadding.dp,
        ),
        interactionSource = interaction,
    ) {
        ButtonContent(isLoading = isLoading, leadingIcon = leadingIcon, text = text)
    }
}

@Composable
fun BrandGhostButton(
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    size: BrandButtonSize = BrandButtonSize.Regular,
    leadingIcon: ImageVector? = null,
    text: String,
) {
    TextButton(
        onClick = onClick,
        modifier = modifier.heightIn(min = size.minHeight.dp),
        enabled = enabled,
        contentPadding = androidx.compose.foundation.layout.PaddingValues(
            horizontal = size.horizontalPadding.dp,
            vertical = size.verticalPadding.dp,
        ),
    ) {
        ButtonContent(isLoading = false, leadingIcon = leadingIcon, text = text)
    }
}

@Composable
fun BrandDestructiveButton(
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    isLoading: Boolean = false,
    enabled: Boolean = true,
    size: BrandButtonSize = BrandButtonSize.Regular,
    text: String,
) {
    val interaction = remember { MutableInteractionSource() }
    val pressed by interaction.collectIsPressedAsState()
    val scale by animateFloatAsState(
        targetValue = if (pressed) 0.98f else 1f,
        animationSpec = spring(),
        label = "pressScale",
    )

    val destructiveGradient = androidx.compose.ui.graphics.Brush.linearGradient(
        colors = listOf(Color(0xFFF24444), Color(0xFFCC2E2E)),
    )

    Button(
        onClick = onClick,
        modifier = modifier
            .fillMaxWidth()
            .scale(scale)
            .glassSurface(
                shape = RoundedCornerShape(PremiumTokens.CornerLg),
                intensity = GlassIntensity.Bar,
                elevation = PremiumTokens.Elevation4,
            )
            .background(destructiveGradient)
            .heightIn(min = size.minHeight.dp),
        enabled = enabled && !isLoading,
        shape = RoundedCornerShape(PremiumTokens.CornerLg),
        colors = ButtonDefaults.buttonColors(
            containerColor = Color.Transparent,
            contentColor = Color.White,
        ),
        contentPadding = androidx.compose.foundation.layout.PaddingValues(
            horizontal = size.horizontalPadding.dp,
            vertical = size.verticalPadding.dp,
        ),
        interactionSource = interaction,
    ) {
        ButtonContent(isLoading = isLoading, leadingIcon = null, text = text)
    }
}

@Composable
private fun ButtonContent(
    isLoading: Boolean,
    leadingIcon: ImageVector?,
    text: String,
) {
    Row(
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.Center,
        modifier = Modifier.padding(horizontal = 4.dp),
    ) {
        if (isLoading) {
            CircularProgressIndicator(
                modifier = Modifier.alpha(1f),
                strokeWidth = 2.dp,
                color = LocalContentColor.current,
            )
        } else {
            if (leadingIcon != null) {
                androidx.compose.material3.Icon(
                    imageVector = leadingIcon,
                    contentDescription = null,
                    modifier = Modifier.padding(end = 8.dp),
                )
            }
            CompositionLocalProvider {
                val pressedAlpha by animateColorAsState(
                    targetValue = LocalContentColor.current,
                    label = "contentAlpha",
                )
                Text(
                    text = text,
                    style = MaterialTheme.typography.labelLarge.copy(
                        fontWeight = androidx.compose.ui.text.font.FontWeight.SemiBold,
                    ),
                    color = pressedAlpha,
                )
            }
        }
    }
}
