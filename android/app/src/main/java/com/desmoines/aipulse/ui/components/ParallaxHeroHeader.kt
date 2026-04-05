package com.desmoines.aipulse.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.lazy.LazyListState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.desmoines.aipulse.ui.theme.Dimens

/**
 * Hero header with parallax scrolling and bottom scrim, matching the iOS
 * `ParallaxHeroHeader` view.
 *
 * The caller is responsible for placing this inside a LazyColumn's first
 * item slot and passing the same [listState]. The header translates at 0.5x
 * the scroll offset to create a parallax effect.
 *
 * @param listState The LazyListState driving the scroll
 * @param height Hero height (default 300.dp)
 * @param parallaxFactor 0..1, how much the hero moves relative to scroll
 * @param content The hero image / content
 */
@Composable
fun ParallaxHeroHeader(
    listState: LazyListState,
    modifier: Modifier = Modifier,
    height: Dp = Dimens.HeroImageHeight,
    parallaxFactor: Float = 0.5f,
    content: @Composable () -> Unit,
) {
    val offsetPx by remember(listState) {
        derivedStateOf {
            if (listState.firstVisibleItemIndex == 0) {
                listState.firstVisibleItemScrollOffset.toFloat()
            } else {
                Float.MAX_VALUE
            }
        }
    }

    Box(
        modifier = modifier
            .fillMaxWidth()
            .height(height)
            .graphicsLayer {
                // Move the hero upward at a slower rate than the scroll so it
                // appears to stay behind the content.
                translationY = -offsetPx * parallaxFactor
            },
    ) {
        content()

        // Bottom scrim for title legibility
        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(
                    Brush.verticalGradient(
                        colors = listOf(
                            Color.Transparent,
                            Color.Black.copy(alpha = 0.55f),
                        ),
                        startY = 0f,
                        endY = Float.POSITIVE_INFINITY,
                    )
                ),
            contentAlignment = Alignment.BottomStart,
        ) {}
    }
}

/**
 * Returns a 0..1 progress value indicating how far the hero has scrolled out
 * of view. Use to fade in a top app bar title once the hero is mostly gone.
 */
@Composable
fun rememberHeroScrollProgress(
    listState: LazyListState,
    heroHeightPx: Float,
): Float {
    val progress by remember(listState, heroHeightPx) {
        derivedStateOf {
            if (heroHeightPx <= 0f) 0f
            else if (listState.firstVisibleItemIndex > 0) 1f
            else (listState.firstVisibleItemScrollOffset / (heroHeightPx * 0.6f))
                .coerceIn(0f, 1f)
        }
    }
    return progress
}
