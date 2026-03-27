package com.desmoines.aipulse.ui.components

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Info
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import com.desmoines.aipulse.ui.theme.DesMoinesInsiderTheme
import com.desmoines.aipulse.ui.theme.StatusError
import com.desmoines.aipulse.ui.theme.StatusSuccess
import kotlinx.coroutines.delay

/**
 * Toast message data class matching iOS ToastMessage.
 */
data class ToastMessage(
    val text: String,
    val icon: ImageVector,
    val style: Style
) {
    enum class Style { SUCCESS, INFO, ERROR }

    companion object {
        fun success(text: String, icon: ImageVector = Icons.Filled.CheckCircle) =
            ToastMessage(text, icon, Style.SUCCESS)

        fun info(text: String, icon: ImageVector = Icons.Filled.Info) =
            ToastMessage(text, icon, Style.INFO)

        fun error(text: String, icon: ImageVector = Icons.Filled.Warning) =
            ToastMessage(text, icon, Style.ERROR)
    }
}

/**
 * Transient toast notification overlay.
 * Shows a capsule-shaped message at the bottom of the screen that auto-dismisses after 2 seconds.
 * Mirrors iOS ToastOverlay.swift.
 */
@Composable
fun ToastOverlay(
    message: ToastMessage?,
    onDismiss: () -> Unit,
    modifier: Modifier = Modifier
) {
    // Auto-dismiss after 2 seconds
    LaunchedEffect(message) {
        if (message != null) {
            delay(2000L)
            onDismiss()
        }
    }

    Box(
        modifier = modifier.fillMaxSize(),
        contentAlignment = Alignment.BottomCenter
    ) {
        AnimatedVisibility(
            visible = message != null,
            enter = slideInVertically(initialOffsetY = { it }) + fadeIn(),
            exit = slideOutVertically(targetOffsetY = { it }) + fadeOut()
        ) {
            message?.let { msg ->
                Surface(
                    modifier = Modifier.padding(bottom = 24.dp, start = 16.dp, end = 16.dp),
                    shape = RoundedCornerShape(24.dp),
                    tonalElevation = 6.dp,
                    shadowElevation = 8.dp,
                    color = MaterialTheme.colorScheme.inverseSurface
                ) {
                    Row(
                        modifier = Modifier.padding(horizontal = 18.dp, vertical = 12.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Icon(
                            imageVector = msg.icon,
                            contentDescription = null,
                            tint = when (msg.style) {
                                ToastMessage.Style.SUCCESS -> StatusSuccess
                                ToastMessage.Style.INFO -> Color(0xFF2196F3)
                                ToastMessage.Style.ERROR -> StatusError
                            }
                        )
                        Spacer(modifier = Modifier.width(10.dp))
                        Text(
                            text = msg.text,
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.inverseOnSurface,
                            maxLines = 2
                        )
                    }
                }
            }
        }
    }
}

@Preview(showBackground = true)
@Composable
private fun ToastOverlayPreview() {
    DesMoinesInsiderTheme {
        ToastOverlay(
            message = ToastMessage.success("Event added to favorites!"),
            onDismiss = {}
        )
    }
}
