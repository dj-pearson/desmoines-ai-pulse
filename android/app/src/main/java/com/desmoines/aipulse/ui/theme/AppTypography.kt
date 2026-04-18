package com.desmoines.aipulse.ui.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.sp

/**
 * App text style tokens kept in parity with iOS AppTypography.swift.
 *
 * Named styles for the app's hierarchy — every style has a consistent weight,
 * letter-spacing, and leading. Backed by Material 3's Typography system so
 * Compose previews and theming integrations still "just work".
 */
enum class AppTextStyle {
    DisplayLg,       // Hero numbers, splash titles
    DisplayMd,       // Section hero titles
    Headline,        // Primary page heading
    Title,           // Card titles, dialog titles
    Subtitle,        // Supporting title, secondary heading
    Body,            // Primary body copy
    BodyEmphasized,  // Body with a heavier weight
    BodySmall,       // Detail / secondary body copy
    Caption,         // Meta captions, timestamps
    Label,           // All-caps labels / badge text
}

private fun AppTextStyle.toTextStyle(base: TextStyle): TextStyle = when (this) {
    AppTextStyle.DisplayLg -> base.copy(fontSize = 44.sp, fontWeight = FontWeight.Black, letterSpacing = (-0.5).sp, lineHeight = 48.sp)
    AppTextStyle.DisplayMd -> base.copy(fontSize = 34.sp, fontWeight = FontWeight.Black, letterSpacing = (-0.3).sp, lineHeight = 40.sp)
    AppTextStyle.Headline -> base.copy(fontSize = 26.sp, fontWeight = FontWeight.Bold, lineHeight = 32.sp)
    AppTextStyle.Title -> base.copy(fontSize = 20.sp, fontWeight = FontWeight.SemiBold, lineHeight = 26.sp)
    AppTextStyle.Subtitle -> base.copy(fontSize = 17.sp, fontWeight = FontWeight.SemiBold, lineHeight = 22.sp)
    AppTextStyle.Body -> base.copy(fontSize = 16.sp, fontWeight = FontWeight.Normal, lineHeight = 22.sp)
    AppTextStyle.BodyEmphasized -> base.copy(fontSize = 16.sp, fontWeight = FontWeight.SemiBold, lineHeight = 22.sp)
    AppTextStyle.BodySmall -> base.copy(fontSize = 14.sp, fontWeight = FontWeight.Normal, lineHeight = 18.sp)
    AppTextStyle.Caption -> base.copy(fontSize = 12.sp, fontWeight = FontWeight.Medium, lineHeight = 15.sp)
    AppTextStyle.Label -> base.copy(fontSize = 11.sp, fontWeight = FontWeight.Bold, letterSpacing = 0.8.sp, lineHeight = 14.sp)
}

/**
 * Composable helper that renders a [Text] using the app's typography token.
 * Use when you want to avoid manually copying font sizes / weights into
 * feature code.
 */
@Composable
fun AppText(
    text: String,
    style: AppTextStyle,
    modifier: Modifier = Modifier,
    color: Color = Color.Unspecified,
    maxLines: Int = Int.MAX_VALUE,
    overflow: TextOverflow = TextOverflow.Clip,
) {
    val base = MaterialTheme.typography.bodyLarge
    Text(
        text = if (style == AppTextStyle.Label) text.uppercase() else text,
        modifier = modifier,
        style = style.toTextStyle(base),
        color = color,
        maxLines = maxLines,
        overflow = overflow,
    )
}

/** Resolve an [AppTextStyle] to a raw [TextStyle] for use with e.g. custom components. */
@Composable
fun rememberAppTextStyle(style: AppTextStyle): TextStyle {
    val base = MaterialTheme.typography.bodyLarge
    return style.toTextStyle(base)
}
