package com.desmoines.aipulse.ui.theme

import androidx.compose.runtime.Composable
import androidx.compose.runtime.compositionLocalOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier

/**
 * Process-wide hint for whether a translucent sheet / modal is currently
 * presented. When true, surfaces below the sheet should apply
 * [Modifier.glassBackdropBlur] so the sheet reads as a true frosted panel
 * on Android 12+. On older devices the modifier is a no-op.
 *
 * Feature code (any screen presenting a [ModalBottomSheet] or custom
 * overlay) updates the state by writing to [BackdropBlurScope]:
 *
 * ```
 * val backdrop = LocalBackdropBlurState.current
 * LaunchedEffect(sheetVisible) { backdrop.isBlurred = sheetVisible }
 * ```
 *
 * The [MainScreen] reads the state and applies blur to its content tree.
 */
class BackdropBlurScope {
    var isBlurred: Boolean by mutableStateOf(false)
}

val LocalBackdropBlurState = compositionLocalOf { BackdropBlurScope() }

@Composable
fun rememberBackdropBlurScope(): BackdropBlurScope = remember { BackdropBlurScope() }

/**
 * Apply as a modifier on the root content container inside MainScreen. When
 * the [LocalBackdropBlurState] reports a presented sheet, the receiver is
 * blurred using [glassBackdropBlur]. When the sheet dismisses, the blur is
 * removed.
 */
@Composable
fun Modifier.respondsToBackdropBlur(): Modifier {
    val state = LocalBackdropBlurState.current
    return if (state.isBlurred && GlassCapabilities.supportsBackdropBlur) {
        this.glassBackdropBlur()
    } else {
        this
    }
}
