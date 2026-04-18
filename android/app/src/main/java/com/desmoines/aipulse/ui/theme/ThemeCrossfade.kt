package com.desmoines.aipulse.ui.theme

import androidx.compose.animation.Crossfade
import androidx.compose.animation.core.tween
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import com.desmoines.aipulse.util.rememberShouldReduceAnimations

/**
 * Wraps content in a Crossfade that animates between themes when [themeMode]
 * changes. Compose does not animate ColorScheme transitions inside
 * MaterialTheme out of the box — toggling the theme swaps colors instantly.
 *
 * This container re-composes the content with [DesMoinesInsiderTheme] tied
 * to the latest mode and crossfades between the previous and next tree so
 * users see a smooth transition in Settings.
 *
 * Mirrors iOS `ThemeCrossfadeContainer`. Respects the user's animator
 * duration scale via [rememberShouldReduceAnimations].
 */
@Composable
fun ThemeCrossfadeContainer(
    themeMode: ThemeMode,
    modifier: Modifier = Modifier,
    content: @Composable (ThemeMode) -> Unit,
) {
    val reduceMotion = rememberShouldReduceAnimations()
    val duration = if (reduceMotion) 0 else PremiumTokens.MotionBaseMs

    Box(modifier = modifier.fillMaxSize()) {
        Crossfade(
            targetState = themeMode,
            animationSpec = tween(durationMillis = duration),
            label = "themeCrossfade",
        ) { mode ->
            DesMoinesInsiderTheme(themeMode = mode) {
                content(mode)
            }
        }
    }
}
