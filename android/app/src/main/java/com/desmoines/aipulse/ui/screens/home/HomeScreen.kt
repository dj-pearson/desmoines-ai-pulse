package com.desmoines.aipulse.ui.screens.home

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.expandVertically
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.shrinkVertically
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
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.GridItemSpan
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items as gridItems
import androidx.compose.foundation.lazy.grid.itemsIndexed as gridItemsIndexed
import androidx.compose.foundation.lazy.grid.rememberLazyGridState
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CalendarMonth
import androidx.compose.material.icons.filled.FilterList
import androidx.compose.material.icons.filled.Restaurant
import androidx.compose.material.icons.filled.Star
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material.icons.filled.WifiOff
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LargeTopAppBar
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.material3.pulltorefresh.rememberPullToRefreshState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.runtime.snapshotFlow
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.nestedscroll.nestedScroll
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.selected as semanticSelected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.desmoines.aipulse.data.model.DateFilterPreset
import com.desmoines.aipulse.data.model.Event
import com.desmoines.aipulse.data.model.EventCategory
import com.desmoines.aipulse.data.model.Restaurant
import com.desmoines.aipulse.data.model.SubscriptionTier
import com.desmoines.aipulse.ui.components.AdBannerView
import com.desmoines.aipulse.ui.components.EmptyStateView
import com.desmoines.aipulse.ui.components.InlineLoadingView
import com.desmoines.aipulse.ui.components.icon
import com.desmoines.aipulse.ui.theme.BrandOrange
import com.desmoines.aipulse.util.rememberHapticPerformer
import com.desmoines.aipulse.ui.theme.DesMoinesInsiderTheme
import com.desmoines.aipulse.ui.theme.Dimens

/**
 * Home screen UI state. Produced by [EventsViewModel.uiState].
 */
data class HomeScreenState(
    val events: List<Event> = emptyList(),
    val featuredEvents: List<Event> = emptyList(),
    val restaurants: List<Restaurant> = emptyList(),
    val isLoading: Boolean = false,
    val isLoadingMore: Boolean = false,
    val isRefreshing: Boolean = false,
    val hasMore: Boolean = false,
    val totalCount: Int = 0,
    val errorMessage: String? = null,
    val selectedCategory: EventCategory? = null,
    val selectedDatePreset: DateFilterPreset? = null,
    val showFeaturedOnly: Boolean = false,
    val activeFilterCount: Int = 0,
    val currentTier: SubscriptionTier = SubscriptionTier.FREE,
    val isConnected: Boolean = true,
)

/**
 * Main Home screen matching iOS HomeView.swift.
 * Features: header, date presets, category chips, featured events carousel,
 * popular restaurants carousel, active filters bar, vertical events list,
 * pull-to-refresh, skeleton loaders, error/empty states.
 *
 * @param state The current screen state (provided by [EventsViewModel])
 * @param onNavigateToEventDetail Navigate to event detail
 * @param onNavigateToRestaurantDetail Navigate to restaurant detail
 * @param onNavigateToSubscription Navigate to subscription screen
 * @param onSelectCategory Select/deselect a category filter
 * @param onSelectDatePreset Select/deselect a date preset filter
 * @param onShowFilters Open the filter sheet
 * @param onClearFilters Clear all active filters
 * @param onRefresh Trigger pull-to-refresh
 * @param onLoadMore Trigger pagination (load more events)
 * @param onFavoriteClick Toggle event favorite
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun HomeScreen(
    state: HomeScreenState = HomeScreenState(),
    scrollToTopTrigger: Int = 0,
    useWideLayout: Boolean = false,
    onNavigateToEventDetail: (String) -> Unit = {},
    onNavigateToRestaurantDetail: (String) -> Unit = {},
    onNavigateToSubscription: () -> Unit = {},
    onNavigateToTripPlanner: () -> Unit = {},
    onNavigateToDiscover: () -> Unit = {},
    onNavigateToSurpriseMe: () -> Unit = {},
    onNavigateToWeekend: () -> Unit = {},
    onSelectCategory: (EventCategory?) -> Unit = {},
    onSelectDatePreset: (DateFilterPreset?) -> Unit = {},
    onShowFilters: () -> Unit = {},
    onClearFilters: () -> Unit = {},
    onRefresh: () -> Unit = {},
    onLoadMore: () -> Unit = {},
    onFavoriteClick: ((String) -> Unit)? = null,
) {
    val haptic = rememberHapticPerformer()
    val scrollBehavior = TopAppBarDefaults.exitUntilCollapsedScrollBehavior()
    val listState = rememberLazyListState()
    val gridState = rememberLazyGridState()

    // Scroll to top when the user re-taps the active bottom nav tab
    LaunchedEffect(scrollToTopTrigger) {
        if (scrollToTopTrigger > 0) {
            if (useWideLayout) {
                gridState.animateScrollToItem(0)
            } else {
                listState.animateScrollToItem(0)
            }
        }
    }

    // Trigger load more when within 5 items of end
    LaunchedEffect(listState) {
        snapshotFlow {
            val layoutInfo = listState.layoutInfo
            val totalItems = layoutInfo.totalItemsCount
            val lastVisibleIndex = layoutInfo.visibleItemsInfo.lastOrNull()?.index ?: 0
            lastVisibleIndex to totalItems
        }.collect { (lastVisible, total) ->
            if (total > 0 && lastVisible >= total - 5 && state.hasMore && !state.isLoadingMore) {
                onLoadMore()
            }
        }
    }

    // Load more trigger for grid layout
    LaunchedEffect(gridState) {
        snapshotFlow {
            val layoutInfo = gridState.layoutInfo
            val totalItems = layoutInfo.totalItemsCount
            val lastVisibleIndex = layoutInfo.visibleItemsInfo.lastOrNull()?.index ?: 0
            lastVisibleIndex to totalItems
        }.collect { (lastVisible, total) ->
            if (total > 0 && lastVisible >= total - 5 && state.hasMore && !state.isLoadingMore) {
                onLoadMore()
            }
        }
    }

    Scaffold(
        topBar = {
            LargeTopAppBar(
                title = { Text("Des Moines Insider") },
                actions = {
                    // Filter button with badge
                    FilterButton(
                        activeFilterCount = state.activeFilterCount,
                        onClick = {
                            haptic.light()
                            onShowFilters()
                        }
                    )
                },
                scrollBehavior = scrollBehavior,
                colors = TopAppBarDefaults.largeTopAppBarColors(
                    containerColor = MaterialTheme.colorScheme.surface,
                    scrolledContainerColor = MaterialTheme.colorScheme.surface,
                )
            )
        },
        modifier = Modifier.nestedScroll(scrollBehavior.nestedScrollConnection)
    ) { padding ->
        val pullToRefreshState = rememberPullToRefreshState()

        // Haptic feedback on pull-to-refresh completion
        var wasRefreshing by remember { mutableStateOf(false) }
        LaunchedEffect(state.isRefreshing) {
            if (wasRefreshing && !state.isRefreshing) {
                haptic.medium()
            }
            wasRefreshing = state.isRefreshing
        }

        PullToRefreshBox(
            isRefreshing = state.isRefreshing,
            onRefresh = onRefresh,
            state = pullToRefreshState,
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
        ) {
            if (useWideLayout) {
                // Tablet / landscape: 2-column grid for event cards
                LazyVerticalGrid(
                    columns = GridCells.Fixed(2),
                    state = gridState,
                    modifier = Modifier.fillMaxSize()
                ) {
                    // Full-span header sections
                    item(key = "header", span = { GridItemSpan(maxLineSpan) }) {
                        HeaderSection(totalCount = state.totalCount)
                    }
                    item(key = "datePresets", span = { GridItemSpan(maxLineSpan) }) {
                        DatePresetsRow(
                            selected = state.selectedDatePreset,
                            onSelect = { preset ->
                                haptic.light()
                                onSelectDatePreset(
                                    if (state.selectedDatePreset == preset) null else preset
                                )
                            }
                        )
                    }
                    item(key = "categoryChips", span = { GridItemSpan(maxLineSpan) }) {
                        CategoryChipsRow(
                            selected = state.selectedCategory,
                            onSelect = { category ->
                                haptic.light()
                                onSelectCategory(
                                    if (state.selectedCategory == category) null else category
                                )
                            }
                        )
                    }
                    item(key = "tripPlanner", span = { GridItemSpan(maxLineSpan) }) {
                        TripPlannerHomeCard(onClick = onNavigateToTripPlanner)
                    }
                    item(key = "discover", span = { GridItemSpan(maxLineSpan) }) {
                        DiscoverHomeCard(onClick = onNavigateToDiscover)
                    }
                    item(key = "surpriseMe", span = { GridItemSpan(maxLineSpan) }) {
                        SurpriseMeHomeCard(onClick = onNavigateToSurpriseMe)
                    }
                    item(key = "weekend", span = { GridItemSpan(maxLineSpan) }) {
                        WeekendHomeCard(onClick = onNavigateToWeekend)
                    }
                    item(key = "forYou", span = { GridItemSpan(maxLineSpan) }) {
                        ForYouRail(onNavigateToEvent = onNavigateToEventDetail)
                    }
                    if (state.errorMessage != null) {
                        item(key = "error", span = { GridItemSpan(maxLineSpan) }) {
                            ErrorBanner(message = state.errorMessage, onRetry = onRefresh)
                        }
                    }
                    if (state.featuredEvents.isNotEmpty()) {
                        item(key = "featured", span = { GridItemSpan(maxLineSpan) }) {
                            FeaturedEventsSection(
                                events = state.featuredEvents,
                                onEventClick = onNavigateToEventDetail
                            )
                        }
                    }
                    item(key = "adBanner", span = { GridItemSpan(maxLineSpan) }) {
                        AdBannerView(
                            currentTier = state.currentTier,
                            onUpgradeClick = onNavigateToSubscription,
                            modifier = Modifier
                                .padding(horizontal = Dimens.SpacingLg)
                                .padding(vertical = 4.dp)
                        )
                    }
                    if (state.restaurants.isNotEmpty()) {
                        item(key = "restaurants", span = { GridItemSpan(maxLineSpan) }) {
                            val topRestaurants = remember(state.restaurants) {
                                state.restaurants.take(10)
                            }
                            RestaurantsSection(
                                restaurants = topRestaurants,
                                onRestaurantClick = onNavigateToRestaurantDetail
                            )
                        }
                    }
                    item(key = "activeFilters", span = { GridItemSpan(maxLineSpan) }) {
                        AnimatedVisibility(
                            visible = state.activeFilterCount > 0,
                            enter = expandVertically() + fadeIn(),
                            exit = shrinkVertically() + fadeOut(),
                        ) {
                            ActiveFiltersBar(
                                count = state.activeFilterCount,
                                onClear = {
                                    haptic.light()
                                    onClearFilters()
                                }
                            )
                        }
                    }

                    // 2-column event cards or full-span states
                    if (state.isLoading) {
                        items(count = 6) {
                            EventCardSkeleton(
                                modifier = Modifier
                                    .padding(horizontal = Dimens.SpacingMd)
                                    .padding(vertical = 4.dp)
                            )
                        }
                    } else if (state.events.isEmpty() && !state.isConnected) {
                        item(key = "offline", span = { GridItemSpan(maxLineSpan) }) {
                            EmptyStateView(
                                icon = Icons.Filled.WifiOff,
                                title = "You're Offline",
                                message = "Check your internet connection and try again.",
                                actionTitle = "Retry",
                                onAction = onRefresh,
                                modifier = Modifier.padding(top = 40.dp)
                            )
                        }
                    } else if (state.events.isEmpty()) {
                        item(key = "empty", span = { GridItemSpan(maxLineSpan) }) {
                            EmptyStateView(
                                icon = Icons.Filled.CalendarMonth,
                                title = "No Events Found",
                                message = "Try adjusting your filters or check back later.",
                                actionTitle = if (state.activeFilterCount > 0) "Clear Filters" else null,
                                onAction = if (state.activeFilterCount > 0) onClearFilters else null,
                                modifier = Modifier.padding(top = 40.dp)
                            )
                        }
                    } else {
                        gridItemsIndexed(
                            items = state.events,
                            key = { _, event -> event.id }
                        ) { _, event ->
                            EventCardView(
                                event = event,
                                onFavoriteClick = onFavoriteClick,
                                modifier = Modifier
                                    .padding(horizontal = Dimens.SpacingMd)
                                    .padding(vertical = 4.dp)
                                    .clickable { onNavigateToEventDetail(event.id) }
                            )
                        }
                        if (state.isLoadingMore) {
                            item(key = "loadMore", span = { GridItemSpan(maxLineSpan) }) {
                                InlineLoadingView()
                            }
                        }
                    }
                    item(key = "bottomSpacer", span = { GridItemSpan(maxLineSpan) }) {
                        Spacer(modifier = Modifier.height(20.dp))
                    }
                }
            } else {
                // Phone: single-column LazyColumn
                LazyColumn(
                    state = listState,
                    modifier = Modifier.fillMaxSize()
                ) {
                    item(key = "header") {
                        HeaderSection(totalCount = state.totalCount)
                    }
                    item(key = "datePresets") {
                        DatePresetsRow(
                            selected = state.selectedDatePreset,
                            onSelect = { preset ->
                                haptic.light()
                                onSelectDatePreset(
                                    if (state.selectedDatePreset == preset) null else preset
                                )
                            }
                        )
                    }
                    item(key = "categoryChips") {
                        CategoryChipsRow(
                            selected = state.selectedCategory,
                            onSelect = { category ->
                                haptic.light()
                                onSelectCategory(
                                    if (state.selectedCategory == category) null else category
                                )
                            }
                        )
                    }
                    item(key = "tripPlanner") {
                        TripPlannerHomeCard(onClick = onNavigateToTripPlanner)
                    }
                    item(key = "discover") {
                        DiscoverHomeCard(onClick = onNavigateToDiscover)
                    }
                    item(key = "surpriseMe") {
                        SurpriseMeHomeCard(onClick = onNavigateToSurpriseMe)
                    }
                    item(key = "weekend") {
                        WeekendHomeCard(onClick = onNavigateToWeekend)
                    }
                    item(key = "forYou") {
                        ForYouRail(onNavigateToEvent = onNavigateToEventDetail)
                    }
                    if (state.errorMessage != null) {
                        item(key = "error") {
                            ErrorBanner(message = state.errorMessage, onRetry = onRefresh)
                        }
                    }
                    if (state.featuredEvents.isNotEmpty()) {
                        item(key = "featured") {
                            FeaturedEventsSection(
                                events = state.featuredEvents,
                                onEventClick = onNavigateToEventDetail
                            )
                        }
                    }
                    item(key = "adBanner") {
                        AdBannerView(
                            currentTier = state.currentTier,
                            onUpgradeClick = onNavigateToSubscription,
                            modifier = Modifier
                                .padding(horizontal = Dimens.SpacingLg)
                                .padding(vertical = 4.dp)
                        )
                    }
                    if (state.restaurants.isNotEmpty()) {
                        item(key = "restaurants") {
                            val topRestaurants = remember(state.restaurants) {
                                state.restaurants.take(10)
                            }
                            RestaurantsSection(
                                restaurants = topRestaurants,
                                onRestaurantClick = onNavigateToRestaurantDetail
                            )
                        }
                    }
                    item(key = "activeFilters") {
                        AnimatedVisibility(
                            visible = state.activeFilterCount > 0,
                            enter = expandVertically() + fadeIn(),
                            exit = shrinkVertically() + fadeOut(),
                        ) {
                            ActiveFiltersBar(
                                count = state.activeFilterCount,
                                onClear = {
                                    haptic.light()
                                    onClearFilters()
                                }
                            )
                        }
                    }
                    if (state.isLoading) {
                        items(6) {
                            EventCardSkeleton(
                                modifier = Modifier
                                    .padding(horizontal = Dimens.SpacingLg)
                                    .padding(vertical = 4.dp)
                            )
                        }
                    } else if (state.events.isEmpty() && !state.isConnected) {
                        item(key = "offline") {
                            EmptyStateView(
                                icon = Icons.Filled.WifiOff,
                                title = "You're Offline",
                                message = "Check your internet connection and try again.",
                                actionTitle = "Retry",
                                onAction = onRefresh,
                                modifier = Modifier.padding(top = 40.dp)
                            )
                        }
                    } else if (state.events.isEmpty()) {
                        item(key = "empty") {
                            EmptyStateView(
                                icon = Icons.Filled.CalendarMonth,
                                title = "No Events Found",
                                message = "Try adjusting your filters or check back later.",
                                actionTitle = if (state.activeFilterCount > 0) "Clear Filters" else null,
                                onAction = if (state.activeFilterCount > 0) onClearFilters else null,
                                modifier = Modifier.padding(top = 40.dp)
                            )
                        }
                    } else {
                        itemsIndexed(
                            items = state.events,
                            key = { _, event -> event.id }
                        ) { _, event ->
                            EventCardView(
                                event = event,
                                onFavoriteClick = onFavoriteClick,
                                modifier = Modifier
                                    .padding(horizontal = Dimens.SpacingLg)
                                    .padding(vertical = 4.dp)
                                    .clickable { onNavigateToEventDetail(event.id) }
                            )
                        }
                        if (state.isLoadingMore) {
                            item(key = "loadMore") {
                                InlineLoadingView()
                            }
                        }
                    }
                    item(key = "bottomSpacer") {
                        Spacer(modifier = Modifier.height(20.dp))
                    }
                }
            }
        }
    }
}

// region Sub-sections

@Composable
private fun HeaderSection(totalCount: Int) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = Dimens.SpacingLg)
            .padding(top = 4.dp)
    ) {
        Text(
            text = "What's happening in Des Moines",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.semantics { heading() }
        )
        if (totalCount > 0) {
            Text(
                text = "$totalCount upcoming events",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.7f)
            )
        }
    }
}

@Composable
private fun DatePresetsRow(
    selected: DateFilterPreset?,
    onSelect: (DateFilterPreset) -> Unit
) {
    LazyRow(
        contentPadding = PaddingValues(horizontal = Dimens.SpacingLg),
        horizontalArrangement = Arrangement.spacedBy(10.dp),
        modifier = Modifier.padding(vertical = 10.dp)
    ) {
        items(DateFilterPreset.entries.toList()) { preset ->
            val isSelected = selected == preset
            Text(
                text = preset.displayName,
                style = MaterialTheme.typography.bodyMedium,
                fontWeight = FontWeight.Medium,
                color = if (isSelected) Color.White else MaterialTheme.colorScheme.onSurface,
                modifier = Modifier
                    .clip(RoundedCornerShape(50))
                    .background(
                        if (isSelected) MaterialTheme.colorScheme.primary
                        else MaterialTheme.colorScheme.surfaceVariant
                    )
                    .clickable { onSelect(preset) }
                    .padding(horizontal = 14.dp, vertical = 8.dp)
                    .semantics {
                        contentDescription = "Filter by ${preset.displayName}" +
                                if (isSelected) ", selected" else ""
                        semanticSelected = isSelected
                    }
            )
        }
    }
}

@Composable
private fun CategoryChipsRow(
    selected: EventCategory?,
    onSelect: (EventCategory) -> Unit
) {
    // Show first 8 categories matching iOS
    val categories = EventCategory.entries.take(8)

    LazyRow(
        contentPadding = PaddingValues(horizontal = Dimens.SpacingLg),
        horizontalArrangement = Arrangement.spacedBy(10.dp),
        modifier = Modifier.padding(bottom = 8.dp)
    ) {
        items(categories) { category ->
            val isSelected = selected == category
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(6.dp),
                modifier = Modifier
                    .clip(RoundedCornerShape(50))
                    .background(
                        if (isSelected) category.color.copy(alpha = 0.2f)
                        else MaterialTheme.colorScheme.surfaceVariant
                    )
                    .then(
                        if (isSelected) Modifier.background(Color.Transparent)
                        else Modifier
                    )
                    .clickable { onSelect(category) }
                    .padding(horizontal = 12.dp, vertical = 7.dp)
                    .semantics {
                        contentDescription = "Filter by ${category.displayName}" +
                                if (isSelected) ", selected" else ""
                        semanticSelected = isSelected
                    }
            ) {
                Icon(
                    imageVector = category.icon,
                    contentDescription = null,
                    modifier = Modifier.size(14.dp),
                    tint = if (isSelected) category.color else MaterialTheme.colorScheme.onSurfaceVariant
                )
                Text(
                    text = category.displayName,
                    style = MaterialTheme.typography.labelMedium,
                    fontWeight = FontWeight.Medium,
                    color = if (isSelected) category.color else MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
        }
    }
}

@Composable
private fun FeaturedEventsSection(
    events: List<Event>,
    onEventClick: (String) -> Unit
) {
    Column(
        modifier = Modifier.padding(vertical = 8.dp)
    ) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            modifier = Modifier
                .padding(horizontal = Dimens.SpacingLg)
                .semantics { heading() }
        ) {
            Icon(
                imageVector = Icons.Filled.Star,
                contentDescription = null,
                modifier = Modifier.size(20.dp),
                tint = BrandOrange
            )
            Spacer(modifier = Modifier.width(6.dp))
            Text(
                text = "Featured",
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.Bold,
                color = BrandOrange
            )
        }

        Spacer(modifier = Modifier.height(Dimens.SpacingMd))

        LazyRow(
            contentPadding = PaddingValues(horizontal = Dimens.SpacingLg),
            horizontalArrangement = Arrangement.spacedBy(14.dp)
        ) {
            items(events, key = { it.id }) { event ->
                FeaturedEventCard(
                    event = event,
                    modifier = Modifier
                        .clickable { onEventClick(event.id) }
                        .semantics {
                            contentDescription = event.featuredCardAccessibilityLabel
                        }
                )
            }
        }
    }
}

@Composable
private fun RestaurantsSection(
    restaurants: List<Restaurant>,
    onRestaurantClick: (String) -> Unit
) {
    Column(
        modifier = Modifier.padding(vertical = 8.dp)
    ) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            modifier = Modifier
                .padding(horizontal = Dimens.SpacingLg)
                .semantics { heading() }
        ) {
            Icon(
                imageVector = Icons.Filled.Restaurant,
                contentDescription = null,
                modifier = Modifier.size(20.dp),
                tint = BrandOrange
            )
            Spacer(modifier = Modifier.width(6.dp))
            Text(
                text = "Popular Restaurants",
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.Bold,
                color = BrandOrange
            )
        }

        Spacer(modifier = Modifier.height(Dimens.SpacingMd))

        LazyRow(
            contentPadding = PaddingValues(horizontal = Dimens.SpacingLg),
            horizontalArrangement = Arrangement.spacedBy(14.dp)
        ) {
            items(restaurants, key = { it.id }) { restaurant ->
                CompactRestaurantCard(
                    restaurant = restaurant,
                    modifier = Modifier
                        .clickable { onRestaurantClick(restaurant.id) }
                        .semantics {
                            contentDescription = restaurant.compactCardAccessibilityLabel
                        }
                )
            }
        }
    }
}

@Composable
private fun ErrorBanner(
    message: String,
    onRetry: () -> Unit
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = Dimens.SpacingLg, vertical = 4.dp)
            .clip(RoundedCornerShape(10.dp))
            .background(MaterialTheme.colorScheme.surfaceVariant)
            .padding(12.dp)
            .semantics { contentDescription = "Error: $message. Tap retry to try again." },
        verticalAlignment = Alignment.CenterVertically
    ) {
        Icon(
            imageVector = Icons.Filled.Warning,
            contentDescription = null,
            modifier = Modifier.size(20.dp),
            tint = Color(0xFFFFC107) // yellow
        )
        Spacer(modifier = Modifier.width(10.dp))
        Text(
            text = message,
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            maxLines = 2,
            modifier = Modifier.weight(1f)
        )
        TextButton(onClick = onRetry) {
            Text(
                text = "Retry",
                style = MaterialTheme.typography.labelMedium,
                fontWeight = FontWeight.Bold,
                color = MaterialTheme.colorScheme.primary
            )
        }
    }
}

@Composable
private fun ActiveFiltersBar(
    count: Int,
    onClear: () -> Unit
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = Dimens.SpacingLg, vertical = 6.dp)
            .semantics {
                contentDescription = "$count ${if (count == 1) "filter" else "filters"} active"
            },
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically
    ) {
        Text(
            text = "$count filter${if (count > 1) "s" else ""} active",
            style = MaterialTheme.typography.labelMedium,
            fontWeight = FontWeight.Medium,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
        TextButton(onClick = onClear) {
            Text(
                text = "Clear All",
                style = MaterialTheme.typography.labelMedium,
                fontWeight = FontWeight.SemiBold,
                color = MaterialTheme.colorScheme.primary
            )
        }
    }
}

@Composable
private fun FilterButton(
    activeFilterCount: Int,
    onClick: () -> Unit
) {
    IconButton(onClick = onClick) {
        Box {
            Icon(
                imageVector = Icons.Filled.FilterList,
                contentDescription = if (activeFilterCount > 0)
                    "Filters, $activeFilterCount active"
                else "Filters, no active filters"
            )
            if (activeFilterCount > 0) {
                Box(
                    modifier = Modifier
                        .align(Alignment.TopEnd)
                        .offset(x = 4.dp, y = (-4).dp)
                        .size(16.dp)
                        .clip(CircleShape)
                        .background(Color.Red),
                    contentAlignment = Alignment.Center
                ) {
                    Text(
                        text = "$activeFilterCount",
                        fontSize = 10.sp,
                        fontWeight = FontWeight.Bold,
                        color = Color.White
                    )
                }
            }
        }
    }
}

// endregion

@Preview(showBackground = true)
@Composable
private fun HomeScreenPreview() {
    DesMoinesInsiderTheme {
        HomeScreen(
            state = HomeScreenState(
                events = Event.previewList,
                featuredEvents = Event.previewList.filter { it.isFeatured == true },
                restaurants = listOf(Restaurant.preview),
                totalCount = 42,
                isConnected = true,
            )
        )
    }
}

@Preview(showBackground = true)
@Composable
private fun HomeScreenLoadingPreview() {
    DesMoinesInsiderTheme {
        HomeScreen(
            state = HomeScreenState(isLoading = true)
        )
    }
}

@Preview(showBackground = true)
@Composable
private fun HomeScreenEmptyPreview() {
    DesMoinesInsiderTheme {
        HomeScreen(
            state = HomeScreenState(
                activeFilterCount = 2,
                selectedCategory = EventCategory.MUSIC
            )
        )
    }
}
