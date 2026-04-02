package com.desmoines.aipulse.ui.components

import android.provider.Settings
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.size
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.BrokenImage
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.blur
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import coil3.compose.SubcomposeAsyncImage
import coil3.compose.SubcomposeAsyncImageContent
import coil3.request.ImageRequest
import coil3.request.crossfade
import com.desmoines.aipulse.ui.theme.DesMoinesInsiderTheme

/**
 * Image loading composable with blur-up progressive loading.
 * Shows a blurred low-quality placeholder while the full image loads,
 * then crossfades to the sharp full-resolution image.
 *
 * Mirrors iOS CachedAsyncImage.swift with blur-up enhancement.
 * Coil provides built-in memory + disk caching.
 */
@Composable
fun CachedAsyncImage(
    url: String?,
    contentDescription: String?,
    modifier: Modifier = Modifier,
    contentScale: ContentScale = ContentScale.Crop
) {
    if (url.isNullOrBlank()) {
        ImagePlaceholder(modifier = modifier)
        return
    }

    val context = LocalContext.current
    val reduceMotion = try {
        Settings.Global.getFloat(
            context.contentResolver,
            Settings.Global.ANIMATOR_DURATION_SCALE,
            1f,
        ) == 0f
    } catch (_: Exception) {
        false
    }

    var isLoaded by remember { mutableStateOf(false) }

    // Animate blur radius from 12dp to 0dp as image loads
    val blurRadius by animateFloatAsState(
        targetValue = if (isLoaded || reduceMotion) 0f else 12f,
        animationSpec = tween(durationMillis = 300),
        label = "blur",
    )

    // Animate opacity for crossfade
    val alpha by animateFloatAsState(
        targetValue = if (isLoaded || reduceMotion) 1f else 0.7f,
        animationSpec = tween(durationMillis = 300),
        label = "alpha",
    )

    SubcomposeAsyncImage(
        model = ImageRequest.Builder(context)
            .data(url)
            .crossfade(if (reduceMotion) false else true)
            .build(),
        contentDescription = contentDescription,
        modifier = modifier,
        contentScale = contentScale,
        loading = {
            // Colored placeholder with blur effect
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .background(MaterialTheme.colorScheme.surfaceVariant),
                contentAlignment = Alignment.Center,
            ) {
                // Show a subtle shimmer-like gradient placeholder
                Box(
                    modifier = Modifier
                        .fillMaxSize()
                        .background(
                            MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.8f)
                        ),
                )
            }
        },
        success = { state ->
            val scope = this
            isLoaded = true
            val blurMod = if (blurRadius > 0.5f) {
                Modifier.blur(blurRadius.dp)
            } else {
                Modifier
            }
            Box(modifier = blurMod.graphicsLayer { this.alpha = alpha }) {
                scope.SubcomposeAsyncImageContent()
            }
        },
        error = {
            ImagePlaceholder(modifier = Modifier.fillMaxSize())
        },
    )
}

/**
 * Fallback placeholder shown when image URL is null or loading fails.
 */
@Composable
private fun ImagePlaceholder(
    modifier: Modifier = Modifier
) {
    Box(
        modifier = modifier.background(MaterialTheme.colorScheme.surfaceVariant),
        contentAlignment = Alignment.Center
    ) {
        Icon(
            imageVector = Icons.Filled.BrokenImage,
            contentDescription = null,
            tint = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.4f),
            modifier = Modifier.size(32.dp)
        )
    }
}

@Preview(showBackground = true)
@Composable
private fun CachedAsyncImagePreview() {
    DesMoinesInsiderTheme {
        CachedAsyncImage(
            url = null,
            contentDescription = "Sample image",
            modifier = Modifier.size(200.dp, 150.dp)
        )
    }
}
