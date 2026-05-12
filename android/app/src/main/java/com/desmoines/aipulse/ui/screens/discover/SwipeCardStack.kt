package com.desmoines.aipulse.ui.screens.discover

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.detectDragGestures
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowUpward
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import coil3.compose.AsyncImage
import kotlinx.coroutines.launch
import kotlin.math.abs

private const val COMMIT_THRESHOLD = 110f

/**
 * Card-stack swipe deck. Renders the top 3 cards from [items] and exposes
 * callbacks for each commit direction. Mirrors iOS SwipeCardStack.swift.
 */
@Composable
fun SwipeCardStack(
    items: List<SwipeItem>,
    onLike: (SwipeItem) -> Unit,
    onSkip: (SwipeItem) -> Unit,
    onBoost: (SwipeItem) -> Unit,
    onTap: (SwipeItem) -> Unit,
    modifier: Modifier = Modifier,
) {
    val visible = items.take(3)
    val offsetX = remember { Animatable(0f) }
    val offsetY = remember { Animatable(0f) }
    val scope = rememberCoroutineScope()
    var isDismissing by remember { mutableStateOf(false) }
    val density = LocalDensity.current

    LaunchedEffect(items.firstOrNull()?.id) {
        offsetX.snapTo(0f); offsetY.snapTo(0f)
        isDismissing = false
    }

    Box(
        modifier = modifier.fillMaxSize(),
        contentAlignment = Alignment.Center,
    ) {
        visible.asReversed().forEachIndexed { reverseIndex, item ->
            val index = visible.size - 1 - reverseIndex
            val isTop = index == 0
            val scale = (1f - index * 0.04f).coerceAtLeast(0.88f)
            val yStack = (index * 14).dp

            val dragOffsetXPx = if (isTop) offsetX.value else 0f
            val dragOffsetYPx = if (isTop) offsetY.value else 0f
            val rotationDeg = if (isTop) (dragOffsetXPx / 18f).coerceIn(-18f, 18f) else 0f

            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(top = yStack)
                    .graphicsLayer {
                        translationX = dragOffsetXPx
                        translationY = dragOffsetYPx
                        rotationZ = rotationDeg
                        scaleX = scale
                        scaleY = scale
                    }
                    .then(
                        if (isTop) Modifier
                            .pointerInput(item.id, isDismissing) {
                                if (isDismissing) return@pointerInput
                                detectDragGestures(
                                    onDragEnd = {
                                        val h = offsetX.value
                                        val v = offsetY.value
                                        val isVertical = abs(v) > abs(h) && v < 0
                                        val upCommitted = isVertical && -v > COMMIT_THRESHOLD
                                        val rightCommitted = !isVertical && h > COMMIT_THRESHOLD
                                        val leftCommitted = !isVertical && -h > COMMIT_THRESHOLD

                                        scope.launch {
                                            when {
                                                upCommitted -> commit(offsetX, offsetY, item, Direction.UP, onBoost) { isDismissing = it }
                                                rightCommitted -> commit(offsetX, offsetY, item, Direction.RIGHT, onLike) { isDismissing = it }
                                                leftCommitted -> commit(offsetX, offsetY, item, Direction.LEFT, onSkip) { isDismissing = it }
                                                else -> {
                                                    offsetX.animateTo(0f, tween(300))
                                                    offsetY.animateTo(0f, tween(300))
                                                }
                                            }
                                        }
                                    },
                                    onDrag = { change, dragAmount ->
                                        change.consume()
                                        scope.launch {
                                            offsetX.snapTo(offsetX.value + dragAmount.x)
                                            offsetY.snapTo(offsetY.value + dragAmount.y)
                                        }
                                    },
                                )
                            }
                            .pointerInput(item.id) {
                                detectTapGestures(onTap = { onTap(item) })
                            }
                        else Modifier
                    ),
            ) {
                SwipeCard(
                    item = item,
                    dragOffsetX = dragOffsetXPx,
                    dragOffsetY = dragOffsetYPx,
                    isTop = isTop,
                )
            }
        }
    }
}

private enum class Direction { LEFT, RIGHT, UP }

private suspend fun commit(
    offsetX: Animatable<Float, *>,
    offsetY: Animatable<Float, *>,
    item: SwipeItem,
    direction: Direction,
    action: (SwipeItem) -> Unit,
    setDismissing: (Boolean) -> Unit,
) {
    setDismissing(true)
    when (direction) {
        Direction.LEFT -> offsetX.animateTo(-1500f, tween(280))
        Direction.RIGHT -> offsetX.animateTo(1500f, tween(280))
        Direction.UP -> offsetY.animateTo(-1800f, tween(280))
    }
    action(item)
}

@Composable
private fun SwipeCard(
    item: SwipeItem,
    dragOffsetX: Float,
    dragOffsetY: Float,
    isTop: Boolean,
) {
    val likeFraction = if (isTop && dragOffsetX > 0) (dragOffsetX / COMMIT_THRESHOLD).coerceAtMost(1f) else 0f
    val skipFraction = if (isTop && dragOffsetX < 0) (-dragOffsetX / COMMIT_THRESHOLD).coerceAtMost(1f) else 0f
    val boostFraction = if (isTop && dragOffsetY < 0 && abs(dragOffsetY) > abs(dragOffsetX))
        (-dragOffsetY / COMMIT_THRESHOLD).coerceAtMost(1f)
    else 0f

    Card(
        modifier = Modifier.fillMaxSize(),
        shape = RoundedCornerShape(24.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant),
        elevation = CardDefaults.cardElevation(defaultElevation = 12.dp),
    ) {
        Box(modifier = Modifier.fillMaxSize()) {
            // Hero image
            if (!item.imageUrl.isNullOrBlank()) {
                AsyncImage(
                    model = item.imageUrl,
                    contentDescription = null,
                    modifier = Modifier.fillMaxSize(),
                    contentScale = ContentScale.Crop,
                )
            } else {
                Box(
                    modifier = Modifier
                        .fillMaxSize()
                        .background(MaterialTheme.colorScheme.secondaryContainer),
                )
            }

            // Bottom scrim + content
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .background(
                        Brush.verticalGradient(
                            colors = listOf(
                                Color.Transparent,
                                Color.Black.copy(alpha = 0.55f),
                                Color.Black.copy(alpha = 0.85f),
                            ),
                        ),
                    ),
            )
            Column(
                modifier = Modifier
                    .align(Alignment.BottomStart)
                    .padding(20.dp),
                verticalArrangement = Arrangement.spacedBy(6.dp),
            ) {
                Text(
                    text = item.typeLabel,
                    color = Color.White.copy(alpha = 0.9f),
                    style = MaterialTheme.typography.labelMedium,
                    fontWeight = FontWeight.SemiBold,
                )
                Text(
                    text = item.title,
                    color = Color.White,
                    style = MaterialTheme.typography.titleLarge,
                    fontWeight = FontWeight.Bold,
                    maxLines = 2,
                )
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    Text(
                        text = item.subtitle,
                        color = Color.White.copy(alpha = 0.85f),
                        style = MaterialTheme.typography.bodyMedium,
                    )
                    if (item.locationText.isNotEmpty()) {
                        Text(
                            text = "· ${item.locationText}",
                            color = Color.White.copy(alpha = 0.75f),
                            style = MaterialTheme.typography.bodySmall,
                            maxLines = 1,
                        )
                    }
                }
            }

            // Swipe intent overlays
            if (isTop) {
                OverlayLabel(text = "LIKE", color = Color(0xFF34C759), rotation = -14f, alpha = likeFraction, alignment = Alignment.TopStart)
                OverlayLabel(text = "NOPE", color = Color(0xFFFF3B30), rotation = 14f, alpha = skipFraction, alignment = Alignment.TopEnd)
                OverlayLabel(text = "MORE LIKE THIS", color = Color(0xFF007AFF), rotation = 0f, alpha = boostFraction, alignment = Alignment.TopCenter)
            }
        }
    }
}

@Composable
private fun BoxScope.OverlayLabel(text: String, color: Color, rotation: Float, alpha: Float, alignment: Alignment) {
    if (alpha <= 0f) return
    Box(
        modifier = Modifier
            .align(alignment)
            .padding(28.dp)
            .graphicsLayer { rotationZ = rotation; this.alpha = alpha }
            .background(Color.White.copy(alpha = 0.85f), RoundedCornerShape(8.dp))
            .padding(horizontal = 16.dp, vertical = 8.dp),
    ) {
        Text(text = text, color = color, fontWeight = FontWeight.ExtraBold, style = MaterialTheme.typography.titleMedium)
    }
}

@Composable
fun DiscoverActionBar(
    deckEmpty: Boolean,
    onSkip: () -> Unit,
    onBoost: () -> Unit,
    onLike: () -> Unit,
) {
    val alpha = if (deckEmpty) 0.4f else 1f
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 24.dp, vertical = 12.dp)
            .graphicsLayer { this.alpha = alpha },
        horizontalArrangement = Arrangement.spacedBy(24.dp, Alignment.CenterHorizontally),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        ActionCircleButton(icon = Icons.Filled.Close, tint = Color(0xFFFF3B30), label = "Skip", size = 56.dp, enabled = !deckEmpty, onClick = onSkip)
        ActionCircleButton(icon = Icons.Filled.ArrowUpward, tint = Color(0xFF007AFF), label = "More like this", size = 64.dp, enabled = !deckEmpty, onClick = onBoost)
        ActionCircleButton(icon = Icons.Filled.Favorite, tint = Color(0xFF34C759), label = "Save", size = 56.dp, enabled = !deckEmpty, onClick = onLike)
    }
}

@Composable
private fun ActionCircleButton(
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    tint: Color,
    label: String,
    size: androidx.compose.ui.unit.Dp,
    enabled: Boolean,
    onClick: () -> Unit,
) {
    IconButton(
        onClick = onClick,
        enabled = enabled,
        modifier = Modifier
            .size(size)
            .clip(androidx.compose.foundation.shape.CircleShape)
            .background(MaterialTheme.colorScheme.surface),
    ) {
        Icon(imageVector = icon, contentDescription = label, tint = tint)
    }
}
