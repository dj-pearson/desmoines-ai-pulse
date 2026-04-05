package com.desmoines.aipulse.ui.components

import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import com.desmoines.aipulse.ui.theme.PremiumTokens
import com.desmoines.aipulse.util.rememberHapticPerformer
import com.desmoines.aipulse.util.rememberShouldReduceAnimations

enum class ChatRole { USER, ASSISTANT }

/**
 * Chat bubble used in the Trip Planner conversational UI.
 * Mirrors iOS `ChatBubble.swift`.
 *
 * User messages are right-aligned on the primary color; assistant messages
 * are left-aligned on surfaceVariant.
 */
@Composable
fun ChatBubble(
    text: String,
    role: ChatRole,
    modifier: Modifier = Modifier,
) {
    val isUser = role == ChatRole.USER
    Row(
        modifier = modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 4.dp),
        horizontalArrangement = if (isUser) Arrangement.End else Arrangement.Start,
    ) {
        Box(
            modifier = Modifier
                .clip(
                    RoundedCornerShape(
                        topStart = 18.dp,
                        topEnd = 18.dp,
                        bottomStart = if (isUser) 18.dp else 4.dp,
                        bottomEnd = if (isUser) 4.dp else 18.dp,
                    )
                )
                .background(
                    if (isUser) MaterialTheme.colorScheme.primary
                    else MaterialTheme.colorScheme.surfaceVariant
                )
                .padding(horizontal = 14.dp, vertical = 10.dp)
                .semantics {
                    contentDescription = (if (isUser) "You said: " else "Assistant said: ") + text
                },
        ) {
            Text(
                text = text,
                color = if (isUser) MaterialTheme.colorScheme.onPrimary
                else MaterialTheme.colorScheme.onSurface,
                style = MaterialTheme.typography.bodyMedium,
            )
        }
    }
}

/**
 * Animated "assistant is typing" indicator — three bouncing dots.
 */
@Composable
fun TypingIndicator(modifier: Modifier = Modifier) {
    val reduceMotion = rememberShouldReduceAnimations()
    Row(
        modifier = modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 4.dp)
            .semantics { contentDescription = "Assistant is typing" },
        horizontalArrangement = Arrangement.Start,
    ) {
        Row(
            modifier = Modifier
                .clip(RoundedCornerShape(18.dp))
                .background(MaterialTheme.colorScheme.surfaceVariant)
                .padding(horizontal = 14.dp, vertical = 12.dp),
            horizontalArrangement = Arrangement.spacedBy(6.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            repeat(3) { index ->
                Dot(delayMs = index * 150, reduceMotion = reduceMotion)
            }
        }
    }
}

@Composable
private fun Dot(delayMs: Int, reduceMotion: Boolean) {
    val transition = rememberInfiniteTransition(label = "typing-dot")
    val y by transition.animateFloat(
        initialValue = 0f,
        targetValue = 1f,
        animationSpec = infiniteRepeatable(
            animation = tween(durationMillis = 600, delayMillis = delayMs, easing = LinearEasing),
            repeatMode = RepeatMode.Reverse,
        ),
        label = "typing-dot-y",
    )
    Box(
        modifier = Modifier
            .size(8.dp)
            .graphicsLayer { translationY = if (reduceMotion) 0f else -y * 4f }
            .clip(CircleShape)
            .background(MaterialTheme.colorScheme.onSurfaceVariant),
    )
}

/**
 * Horizontal row of quick-reply suggestion chips.
 */
@Composable
fun SuggestionChipsRow(
    suggestions: List<String>,
    onSelect: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    val haptic = rememberHapticPerformer()
    LazyRow(
        modifier = modifier.fillMaxWidth().padding(vertical = 8.dp),
        contentPadding = androidx.compose.foundation.layout.PaddingValues(horizontal = 16.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        items(suggestions) { suggestion ->
            Row(
                modifier = Modifier
                    .clip(CircleShape)
                    .border(1.dp, MaterialTheme.colorScheme.outline, CircleShape)
                    .background(MaterialTheme.colorScheme.surface)
                    .clickable {
                        haptic.selection()
                        onSelect(suggestion)
                    }
                    .padding(horizontal = 14.dp, vertical = 8.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    text = suggestion,
                    style = MaterialTheme.typography.labelLarge,
                )
            }
        }
    }
    // Unused reference prevents import pruning headaches in some build setups
    val _unused: Unit = Unit
    Spacer(Modifier.size(0.dp))
    _unused
}
