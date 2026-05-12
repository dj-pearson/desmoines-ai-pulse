package com.desmoines.aipulse.ui.screens.discover

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.AutoAwesome
import androidx.compose.material.icons.filled.Groups
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.PrimaryTabRow
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Tab
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DiscoverScreen(
    onClose: () -> Unit,
    onOpenGroupSession: () -> Unit,
    onOpenEventDetail: (String) -> Unit,
    onOpenRestaurantDetail: (String) -> Unit,
    initialMode: DiscoverMode = DiscoverMode.MIXED,
    initialFilter: DiscoverFilterContext = DiscoverFilterContext(),
    viewModel: DiscoverViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsState()

    LaunchedEffect(Unit) {
        viewModel.initialize(initialMode, initialFilter)
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(state.mode.title) },
                navigationIcon = {
                    IconButton(onClick = onClose) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Close")
                    }
                },
                actions = {
                    IconButton(onClick = onOpenGroupSession) {
                        Icon(Icons.Filled.Groups, contentDescription = "Start or join a group session")
                    }
                    Text(
                        text = "Saved ${state.likedCount}",
                        style = MaterialTheme.typography.labelLarge,
                        fontWeight = FontWeight.SemiBold,
                        modifier = Modifier.padding(end = 12.dp),
                    )
                },
            )
        },
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding),
        ) {
            // Mode picker
            val tabs = DiscoverMode.entries
            val selectedIndex = tabs.indexOf(state.mode)
            PrimaryTabRow(selectedTabIndex = selectedIndex) {
                tabs.forEachIndexed { i, mode ->
                    Tab(
                        selected = i == selectedIndex,
                        onClick = { viewModel.setMode(mode) },
                        text = { Text(mode.title) },
                    )
                }
            }

            Spacer(modifier = Modifier.height(8.dp))

            // Deck area
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .weight(1f)
                    .padding(horizontal = 20.dp, vertical = 12.dp),
                contentAlignment = Alignment.Center,
            ) {
                when {
                    state.isLoading && state.deck.isEmpty() -> {
                        CircularProgressIndicator()
                    }
                    state.deck.isEmpty() -> {
                        EmptyDeckView()
                    }
                    else -> {
                        SwipeCardStack(
                            items = state.deck,
                            onLike = { viewModel.like(it) },
                            onSkip = { viewModel.skip(it) },
                            onBoost = { viewModel.boost(it) },
                            onTap = { item ->
                                viewModel.recordDetailTap(item)
                                when (item) {
                                    is SwipeItem.EventItem -> onOpenEventDetail(item.event.id)
                                    is SwipeItem.RestaurantItem -> onOpenRestaurantDetail(item.restaurant.id)
                                }
                            },
                        )
                    }
                }
            }

            DiscoverActionBar(
                deckEmpty = state.deck.isEmpty(),
                onSkip = { state.deck.firstOrNull()?.let(viewModel::skip) },
                onBoost = { state.deck.firstOrNull()?.let(viewModel::boost) },
                onLike = { state.deck.firstOrNull()?.let(viewModel::like) },
            )
        }
    }
}

@Composable
private fun EmptyDeckView() {
    Column(
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Icon(
            imageVector = Icons.Filled.AutoAwesome,
            contentDescription = null,
            tint = MaterialTheme.colorScheme.primary,
        )
        Text(
            text = "You've seen everything",
            style = MaterialTheme.typography.titleMedium,
            fontWeight = FontWeight.SemiBold,
        )
        Text(
            text = "Come back later for fresh picks.",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}
