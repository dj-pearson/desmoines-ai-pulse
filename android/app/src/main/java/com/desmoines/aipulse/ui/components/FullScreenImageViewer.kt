package com.desmoines.aipulse.ui.components

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.spring
import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.gestures.detectTransformGestures
import androidx.compose.foundation.gestures.detectVerticalDragGestures
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.IconButtonDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import com.desmoines.aipulse.ui.theme.DesMoinesInsiderTheme

/**
 * Full-screen image viewer with pinch-to-zoom, double-tap zoom, and swipe-down-to-dismiss.
 * Mirrors iOS FullScreenImageViewer.swift.
 *
 * @param imageUrl The URL of the image to display
 * @param onDismiss Callback when the viewer is dismissed
 */
@Composable
fun FullScreenImageViewer(
    imageUrl: String?,
    onDismiss: () -> Unit,
    modifier: Modifier = Modifier
) {
    var scale by remember { mutableFloatStateOf(1f) }
    var offsetX by remember { mutableFloatStateOf(0f) }
    var offsetY by remember { mutableFloatStateOf(0f) }
    var dragOffsetY by remember { mutableFloatStateOf(0f) }
    var backgroundAlpha by remember { mutableFloatStateOf(1f) }
    var isDragging by remember { mutableStateOf(false) }

    val minScale = 0.5f
    val maxScale = 5f
    val dismissThreshold = 150f

    val density = LocalDensity.current
    val dismissThresholdPx = with(density) { dismissThreshold.dp.toPx() }

    // Animated scale for double-tap and snap-back
    val animatedScale by animateFloatAsState(
        targetValue = scale,
        animationSpec = spring(dampingRatio = 0.8f),
        label = "scale"
    )

    Box(
        modifier = modifier
            .fillMaxSize()
            .background(Color.Black.copy(alpha = backgroundAlpha))
    ) {
        // Image with gestures
        Box(
            modifier = Modifier
                .fillMaxSize()
                // Pinch-to-zoom
                .pointerInput(Unit) {
                    detectTransformGestures { _, pan, zoom, _ ->
                        val newScale = (scale * zoom).coerceIn(minScale, maxScale)
                        scale = newScale
                        if (scale > 1f) {
                            offsetX += pan.x
                            offsetY += pan.y
                        }
                    }
                }
                // Double-tap to toggle zoom
                .pointerInput(Unit) {
                    detectTapGestures(
                        onDoubleTap = {
                            if (scale > 1f) {
                                scale = 1f
                                offsetX = 0f
                                offsetY = 0f
                            } else {
                                scale = 2.5f
                            }
                        }
                    )
                }
                // Swipe-down-to-dismiss (only when not zoomed)
                .pointerInput(scale) {
                    if (scale <= 1f) {
                        detectVerticalDragGestures(
                            onDragStart = { isDragging = true },
                            onDragEnd = {
                                if (dragOffsetY > dismissThresholdPx) {
                                    onDismiss()
                                } else {
                                    dragOffsetY = 0f
                                    backgroundAlpha = 1f
                                }
                                isDragging = false
                            },
                            onDragCancel = {
                                dragOffsetY = 0f
                                backgroundAlpha = 1f
                                isDragging = false
                            },
                            onVerticalDrag = { _, dragAmount ->
                                val newOffset = dragOffsetY + dragAmount
                                if (newOffset >= 0) {
                                    dragOffsetY = newOffset
                                    backgroundAlpha = (1f - (dragOffsetY / (dismissThresholdPx * 3))).coerceIn(0f, 1f)
                                }
                            }
                        )
                    }
                },
            contentAlignment = Alignment.Center
        ) {
            CachedAsyncImage(
                url = imageUrl,
                contentDescription = "Full screen image",
                contentScale = ContentScale.Fit,
                modifier = Modifier
                    .fillMaxSize()
                    .graphicsLayer {
                        scaleX = if (isDragging) scale else animatedScale
                        scaleY = if (isDragging) scale else animatedScale
                        translationX = offsetX
                        translationY = offsetY + dragOffsetY
                    }
            )
        }

        // Close button
        IconButton(
            onClick = onDismiss,
            modifier = Modifier
                .align(Alignment.TopEnd)
                .padding(16.dp)
                .semantics { contentDescription = "Close image viewer" },
            colors = IconButtonDefaults.iconButtonColors(
                containerColor = Color.White.copy(alpha = 0.3f),
                contentColor = Color.White
            )
        ) {
            Icon(
                imageVector = Icons.Filled.Close,
                contentDescription = null,
                modifier = Modifier.size(28.dp)
            )
        }
    }
}

@Preview
@Composable
private fun FullScreenImageViewerPreview() {
    DesMoinesInsiderTheme {
        FullScreenImageViewer(
            imageUrl = null,
            onDismiss = {}
        )
    }
}
