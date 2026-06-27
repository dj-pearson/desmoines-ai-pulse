package com.desmoines.aipulse.ui.screens.discover

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.FastOutLinearInEasing
import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.foundation.gestures.detectDragGestures
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.size
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.input.pointer.util.VelocityTracker
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.unit.dp
import com.desmoines.aipulse.data.model.SwipeItem
import com.desmoines.aipulse.util.rememberHapticPerformer
import com.desmoines.aipulse.util.rememberShouldReduceAnimations
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.launch
import kotlin.math.abs

/** A button-driven swipe, mapped to the matching commit direction. */
enum class SwipeCommand { SKIP, LIKE, BOOST }

private enum class CommitDirection { LEFT, RIGHT, UP }

/**
 * Tinder-style swipe deck. Renders the top 3 cards as a peek stack and exposes
 * a callback per commit direction; the parent ViewModel is the source of truth
 * for which item is on top. This view owns only the transient drag offset for
 * the in-flight gesture. Mirrors iOS `SwipeCardStack`.
 *
 * Action-bar buttons drive the same animated fly-off via [command].
 */
@Composable
fun SwipeCardStack(
    items: List<SwipeItem>,
    onLike: (SwipeItem) -> Unit,
    onSkip: (SwipeItem) -> Unit,
    onBoost: (SwipeItem) -> Unit,
    onTap: (SwipeItem) -> Unit,
    modifier: Modifier = Modifier,
    command: SwipeCommand? = null,
    onCommandConsumed: () -> Unit = {},
) {
    val density = LocalDensity.current
    val reduceMotion = rememberShouldReduceAnimations()
    val haptic = rememberHapticPerformer()
    val scope = rememberCoroutineScope()

    val offsetX = remember { Animatable(0f) }
    val offsetY = remember { Animatable(0f) }
    var isDismissing by remember { mutableStateOf(false) }

    val commitThresholdPx = with(density) { 110.dp.toPx() }
    val velocityThresholdPx = with(density) { 320.dp.toPx() }
    val flyX = with(density) { 700.dp.toPx() }
    val flyY = with(density) { 900.dp.toPx() }

    suspend fun settle(targetX: Float, targetY: Float, durationMs: Int) = coroutineScope {
        launch { offsetX.animateTo(targetX, tween(durationMs, easing = FastOutLinearInEasing)) }
        launch { offsetY.animateTo(targetY, tween(durationMs, easing = FastOutLinearInEasing)) }
    }

    fun commit(item: SwipeItem, direction: CommitDirection, action: (SwipeItem) -> Unit) {
        if (isDismissing) return
        isDismissing = true
        when (direction) {
            CommitDirection.UP -> haptic.premiumUnlock()
            else -> haptic.medium()
        }
        val targetX = when (direction) {
            CommitDirection.LEFT -> -flyX
            CommitDirection.RIGHT -> flyX
            CommitDirection.UP -> offsetX.value
        }
        val targetY = if (direction == CommitDirection.UP) -flyY else offsetY.value
        val dur = if (reduceMotion) 120 else 280
        scope.launch {
            settle(targetX, targetY, dur)
            action(item)
            offsetX.snapTo(0f)
            offsetY.snapTo(0f)
            isDismissing = false
        }
    }

    fun springBack() {
        scope.launch {
            if (reduceMotion) {
                launch { offsetX.animateTo(0f, tween(100)) }
                offsetY.animateTo(0f, tween(100))
            } else {
                launch { offsetX.animateTo(0f, spring(dampingRatio = 0.7f, stiffness = Spring.StiffnessMedium)) }
                offsetY.animateTo(0f, spring(dampingRatio = 0.7f, stiffness = Spring.StiffnessMedium))
            }
        }
    }

    // Button-driven commits run the same animated path as a gesture swipe.
    LaunchedEffect(command) {
        val cmd = command ?: return@LaunchedEffect
        val top = items.firstOrNull()
        if (top != null && !isDismissing) {
            when (cmd) {
                SwipeCommand.SKIP -> commit(top, CommitDirection.LEFT, onSkip)
                SwipeCommand.LIKE -> commit(top, CommitDirection.RIGHT, onLike)
                SwipeCommand.BOOST -> commit(top, CommitDirection.UP, onBoost)
            }
        }
        onCommandConsumed()
    }

    BoxWithConstraints(modifier = modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        val cardWidth = maxWidth * 0.92f
        val cardHeight = maxHeight - 28.dp
        val visible = items.take(3)

        // Draw back-to-front so the top card (index 0) renders last / on top.
        for (index in visible.indices.reversed()) {
            val item = visible[index]
            val isTop = index == 0
            key(item.id) {
                val scale = (1f - index * 0.04f).coerceAtLeast(0.88f)
                val stackOffsetY = with(density) { (index * 14).dp.toPx() }

                var cardModifier = Modifier
                    .size(cardWidth, cardHeight)
                    .graphicsLayer {
                        scaleX = scale
                        scaleY = scale
                        translationX = if (isTop) offsetX.value else 0f
                        translationY = stackOffsetY + if (isTop) offsetY.value else 0f
                        rotationZ = if (isTop && !reduceMotion) {
                            val dpOffset = offsetX.value / density.density
                            (dpOffset / 18f).coerceIn(-18f, 18f)
                        } else 0f
                    }

                if (isTop) {
                    cardModifier = cardModifier
                        .pointerInput(item.id) {
                            detectTapGestures(onTap = { if (!isDismissing) onTap(item) })
                        }
                        .pointerInput(item.id) {
                            val tracker = VelocityTracker()
                            detectDragGestures(
                                onDragStart = { tracker.resetTracking() },
                                onDrag = { change, drag ->
                                    if (isDismissing) return@detectDragGestures
                                    tracker.addPosition(change.uptimeMillis, change.position)
                                    scope.launch {
                                        offsetX.snapTo(offsetX.value + drag.x)
                                        offsetY.snapTo(offsetY.value + drag.y)
                                    }
                                    change.consume()
                                },
                                onDragCancel = { springBack() },
                                onDragEnd = {
                                    if (isDismissing) return@detectDragGestures
                                    val velocity = tracker.calculateVelocity()
                                    val h = offsetX.value
                                    val v = offsetY.value
                                    val isVertical = abs(v) > abs(h) && v < 0
                                    val up = isVertical &&
                                        (-v > commitThresholdPx || -velocity.y > velocityThresholdPx)
                                    val right = !isVertical &&
                                        (h > commitThresholdPx || velocity.x > velocityThresholdPx)
                                    val left = !isVertical &&
                                        (-h > commitThresholdPx || -velocity.x > velocityThresholdPx)
                                    when {
                                        up -> commit(item, CommitDirection.UP, onBoost)
                                        right -> commit(item, CommitDirection.RIGHT, onLike)
                                        left -> commit(item, CommitDirection.LEFT, onSkip)
                                        else -> springBack()
                                    }
                                },
                            )
                        }
                }

                SwipeCard(
                    item = item,
                    modifier = cardModifier,
                    dragOffsetX = if (isTop) offsetX.value else 0f,
                    dragOffsetY = if (isTop) offsetY.value else 0f,
                    isTopCard = isTop,
                )
            }
        }
    }
}
