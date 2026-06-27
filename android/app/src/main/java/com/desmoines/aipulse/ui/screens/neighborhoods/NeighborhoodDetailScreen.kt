package com.desmoines.aipulse.ui.screens.neighborhoods

import android.Manifest
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
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
import androidx.compose.material.icons.filled.NearMe
import androidx.compose.material3.AssistChip
import androidx.compose.material3.AssistChipDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.desmoines.aipulse.data.model.Attraction
import com.desmoines.aipulse.data.model.Restaurant
import com.desmoines.aipulse.ui.components.CachedAsyncImage
import com.desmoines.aipulse.ui.screens.home.EventCardView

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun NeighborhoodDetailScreen(
    state: NeighborhoodDetailUiState,
    onSortByNearby: () -> Unit,
    onOpenRestaurant: (String) -> Unit,
    onOpenAttraction: (String) -> Unit,
    onOpenEvent: (String) -> Unit,
    onNavigateBack: () -> Unit,
) {
    val permissionLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestPermission(),
    ) { granted -> if (granted) onSortByNearby() }

    Scaffold(
        topBar = {
            androidx.compose.material3.TopAppBar(
                title = { Text(state.neighborhood?.name ?: "Neighborhood") },
                navigationIcon = {
                    IconButton(onClick = onNavigateBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
                    }
                },
            )
        },
    ) { innerPadding ->
        Box(modifier = Modifier.fillMaxSize().padding(innerPadding)) {
            when {
                state.isLoading -> SkeletonList()
                state.isEmpty -> EmptyState()
                else -> LazyColumn(
                    modifier = Modifier.fillMaxSize(),
                    contentPadding = PaddingValues(bottom = 24.dp),
                ) {
                    item(key = "sort") {
                        SortHeader(
                            sorted = state.sortedByDistance,
                            sorting = state.isSorting,
                            onSort = { permissionLauncher.launch(Manifest.permission.ACCESS_FINE_LOCATION) },
                        )
                    }
                    if (state.restaurants.isNotEmpty()) {
                        item(key = "diningHeader") { SectionHeader("Where to eat") }
                        item(key = "diningRail") {
                            CompactRail(state.restaurants.map {
                                CardData(it.id, it.imageUrl, it.name, it.cuisine)
                            }, onOpenRestaurant)
                        }
                    }
                    // Ad slot (free tier) — wired with campaign ad serving in ANDP-040 (#284).
                    if (state.attractions.isNotEmpty()) {
                        item(key = "attractionsHeader") { SectionHeader("Things to do") }
                        item(key = "attractionsRail") {
                            CompactRail(state.attractions.map {
                                CardData(it.id, it.imageUrl, it.name, it.type)
                            }, onOpenAttraction)
                        }
                    }
                    if (state.events.isNotEmpty()) {
                        item(key = "eventsHeader") { SectionHeader("Events") }
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
                }
            }
        }
    }
}

private data class CardData(val id: String, val imageUrl: String?, val title: String, val subtitle: String?)

@Composable
private fun SortHeader(sorted: Boolean, sorting: Boolean, onSort: () -> Unit) {
    Row(
        modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        AssistChip(
            onClick = onSort,
            enabled = !sorted && !sorting,
            leadingIcon = {
                if (sorting) {
                    CircularProgressIndicator(modifier = Modifier.size(16.dp), strokeWidth = 2.dp)
                } else {
                    Icon(Icons.Filled.NearMe, contentDescription = null, modifier = Modifier.size(AssistChipDefaults.IconSize))
                }
            },
            label = { Text(if (sorted) "Sorted by distance from you" else "Sort by what's nearby") },
        )
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
private fun CompactRail(cards: List<CardData>, onOpen: (String) -> Unit) {
    LazyRow(
        contentPadding = PaddingValues(horizontal = 16.dp),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        items(cards, key = { it.id }) { card ->
            Column(modifier = Modifier.width(150.dp).clickable { onOpen(card.id) }) {
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(100.dp)
                        .clip(RoundedCornerShape(14.dp))
                        .background(MaterialTheme.colorScheme.surfaceVariant),
                ) {
                    CachedAsyncImage(url = card.imageUrl, contentDescription = null, modifier = Modifier.fillMaxSize())
                }
                Spacer(Modifier.height(6.dp))
                Text(
                    card.title,
                    style = MaterialTheme.typography.titleSmall,
                    fontWeight = FontWeight.SemiBold,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                card.subtitle?.takeIf { it.isNotBlank() }?.let {
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
private fun SkeletonList() {
    Column(modifier = Modifier.fillMaxSize().padding(16.dp)) {
        repeat(4) {
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(96.dp)
                    .padding(vertical = 6.dp)
                    .clip(RoundedCornerShape(16.dp))
                    .background(MaterialTheme.colorScheme.surfaceVariant),
            )
        }
    }
}

@Composable
private fun EmptyState() {
    Column(
        modifier = Modifier.fillMaxSize().padding(24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Text(
            "Still mapping this area",
            style = MaterialTheme.typography.titleMedium,
            fontWeight = FontWeight.SemiBold,
        )
        Spacer(Modifier.height(4.dp))
        Text(
            "We don't have listings tagged here yet — check back soon.",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}
