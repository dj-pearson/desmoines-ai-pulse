package com.desmoines.aipulse.ui.screens.hotels

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
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.ArrowDropDown
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.Star
import androidx.compose.material3.AssistChip
import androidx.compose.material3.AssistChipDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.desmoines.aipulse.data.model.Hotel
import com.desmoines.aipulse.data.remote.HotelSort
import com.desmoines.aipulse.ui.components.CachedAsyncImage
import com.desmoines.aipulse.util.rememberHapticPerformer

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun HotelsScreen(
    state: HotelsUiState,
    onSearchTextChanged: (String) -> Unit,
    onToggleArea: (String) -> Unit,
    onTogglePriceRange: (String) -> Unit,
    onSelectMinRating: (Double?) -> Unit,
    onSelectSort: (HotelSort) -> Unit,
    onClearFilters: () -> Unit,
    onLoadMore: () -> Unit,
    onRefresh: () -> Unit,
    onRetry: () -> Unit,
    onOpenHotel: (String) -> Unit,
    onNavigateBack: () -> Unit,
) {
    val haptic = rememberHapticPerformer()
    val listState = rememberLazyListState()

    // Infinite scroll: load the next page when near the end.
    val nearEnd by remember {
        derivedStateOf {
            val last = listState.layoutInfo.visibleItemsInfo.lastOrNull()?.index ?: 0
            state.hotels.isNotEmpty() && last >= state.hotels.size - 3
        }
    }
    LaunchedEffect(nearEnd, state.hasMore) {
        if (nearEnd && state.hasMore) onLoadMore()
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Places to Stay") },
                navigationIcon = {
                    IconButton(onClick = onNavigateBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
                    }
                },
            )
        },
    ) { innerPadding ->
        Column(modifier = Modifier.fillMaxSize().padding(innerPadding)) {
            OutlinedTextField(
                value = state.searchText,
                onValueChange = onSearchTextChanged,
                modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp),
                placeholder = { Text("Search hotels") },
                leadingIcon = { Icon(Icons.Filled.Search, contentDescription = null) },
                singleLine = true,
            )

            // Area chips (multi-select).
            if (state.areas.isNotEmpty()) {
                LazyRow(
                    contentPadding = PaddingValues(horizontal = 16.dp),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    items(state.areas, key = { it }) { area ->
                        FilterChip(
                            selected = area in state.selectedAreas,
                            onClick = { onToggleArea(area) },
                            label = { Text(area) },
                        )
                    }
                }
            }

            // Price toggles + rating/sort menus.
            Row(
                modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 4.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                LazyRow(
                    modifier = Modifier.weight(1f),
                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                ) {
                    items(HotelsViewModel.PRICE_RANGES, key = { it }) { price ->
                        FilterChip(
                            selected = price in state.selectedPriceRanges,
                            onClick = { onTogglePriceRange(price) },
                            label = { Text(price) },
                        )
                    }
                }
                RatingMenu(selected = state.minRating, onSelect = onSelectMinRating)
                SortMenu(selected = state.sort, onSelect = onSelectSort)
            }

            if (state.hasActiveFilters) {
                Row(
                    modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(
                        "${state.activeFilterCount} filter${if (state.activeFilterCount > 1) "s" else ""} active",
                        style = MaterialTheme.typography.labelMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    TextButton(onClick = onClearFilters) { Text("Clear all") }
                }
            }

            Box(modifier = Modifier.fillMaxSize()) {
                when {
                    state.isLoading -> SkeletonList()
                    state.isEmpty -> Text(
                        if (state.hasActiveFilters || state.searchText.isNotBlank()) {
                            "No hotels match your filters."
                        } else {
                            "No hotels found."
                        },
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.align(Alignment.Center).padding(24.dp),
                    )
                    else -> PullToRefreshBox(
                        isRefreshing = state.isRefreshing,
                        onRefresh = { haptic.light(); onRefresh() },
                    ) {
                        LazyColumn(
                            state = listState,
                            modifier = Modifier.fillMaxSize(),
                            contentPadding = PaddingValues(vertical = 8.dp),
                        ) {
                            if (state.errorMessage != null) {
                                item(key = "error") { RetryBanner(state.errorMessage, onRetry) }
                            }
                            items(state.hotels, key = { it.id }) { hotel ->
                                HotelCard(hotel = hotel, onClick = { onOpenHotel(hotel.id) })
                                // In-feed ad after the 3rd card (free tier) — wired with
                                // campaign ad serving in ANDP-040 (#284).
                            }
                            if (state.isLoadingMore) {
                                item(key = "loadingMore") {
                                    Box(modifier = Modifier.fillMaxWidth().padding(16.dp), contentAlignment = Alignment.Center) {
                                        CircularProgressIndicator(modifier = Modifier.height(28.dp))
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun HotelCard(hotel: Hotel, onClick: () -> Unit) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick)
            .padding(horizontal = 16.dp, vertical = 8.dp),
    ) {
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .height(160.dp)
                .clip(RoundedCornerShape(16.dp))
                .background(MaterialTheme.colorScheme.surfaceVariant),
        ) {
            CachedAsyncImage(url = hotel.imageUrl, contentDescription = null, modifier = Modifier.fillMaxSize())
        }
        Spacer(Modifier.height(8.dp))
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(
                hotel.name,
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.Bold,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.weight(1f),
            )
            hotel.ratingLabel?.let { rating ->
                Spacer(Modifier.width(6.dp))
                Icon(
                    Icons.Filled.Star,
                    contentDescription = null,
                    tint = MaterialTheme.colorScheme.primary,
                    modifier = Modifier.size(16.dp),
                )
                Spacer(Modifier.width(2.dp))
                Text(
                    rating,
                    style = MaterialTheme.typography.labelMedium,
                    fontWeight = FontWeight.SemiBold,
                    color = MaterialTheme.colorScheme.onSurface,
                )
            }
        }
        val subtitle = listOfNotNull(
            hotel.locationLine.takeIf { it.isNotBlank() },
            hotel.priceLabel,
        ).joinToString(" · ")
        if (subtitle.isNotBlank()) {
            Text(
                subtitle,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
        val summary = hotel.displaySummary
        if (summary.isNotBlank()) {
            Spacer(Modifier.height(2.dp))
            Text(
                summary,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
            )
        }
        val amenities = hotel.amenityPreview()
        if (amenities.isNotEmpty()) {
            Spacer(Modifier.height(4.dp))
            Text(
                amenities.joinToString(" • "),
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.primary,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun RatingMenu(selected: Double?, onSelect: (Double?) -> Unit) {
    var expanded by remember { mutableStateOf(false) }
    Box {
        AssistChip(
            onClick = { expanded = true },
            label = { Text(selected?.let { ratingLabelOf(it) } ?: "Any") },
            leadingIcon = { Icon(Icons.Filled.Star, contentDescription = null, modifier = Modifier.height(16.dp)) },
            trailingIcon = { Icon(Icons.Filled.ArrowDropDown, contentDescription = null) },
            colors = AssistChipDefaults.assistChipColors(),
        )
        DropdownMenu(expanded = expanded, onDismissRequest = { expanded = false }) {
            DropdownMenuItem(text = { Text("Any rating") }, onClick = { onSelect(null); expanded = false })
            HotelsViewModel.RATING_OPTIONS.forEach { rating ->
                DropdownMenuItem(
                    text = { Text(ratingLabelOf(rating)) },
                    onClick = { onSelect(rating); expanded = false },
                )
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun SortMenu(selected: HotelSort, onSelect: (HotelSort) -> Unit) {
    var expanded by remember { mutableStateOf(false) }
    Box {
        AssistChip(
            onClick = { expanded = true },
            label = { Text(sortLabelOf(selected)) },
            trailingIcon = { Icon(Icons.Filled.ArrowDropDown, contentDescription = null) },
        )
        DropdownMenu(expanded = expanded, onDismissRequest = { expanded = false }) {
            HotelSort.entries.forEach { sort ->
                DropdownMenuItem(
                    text = { Text(sortLabelOf(sort)) },
                    onClick = { onSelect(sort); expanded = false },
                )
            }
        }
    }
}

private fun ratingLabelOf(rating: Double): String {
    val value = if (rating % 1.0 == 0.0) "%.0f".format(rating) else "%.1f".format(rating)
    return "$value+ ★"
}

private fun sortLabelOf(sort: HotelSort): String = when (sort) {
    HotelSort.FEATURED -> "Featured"
    HotelSort.RATING -> "Top rated"
    HotelSort.NAME -> "Name (A–Z)"
    HotelSort.PRICE_LOW -> "Price (low–high)"
    HotelSort.PRICE_HIGH -> "Price (high–low)"
}

@Composable
private fun SkeletonList() {
    Column(modifier = Modifier.fillMaxSize().padding(16.dp)) {
        repeat(5) {
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(200.dp)
                    .padding(vertical = 8.dp)
                    .clip(RoundedCornerShape(16.dp))
                    .background(MaterialTheme.colorScheme.surfaceVariant),
            )
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
