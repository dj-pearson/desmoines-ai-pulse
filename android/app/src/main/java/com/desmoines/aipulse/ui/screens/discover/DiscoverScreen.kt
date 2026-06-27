package com.desmoines.aipulse.ui.screens.discover

import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Bolt
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material3.AssistChip
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilledIconButton
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.IconButtonDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.TextButton
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.desmoines.aipulse.data.model.SwipeItem

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DiscoverScreen(
    state: DiscoverUiState,
    onLike: (SwipeItem) -> Unit,
    onSkip: (SwipeItem) -> Unit,
    onBoost: (SwipeItem) -> Unit,
    onOpenItem: (SwipeItem) -> Unit,
    onReload: () -> Unit,
    onSelectMode: (DiscoverMode) -> Unit,
    onClearFilter: () -> Unit,
    onNavigateBack: () -> Unit,
) {
    var command by remember { mutableStateOf<SwipeCommand?>(null) }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Discover") },
                navigationIcon = {
                    IconButton(onClick = onNavigateBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
                    }
                },
                actions = {
                    if (state.savedCount > 0) {
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            modifier = Modifier
                                .padding(end = 12.dp)
                                .semantics { contentDescription = "${state.savedCount} saved" },
                        ) {
                            Icon(
                                Icons.Filled.Favorite,
                                contentDescription = null,
                                tint = Color(0xFF43A047),
                                modifier = Modifier.size(20.dp),
                            )
                            Spacer(Modifier.size(4.dp))
                            Text(
                                "${state.savedCount}",
                                style = MaterialTheme.typography.titleMedium,
                                fontWeight = FontWeight.SemiBold,
                            )
                        }
                    }
                },
            )
        },
    ) { innerPadding ->
        Column(modifier = Modifier.fillMaxSize().padding(innerPadding)) {
            ModeToggle(
                mode = state.mode,
                enabled = !state.modeLocked,
                onSelectMode = onSelectMode,
            )
            if (state.filterTags.isNotEmpty()) {
                FilterTagStrip(
                    tags = state.filterTags,
                    showClear = !state.modeLocked,
                    onClear = onClearFilter,
                )
            }

            Box(modifier = Modifier.weight(1f).fillMaxWidth()) {
                when {
                    state.isLoading -> CenterStatus { CircularProgressIndicator() }
                    state.errorMessage != null -> CenterStatus {
                        Column(horizontalAlignment = Alignment.CenterHorizontally) {
                            Text(
                                state.errorMessage,
                                style = MaterialTheme.typography.titleMedium,
                                fontWeight = FontWeight.SemiBold,
                            )
                            Spacer(Modifier.height(12.dp))
                            OutlinedButton(onClick = onReload) { Text("Try again") }
                        }
                    }
                    state.isEmpty -> CenterStatus {
                        Column(horizontalAlignment = Alignment.CenterHorizontally) {
                            Text(
                                "You're all caught up",
                                style = MaterialTheme.typography.titleMedium,
                                fontWeight = FontWeight.SemiBold,
                            )
                            Spacer(Modifier.height(4.dp))
                            Text(
                                "Come back later for fresh picks.",
                                style = MaterialTheme.typography.bodyMedium,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                            Spacer(Modifier.height(12.dp))
                            OutlinedButton(onClick = onReload) { Text("Refresh") }
                        }
                    }
                    else -> Box(modifier = Modifier.fillMaxSize().padding(horizontal = 16.dp)) {
                        SwipeCardStack(
                            items = state.items,
                            onLike = onLike,
                            onSkip = onSkip,
                            onBoost = onBoost,
                            onTap = onOpenItem,
                            command = command,
                            onCommandConsumed = { command = null },
                        )
                    }
                }
            }

            if (state.items.isNotEmpty() && !state.isLoading) {
                ActionBar(
                    onSkip = { command = SwipeCommand.SKIP },
                    onBoost = { command = SwipeCommand.BOOST },
                    onLike = { command = SwipeCommand.LIKE },
                )
            }
        }
    }
}

@Composable
private fun ModeToggle(mode: DiscoverMode, enabled: Boolean, onSelectMode: (DiscoverMode) -> Unit) {
    Row(
        modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        DiscoverMode.entries.forEach { entry ->
            FilterChip(
                selected = entry == mode,
                enabled = enabled,
                onClick = { onSelectMode(entry) },
                label = { Text(entry.title) },
            )
        }
    }
}

@Composable
private fun FilterTagStrip(tags: List<String>, showClear: Boolean, onClear: () -> Unit) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .horizontalScroll(rememberScrollState())
            .padding(horizontal = 16.dp, vertical = 4.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        tags.forEach { tag ->
            AssistChip(onClick = {}, label = { Text(tag) })
        }
        if (showClear) {
            TextButton(onClick = onClear) { Text("Clear") }
        }
    }
}

@Composable
private fun ActionBar(onSkip: () -> Unit, onBoost: () -> Unit, onLike: () -> Unit) {
    Row(
        modifier = Modifier.fillMaxWidth().padding(vertical = 20.dp),
        horizontalArrangement = Arrangement.Center,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        ActionButton(
            icon = Icons.Filled.Close,
            description = "Skip",
            tint = Color(0xFFE53935),
            size = 56.dp,
            onClick = onSkip,
        )
        Spacer(Modifier.size(28.dp))
        ActionButton(
            icon = Icons.Filled.Bolt,
            description = "More like this",
            tint = Color(0xFF1E88E5),
            size = 48.dp,
            onClick = onBoost,
        )
        Spacer(Modifier.size(28.dp))
        ActionButton(
            icon = Icons.Filled.Favorite,
            description = "Like",
            tint = Color(0xFF43A047),
            size = 56.dp,
            onClick = onLike,
        )
    }
}

@Composable
private fun ActionButton(
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    description: String,
    tint: Color,
    size: androidx.compose.ui.unit.Dp,
    onClick: () -> Unit,
) {
    FilledIconButton(
        onClick = onClick,
        shape = CircleShape,
        modifier = Modifier.size(size).semantics { contentDescription = description },
        colors = IconButtonDefaults.filledIconButtonColors(
            containerColor = MaterialTheme.colorScheme.surfaceVariant,
            contentColor = tint,
        ),
    ) {
        Icon(icon, contentDescription = null, modifier = Modifier.size(size * 0.45f))
    }
}

@Composable
private fun CenterStatus(content: @Composable () -> Unit) {
    Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { content() }
}
