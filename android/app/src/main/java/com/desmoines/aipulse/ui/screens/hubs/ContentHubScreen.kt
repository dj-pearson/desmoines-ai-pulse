package com.desmoines.aipulse.ui.screens.hubs

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
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
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.desmoines.aipulse.data.model.ContentHub
import com.desmoines.aipulse.ui.components.CachedAsyncImage
import com.desmoines.aipulse.ui.screens.home.EventCardView

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ContentHubScreen(
    state: ContentHubUiState,
    onRetry: () -> Unit,
    onOpenEvent: (String) -> Unit,
    onOpenAttraction: (String) -> Unit,
    onOpenRestaurant: (String) -> Unit,
    onNavigateBack: () -> Unit,
) {
    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(state.hub?.title ?: "Hub") },
                navigationIcon = {
                    IconButton(onClick = onNavigateBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
                    }
                },
            )
        },
    ) { innerPadding ->
        Box(modifier = Modifier.fillMaxSize().padding(innerPadding)) {
            val hub = state.hub
            when {
                state.isLoading -> CircularProgressIndicator(modifier = Modifier.align(Alignment.Center))
                hub == null -> Text("Hub not found", modifier = Modifier.align(Alignment.Center))
                else -> LazyColumn(
                    modifier = Modifier.fillMaxSize(),
                    contentPadding = PaddingValues(bottom = 24.dp),
                ) {
                    item(key = "hero") { Hero(hub) }

                    if (state.errorMessage != null) {
                        item(key = "error") { RetryBanner(state.errorMessage, onRetry) }
                    }

                    if (state.events.isNotEmpty()) {
                        item(key = "eventsHeader") { SectionHeader(hub.eventsSectionTitle) }
                        items(state.events, key = { "ev_${it.id}" }) { event ->
                            EventCardView(
                                event = event,
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(horizontal = 16.dp, vertical = 6.dp)
                                    .clickable { onOpenEvent(event.id) },
                            )
                        }
                    }

                    // Ad slot (free tier) between events and the attractions rail —
                    // wired with campaign ad serving in ANDP-040 (#284).

                    if (state.attractions.isNotEmpty()) {
                        item(key = "attractionsHeader") { SectionHeader(hub.attractionsSectionTitle) }
                        item(key = "attractionsRail") {
                            CompactRail(state.attractions.map { Triple(it.id, it.imageUrl, Pair<String, String?>(it.name, it.type)) }, onOpenAttraction)
                        }
                    }
                    if (state.dining.isNotEmpty()) {
                        item(key = "diningHeader") { SectionHeader(hub.diningSectionTitle) }
                        item(key = "diningRail") {
                            CompactRail(state.dining.map { Triple(it.id, it.imageUrl, Pair<String, String?>(it.name, it.cuisine)) }, onOpenRestaurant)
                        }
                    }

                    if (state.isEmpty) {
                        item(key = "empty") {
                            Text(
                                "Nothing here yet — check back soon.",
                                style = MaterialTheme.typography.bodyMedium,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                modifier = Modifier.fillMaxWidth().padding(16.dp),
                            )
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun Hero(hub: ContentHub) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(16.dp)
            .clip(RoundedCornerShape(20.dp))
            .background(Brush.verticalGradient(hub.gradient))
            .padding(20.dp),
    ) {
        Icon(hub.icon, contentDescription = null, tint = Color.White, modifier = Modifier.size(32.dp))
        Spacer(Modifier.height(10.dp))
        Text(hub.title, style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold, color = Color.White)
        Spacer(Modifier.height(6.dp))
        Text(hub.blurb, style = MaterialTheme.typography.bodyMedium, color = Color.White.copy(alpha = 0.92f))
    }
}

@Composable
private fun SectionHeader(title: String) {
    Text(
        title,
        style = MaterialTheme.typography.titleMedium,
        fontWeight = FontWeight.Bold,
        modifier = Modifier.fillMaxWidth().padding(start = 16.dp, end = 16.dp, top = 12.dp, bottom = 8.dp),
    )
}

@Composable
private fun CompactRail(cards: List<Triple<String, String?, Pair<String, String?>>>, onOpen: (String) -> Unit) {
    LazyRow(
        contentPadding = PaddingValues(horizontal = 16.dp),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        items(cards, key = { it.first }) { (id, imageUrl, titleSub) ->
            Column(modifier = Modifier.width(150.dp).clickable { onOpen(id) }) {
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(100.dp)
                        .clip(RoundedCornerShape(14.dp))
                        .background(MaterialTheme.colorScheme.surfaceVariant),
                ) {
                    CachedAsyncImage(url = imageUrl, contentDescription = null, modifier = Modifier.fillMaxSize())
                }
                Spacer(Modifier.height(6.dp))
                Text(
                    titleSub.first,
                    style = MaterialTheme.typography.titleSmall,
                    fontWeight = FontWeight.SemiBold,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                titleSub.second?.takeIf { it.isNotBlank() }?.let {
                    Text(
                        it,
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
            }
        }
    }
}

@Composable
private fun RetryBanner(message: String, onRetry: () -> Unit) {
    Surface(
        modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp),
        shape = MaterialTheme.shapes.medium,
        color = MaterialTheme.colorScheme.errorContainer,
    ) {
        Row(modifier = Modifier.padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
            Text(
                message,
                color = MaterialTheme.colorScheme.onErrorContainer,
                style = MaterialTheme.typography.bodySmall,
                modifier = Modifier.weight(1f),
            )
            TextButton(onClick = onRetry) { Text("Retry") }
        }
    }
}
