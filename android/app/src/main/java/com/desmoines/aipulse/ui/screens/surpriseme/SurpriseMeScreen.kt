package com.desmoines.aipulse.ui.screens.surpriseme

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Casino
import androidx.compose.material.icons.filled.WarningAmber
import androidx.compose.material3.Button
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.desmoines.aipulse.data.model.SurprisePick
import com.desmoines.aipulse.ui.components.CachedAsyncImage
import com.desmoines.aipulse.util.rememberHapticPerformer
import com.desmoines.aipulse.util.rememberShouldReduceAnimations
import kotlinx.coroutines.launch

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SurpriseMeScreen(
    state: SurpriseMeUiState,
    onSave: () -> Unit,
    onTryAnother: () -> Unit,
    onOpen: (SurprisePick) -> Unit,
    onRetry: () -> Unit,
    onNavigateBack: () -> Unit,
) {
    val haptic = rememberHapticPerformer()

    // One-shot dismiss after a successful save.
    LaunchedEffect(state.dismiss) {
        if (state.dismiss) onNavigateBack()
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Surprise Me") },
                navigationIcon = {
                    IconButton(onClick = onNavigateBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
                    }
                },
            )
        },
    ) { innerPadding ->
        Box(
            modifier = Modifier.fillMaxSize().padding(innerPadding).padding(24.dp),
            contentAlignment = Alignment.Center,
        ) {
            val pick = state.pick
            when {
                state.isRolling -> RollingState()
                state.errorMessage != null -> ErrorState(message = state.errorMessage, onRetry = onRetry)
                pick != null -> PickReveal(
                    pick = pick,
                    onSave = { haptic.light(); onSave() },
                    onTryAnother = { haptic.medium(); onTryAnother() },
                    onOpen = { onOpen(pick) },
                )
            }
        }
    }
}

@Composable
private fun RollingState() {
    val transition = rememberInfiniteTransition(label = "die")
    val bounce by transition.animateFloat(
        initialValue = 0f,
        targetValue = -24f,
        animationSpec = infiniteRepeatable(
            animation = tween(420),
            repeatMode = RepeatMode.Reverse,
        ),
        label = "bounce",
    )
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Icon(
            Icons.Filled.Casino,
            contentDescription = null,
            tint = MaterialTheme.colorScheme.primary,
            modifier = Modifier.size(64.dp).graphicsLayer { translationY = bounce },
        )
        Spacer(Modifier.height(16.dp))
        Text("Rolling…", style = MaterialTheme.typography.titleMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

@Composable
private fun PickReveal(
    pick: SurprisePick,
    onSave: () -> Unit,
    onTryAnother: () -> Unit,
    onOpen: () -> Unit,
) {
    val haptic = rememberHapticPerformer()
    val reduceMotion = rememberShouldReduceAnimations()
    val scale = remember(pick) { Animatable(if (reduceMotion) 1f else 0.92f) }
    val alpha = remember(pick) { Animatable(if (reduceMotion) 1f else 0f) }

    LaunchedEffect(pick) {
        haptic.premiumUnlock()
        if (!reduceMotion) {
            launch { alpha.animateTo(1f, tween(220)) }
            scale.animateTo(1f, spring(dampingRatio = Spring.DampingRatioMediumBouncy, stiffness = Spring.StiffnessLow))
        }
    }

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .graphicsLayer {
                scaleX = scale.value
                scaleY = scale.value
                this.alpha = alpha.value
            },
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .aspectRatio(1.2f)
                .clip(RoundedCornerShape(24.dp)),
        ) {
            CachedAsyncImage(
                url = pick.imageUrl,
                contentDescription = null,
                modifier = Modifier.fillMaxSize().clickable(onClick = onOpen),
            )
        }
        Spacer(Modifier.height(16.dp))
        Text(
            pick.title ?: "A pick for you",
            style = MaterialTheme.typography.headlineSmall,
            fontWeight = FontWeight.Bold,
            textAlign = TextAlign.Center,
            maxLines = 2,
            overflow = TextOverflow.Ellipsis,
        )
        if (pick.reason.isNotBlank()) {
            Spacer(Modifier.height(8.dp))
            Text(
                pick.reason,
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                textAlign = TextAlign.Center,
            )
        }
        Spacer(Modifier.height(28.dp))
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            OutlinedButton(onClick = onTryAnother, modifier = Modifier.weight(1f)) {
                Text("Try another")
            }
            Button(onClick = onSave, modifier = Modifier.weight(1f)) {
                Text("Save it")
            }
        }
    }
}

@Composable
private fun ErrorState(message: String, onRetry: () -> Unit) {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Icon(
            Icons.Filled.WarningAmber,
            contentDescription = null,
            tint = MaterialTheme.colorScheme.error,
            modifier = Modifier.size(48.dp),
        )
        Spacer(Modifier.height(12.dp))
        Text(
            message,
            style = MaterialTheme.typography.titleMedium,
            fontWeight = FontWeight.SemiBold,
            textAlign = TextAlign.Center,
        )
        Spacer(Modifier.height(16.dp))
        OutlinedButton(onClick = onRetry) { Text("Try again") }
    }
}
