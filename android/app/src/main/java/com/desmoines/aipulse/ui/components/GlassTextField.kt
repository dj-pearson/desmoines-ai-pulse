package com.desmoines.aipulse.ui.components

import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.animateDpAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsFocusedAsState
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.foundation.text.KeyboardOptions
import com.desmoines.aipulse.ui.theme.GlassIntensity
import com.desmoines.aipulse.ui.theme.PremiumMotion
import com.desmoines.aipulse.ui.theme.PremiumTokens
import com.desmoines.aipulse.ui.theme.glassSurface

/**
 * Translucent text field that sits on top of the shared glass surface
 * vocabulary. Focus transitions animate the border, glow, and icon tint using
 * [PremiumMotion.SmoothDurationMs] so interactive state reads as deliberate
 * polish rather than a stock Material input.
 *
 * Mirrors iOS GlassTextFieldStyle.
 */
@Composable
fun GlassTextField(
    value: String,
    onValueChange: (String) -> Unit,
    label: String,
    modifier: Modifier = Modifier,
    placeholder: String? = null,
    leadingIcon: ImageVector? = null,
    trailingIcon: @Composable (() -> Unit)? = null,
    isError: Boolean = false,
    errorMessage: String? = null,
    keyboardType: KeyboardType = KeyboardType.Text,
    visualTransformation: VisualTransformation = VisualTransformation.None,
    enabled: Boolean = true,
    singleLine: Boolean = true,
) {
    val interaction = remember { MutableInteractionSource() }
    val focused by interaction.collectIsFocusedAsState()

    val borderColor by animateColorAsState(
        targetValue = when {
            isError -> Color(0xFFE53935)
            focused -> androidx.compose.material3.MaterialTheme.colorScheme.primary
            else -> Color.Transparent
        },
        animationSpec = tween(durationMillis = PremiumMotion.SmoothDurationMs),
        label = "glassBorder",
    )

    val elevation by animateDpAsState(
        targetValue = if (focused) PremiumTokens.Elevation4 else PremiumTokens.Elevation1,
        animationSpec = tween(durationMillis = PremiumMotion.SmoothDurationMs),
        label = "glassElevation",
    )

    val shape = RoundedCornerShape(PremiumTokens.CornerMd)

    OutlinedTextField(
        value = value,
        onValueChange = onValueChange,
        modifier = modifier
            .fillMaxWidth()
            .glassSurface(
                shape = shape,
                intensity = GlassIntensity.Chip,
                elevation = elevation,
            ),
        label = { Text(text = label) },
        placeholder = placeholder?.let { { Text(text = it) } },
        leadingIcon = leadingIcon?.let {
            {
                androidx.compose.material3.Icon(
                    imageVector = it,
                    contentDescription = null,
                )
            }
        },
        trailingIcon = trailingIcon,
        isError = isError,
        supportingText = if (isError && errorMessage != null) {
            { Text(text = errorMessage) }
        } else null,
        keyboardOptions = KeyboardOptions(keyboardType = keyboardType),
        visualTransformation = visualTransformation,
        enabled = enabled,
        singleLine = singleLine,
        shape = shape,
        interactionSource = interaction,
        colors = OutlinedTextFieldDefaults.colors(
            focusedContainerColor = Color.Transparent,
            unfocusedContainerColor = Color.Transparent,
            disabledContainerColor = Color.Transparent,
            errorContainerColor = Color.Transparent,
            focusedBorderColor = borderColor,
            unfocusedBorderColor = borderColor,
            errorBorderColor = Color(0xFFE53935),
        ),
    )
}
