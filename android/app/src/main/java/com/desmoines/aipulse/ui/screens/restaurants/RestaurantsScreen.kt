package com.desmoines.aipulse.ui.screens.restaurants

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.animateContentSize
import androidx.compose.animation.expandVertically
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.shrinkVertically
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AccessTime
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material.icons.filled.FilterList
import androidx.compose.material.icons.filled.LocationOn
import androidx.compose.material.icons.filled.Star
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material.icons.outlined.FavoriteBorder
import androidx.compose.material.icons.outlined.Restaurant
import androidx.compose.material3.Badge
import androidx.compose.material3.BadgedBox
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FilterChipDefaults
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LargeTopAppBar
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.nestedscroll.nestedScroll
import com.desmoines.aipulse.util.rememberHapticPerformer
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.desmoines.aipulse.data.model.PriceRange
import com.desmoines.aipulse.data.model.Restaurant
import com.desmoines.aipulse.data.model.RestaurantSortOption
import com.desmoines.aipulse.data.model.SubscriptionTier
import com.desmoines.aipulse.ui.components.AdBannerView
import com.desmoines.aipulse.ui.components.CachedAsyncImage
import com.desmoines.aipulse.ui.components.EmptyStateView
import com.desmoines.aipulse.ui.components.InlineLoadingView
import com.desmoines.aipulse.ui.components.rememberShimmerBrush

// region Main Screen

/**
 * Restaurants screen (Dining tab) matching iOS RestaurantsView.swift.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun RestaurantsScreen(
    state: RestaurantsScreenState,
    onNavigateToRestaurantDetail: (String) -> Unit = {},
    onNavigateToSubscription: () -> Unit = {},
    onShowFilters: () -> Unit = {},
    onSortBySelected: (RestaurantSortOption) -> Unit = {},
    onToggleOpenNow: () -> Unit = {},
    onClearFilters: () -> Unit = {},
    onRefresh: () -> Unit = {},
    onLoadMore: () -> Unit = {},
    onFavoriteClick: ((String) -> Unit)? = null,
) {
    val scrollBehavior = TopAppBarDefaults.exitUntilCollapsedScrollBehavior()
    val haptic = rememberHapticPerformer()
    val listState = rememberLazyListState()

    // Load more detection
    val shouldLoadMore by remember {
        derivedStateOf {
            val lastVisible = listState.layoutInfo.visibleItemsInfo.lastOrNull()?.index ?: 0
            val totalItems = listState.layoutInfo.totalItemsCount
            lastVisible >= totalItems - 5 && state.hasMore && !state.isLoadingMore
        }
    }
    LaunchedEffect(shouldLoadMore) {
        if (shouldLoadMore) onLoadMore()
    }

    Scaffold(
        topBar = {
            LargeTopAppBar(
                title = { Text("Restaurants") },
                actions = {
                    IconButton(
                        onClick = {
                            haptic.light()
                            onShowFilters()
                        }
                    ) {
                        BadgedBox(
                            badge = {
                                if (state.activeFilterCount > 0) {
                                    Badge { Text("${state.activeFilterCount}") }
                                }
                            }
                        ) {
                            Icon(
                                Icons.Filled.FilterList,
                                contentDescription = "Filters",
                            )
                        }
                    }
                },
                scrollBehavior = scrollBehavior,
            )
        },
        modifier = Modifier.nestedScroll(scrollBehavior.nestedScrollConnection),
    ) { paddingValues ->
        @Suppress("DEPRECATION")
        PullToRefreshBox(
            isRefreshing = state.isRefreshing,
            onRefresh = onRefresh,
            modifier = Modifier
                .fillMaxSize()
                .padding(paddingValues),
        ) {
            LazyColumn(
                state = listState,
                contentPadding = PaddingValues(horizontal = 16.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp),
                modifier = Modifier.fillMaxSize(),
            ) {
                // Sort picker
                item {
                    SortPicker(
                        selectedSort = state.sortBy,
                        showOpenNowOnly = state.showOpenNowOnly,
                        onSortSelected = {
                            haptic.light()
                            onSortBySelected(it)
                        },
                        onToggleOpenNow = {
                            haptic.light()
                            onToggleOpenNow()
                        },
                    )
                }

                // Ad banner
                item {
                    AdBannerView(
                        currentTier = state.currentTier,
                        onUpgradeClick = onNavigateToSubscription,
                    )
                }

                // Active filters bar with animated entrance/exit
                item {
                    AnimatedVisibility(
                        visible = state.activeFilterCount > 0,
                        enter = expandVertically() + fadeIn(),
                        exit = shrinkVertically() + fadeOut(),
                    ) {
                        ActiveFiltersBar(
                            count = state.activeFilterCount,
                            onClearAll = {
                                haptic.light()
                                onClearFilters()
                            },
                        )
                    }
                }

                // Error banner
                if (state.errorMessage != null) {
                    item {
                        ErrorBanner(
                            message = state.errorMessage,
                            onRetry = onRefresh,
                        )
                    }
                }

                // Content
                if (state.isLoading) {
                    items(4) { RestaurantCardSkeleton() }
                } else if (state.restaurants.isEmpty()) {
                    item {
                        EmptyStateView(
                            icon = Icons.Outlined.Restaurant,
                            title = "No Restaurants Found",
                            message = "Try adjusting your filters.",
                            actionTitle = if (state.activeFilterCount > 0) "Clear Filters" else null,
                            onAction = onClearFilters,
                            modifier = Modifier.padding(top = 40.dp),
                        )
                    }
                } else {
                    itemsIndexed(state.restaurants, key = { _, r -> r.id }) { index, restaurant ->
                        RestaurantCard(
                            restaurant = restaurant,
                            isFavorited = false, // Wired in AND-024
                            onFavoriteClick = onFavoriteClick?.let { callback -> { callback(restaurant.id) } },
                            onClick = { onNavigateToRestaurantDetail(restaurant.id) },
                        )
                    }

                    if (state.isLoadingMore) {
                        item { InlineLoadingView() }
                    }
                }

                // Bottom spacing
                item { Spacer(modifier = Modifier.height(8.dp)) }
            }
        }
    }
}

// endregion

// region Sort Picker

@Composable
private fun SortPicker(
    selectedSort: RestaurantSortOption,
    showOpenNowOnly: Boolean,
    onSortSelected: (RestaurantSortOption) -> Unit,
    onToggleOpenNow: () -> Unit,
) {
    LazyRow(
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        // Open Now toggle
        item {
            FilterChip(
                selected = showOpenNowOnly,
                onClick = onToggleOpenNow,
                label = { Text("Open Now", style = MaterialTheme.typography.labelMedium) },
                leadingIcon = {
                    Icon(
                        Icons.Filled.AccessTime,
                        contentDescription = null,
                        modifier = Modifier.size(16.dp),
                    )
                },
                colors = FilterChipDefaults.filterChipColors(
                    selectedContainerColor = Color(0xFF4CAF50),
                    selectedLabelColor = Color.White,
                    selectedLeadingIconColor = Color.White,
                ),
                modifier = Modifier.semantics {
                    contentDescription = if (showOpenNowOnly) "Open Now filter active, tap to show all" else "Open Now filter, tap to show only open restaurants"
                },
            )
        }

        // Sort options
        items(RestaurantSortOption.entries.toList()) { option ->
            FilterChip(
                selected = selectedSort == option,
                onClick = { onSortSelected(option) },
                label = { Text(option.displayName, style = MaterialTheme.typography.labelMedium) },
                colors = FilterChipDefaults.filterChipColors(
                    selectedContainerColor = MaterialTheme.colorScheme.primary,
                    selectedLabelColor = MaterialTheme.colorScheme.onPrimary,
                ),
            )
        }
    }
}

// endregion

// region Active Filters Bar

@Composable
private fun ActiveFiltersBar(
    count: Int,
    onClearAll: () -> Unit,
) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            text = "$count filter${if (count > 1) "s" else ""} active",
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        TextButton(onClick = onClearAll) {
            Text(
                "Clear All",
                style = MaterialTheme.typography.labelSmall.copy(fontWeight = FontWeight.SemiBold),
            )
        }
    }
}

// endregion

// region Error Banner

@Composable
private fun ErrorBanner(
    message: String,
    onRetry: () -> Unit,
) {
    Surface(
        shape = RoundedCornerShape(10.dp),
        color = MaterialTheme.colorScheme.surfaceVariant,
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(12.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            Icon(
                Icons.Filled.Warning,
                contentDescription = null,
                tint = Color(0xFFFFC107),
                modifier = Modifier.size(20.dp),
            )
            Text(
                text = message,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.weight(1f),
            )
            TextButton(onClick = onRetry) {
                Text(
                    "Retry",
                    style = MaterialTheme.typography.labelSmall.copy(fontWeight = FontWeight.Bold),
                )
            }
        }
    }
}

// endregion

// region Restaurant Card

/**
 * Restaurant card matching iOS RestaurantCardView.swift.
 * Horizontal layout: image | content (name, cuisine, rating, location, open status).
 */
@Composable
fun RestaurantCard(
    restaurant: Restaurant,
    isFavorited: Boolean = false,
    onFavoriteClick: (() -> Unit)? = null,
    onClick: () -> Unit = {},
) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick)
            .semantics {
                contentDescription = "${restaurant.name}, ${restaurant.cuisine ?: "restaurant"}, ${restaurant.ratingText}"
            },
        shape = RoundedCornerShape(14.dp),
        elevation = CardDefaults.cardElevation(defaultElevation = 2.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
    ) {
        Row(
            modifier = Modifier.padding(10.dp),
            horizontalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            // Image
            CachedAsyncImage(
                url = restaurant.imageUrl,
                contentDescription = restaurant.name,
                modifier = Modifier
                    .size(100.dp)
                    .clip(RoundedCornerShape(12.dp)),
                fallbackIcon = Icons.Outlined.Restaurant,
            )

            // Content
            Column(
                modifier = Modifier.weight(1f),
                verticalArrangement = Arrangement.spacedBy(6.dp),
            ) {
                // Name + Favorite
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(
                        text = restaurant.name,
                        style = MaterialTheme.typography.titleSmall.copy(fontWeight = FontWeight.SemiBold),
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                        modifier = Modifier.weight(1f),
                    )
                    if (onFavoriteClick != null) {
                        IconButton(
                            onClick = onFavoriteClick,
                            modifier = Modifier.size(24.dp),
                        ) {
                            Icon(
                                imageVector = if (isFavorited) Icons.Filled.Favorite else Icons.Outlined.FavoriteBorder,
                                contentDescription = if (isFavorited) "Remove from saved" else "Save restaurant",
                                tint = if (isFavorited) Color.Red else MaterialTheme.colorScheme.onSurfaceVariant,
                                modifier = Modifier.size(16.dp),
                            )
                        }
                    }
                }

                // Cuisine & Price
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    restaurant.cuisine?.let { cuisine ->
                        Text(
                            text = cuisine,
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                    restaurant.priceRange?.let { price ->
                        Text(
                            text = price,
                            style = MaterialTheme.typography.bodySmall.copy(fontWeight = FontWeight.Medium),
                            color = Color(0xFF4CAF50),
                        )
                    }
                }

                // Rating
                restaurant.rating?.let { rating ->
                    Row(
                        horizontalArrangement = Arrangement.spacedBy(3.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        modifier = Modifier.semantics {
                            contentDescription = "${String.format("%.1f", rating)} out of 5 stars"
                        }
                    ) {
                        for (star in 1..5) {
                            val starVal = star.toDouble()
                            Icon(
                                Icons.Filled.Star,
                                contentDescription = null,
                                tint = when {
                                    starVal <= rating -> Color(0xFFFFC107)
                                    starVal - 0.5 <= rating -> Color(0xFFFFC107).copy(alpha = 0.5f)
                                    else -> Color.Gray.copy(alpha = 0.3f)
                                },
                                modifier = Modifier.size(12.dp),
                            )
                        }
                        Text(
                            text = String.format("%.1f", rating),
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }

                // Location + Open Status
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    if (restaurant.displayLocation.isNotBlank()) {
                        Row(
                            horizontalArrangement = Arrangement.spacedBy(4.dp),
                            verticalAlignment = Alignment.CenterVertically,
                            modifier = Modifier.weight(1f),
                        ) {
                            Icon(
                                Icons.Filled.LocationOn,
                                contentDescription = null,
                                tint = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.6f),
                                modifier = Modifier.size(12.dp),
                            )
                            Text(
                                text = restaurant.displayLocation,
                                style = MaterialTheme.typography.labelSmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.6f),
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis,
                            )
                        }
                    }

                    restaurant.isOpenNow()?.let { isOpen ->
                        Row(
                            horizontalArrangement = Arrangement.spacedBy(3.dp),
                            verticalAlignment = Alignment.CenterVertically,
                            modifier = Modifier.semantics {
                                contentDescription = if (isOpen) "Currently open" else "Currently closed"
                            },
                        ) {
                            Box(
                                modifier = Modifier
                                    .size(6.dp)
                                    .clip(CircleShape)
                                    .background(if (isOpen) Color(0xFF4CAF50) else Color(0xFFF44336)),
                            )
                            Text(
                                text = if (isOpen) "Open" else "Closed",
                                style = MaterialTheme.typography.labelSmall.copy(fontWeight = FontWeight.Medium),
                                color = if (isOpen) Color(0xFF4CAF50) else Color(0xFFF44336),
                            )
                        }
                    }
                }
            }
        }
    }
}

// endregion

// region Restaurant Card Skeleton

@Composable
fun RestaurantCardSkeleton() {
    val shimmerBrush = rememberShimmerBrush()

    Card(
        shape = RoundedCornerShape(14.dp),
        elevation = CardDefaults.cardElevation(defaultElevation = 2.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
    ) {
        Row(
            modifier = Modifier.padding(10.dp),
            horizontalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            // Image placeholder
            Box(
                modifier = Modifier
                    .size(100.dp)
                    .clip(RoundedCornerShape(12.dp))
                    .background(shimmerBrush),
            )

            Column(
                modifier = Modifier.weight(1f),
                verticalArrangement = Arrangement.spacedBy(6.dp),
            ) {
                // Name row
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                ) {
                    Box(
                        modifier = Modifier
                            .weight(1f)
                            .height(16.dp)
                            .clip(RoundedCornerShape(4.dp))
                            .background(shimmerBrush),
                    )
                    Spacer(modifier = Modifier.width(8.dp))
                    Box(
                        modifier = Modifier
                            .size(16.dp)
                            .clip(CircleShape)
                            .background(shimmerBrush),
                    )
                }

                // Cuisine + price row
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Box(
                        modifier = Modifier
                            .width(70.dp)
                            .height(12.dp)
                            .clip(RoundedCornerShape(4.dp))
                            .background(shimmerBrush),
                    )
                    Box(
                        modifier = Modifier
                            .width(30.dp)
                            .height(12.dp)
                            .clip(RoundedCornerShape(4.dp))
                            .background(shimmerBrush),
                    )
                }

                // Rating row
                Row(horizontalArrangement = Arrangement.spacedBy(3.dp)) {
                    repeat(5) {
                        Box(
                            modifier = Modifier
                                .size(10.dp)
                                .clip(CircleShape)
                                .background(shimmerBrush),
                        )
                    }
                    Box(
                        modifier = Modifier
                            .width(24.dp)
                            .height(10.dp)
                            .clip(RoundedCornerShape(4.dp))
                            .background(shimmerBrush),
                    )
                }

                // Location row
                Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                    Box(
                        modifier = Modifier
                            .size(9.dp)
                            .clip(CircleShape)
                            .background(shimmerBrush),
                    )
                    Box(
                        modifier = Modifier
                            .width(100.dp)
                            .height(10.dp)
                            .clip(RoundedCornerShape(4.dp))
                            .background(shimmerBrush),
                    )
                }
            }
        }
    }
}

// endregion

// region Restaurant Filter Sheet

/**
 * Filter sheet for restaurants matching iOS RestaurantFilterSheet.
 * Cuisine horizontal scroll multi-select + Price range grid.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun RestaurantFilterSheet(
    availableCuisines: List<String>,
    selectedCuisines: Set<String>,
    selectedPriceRanges: Set<String>,
    onToggleCuisine: (String) -> Unit,
    onTogglePriceRange: (String) -> Unit,
    onClearFilters: () -> Unit,
    onDismiss: () -> Unit,
) {
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = false)

    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = sheetState,
        windowInsets = WindowInsets.navigationBars,
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 16.dp)
                .padding(bottom = 24.dp),
        ) {
            // Header
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                TextButton(onClick = onClearFilters) {
                    Text("Clear")
                }
                Text(
                    "Filters",
                    style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.SemiBold),
                    modifier = Modifier.semantics { heading() }
                )
                TextButton(onClick = onDismiss) {
                    Text("Done", fontWeight = FontWeight.SemiBold)
                }
            }

            Spacer(modifier = Modifier.height(16.dp))

            // Cuisine section
            Text(
                "Cuisine",
                style = MaterialTheme.typography.titleSmall.copy(fontWeight = FontWeight.SemiBold),
                modifier = Modifier.padding(bottom = 8.dp),
            )

            if (availableCuisines.isNotEmpty()) {
                LazyRow(
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    items(availableCuisines) { cuisine ->
                        FilterChip(
                            selected = selectedCuisines.contains(cuisine),
                            onClick = { onToggleCuisine(cuisine) },
                            label = {
                                Text(
                                    cuisine,
                                    style = MaterialTheme.typography.labelSmall.copy(fontWeight = FontWeight.Medium),
                                )
                            },
                            colors = FilterChipDefaults.filterChipColors(
                                selectedContainerColor = MaterialTheme.colorScheme.primary,
                                selectedLabelColor = MaterialTheme.colorScheme.onPrimary,
                            ),
                        )
                    }
                }
            } else {
                Text(
                    "Loading cuisines...",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }

            Spacer(modifier = Modifier.height(20.dp))
            HorizontalDivider()
            Spacer(modifier = Modifier.height(16.dp))

            // Price Range section
            Text(
                "Price Range",
                style = MaterialTheme.typography.titleSmall.copy(fontWeight = FontWeight.SemiBold),
                modifier = Modifier.padding(bottom = 8.dp),
            )

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                PriceRange.entries.forEach { range ->
                    val isSelected = selectedPriceRanges.contains(range.symbol)
                    Surface(
                        onClick = { onTogglePriceRange(range.symbol) },
                        shape = RoundedCornerShape(8.dp),
                        color = if (isSelected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.surfaceVariant,
                        modifier = Modifier.weight(1f),
                    ) {
                        Text(
                            text = range.symbol,
                            style = MaterialTheme.typography.titleSmall.copy(fontWeight = FontWeight.Medium),
                            color = if (isSelected) MaterialTheme.colorScheme.onPrimary else MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier
                                .padding(vertical = 10.dp)
                                .fillMaxWidth(),
                            textAlign = androidx.compose.ui.text.style.TextAlign.Center,
                        )
                    }
                }
            }
        }
    }
}

// endregion
