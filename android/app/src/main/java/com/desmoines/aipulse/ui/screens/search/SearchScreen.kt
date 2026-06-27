package com.desmoines.aipulse.ui.screens.search

import androidx.compose.animation.animateColorAsState
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
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.CalendarToday
import androidx.compose.material.icons.filled.CardGiftcard
import androidx.compose.material.icons.filled.ChevronRight
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Eco
import androidx.compose.material.icons.filled.FamilyRestroom
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material.icons.filled.MusicNote
import androidx.compose.material.icons.filled.Nightlife
import androidx.compose.material.icons.filled.Palette
import androidx.compose.material.icons.filled.Place
import androidx.compose.material.icons.filled.Restaurant
import androidx.compose.material.icons.filled.School
import androidx.compose.material.icons.filled.BookmarkAdd
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.SportsTennis
import androidx.compose.material.icons.filled.Star
import androidx.compose.material.icons.filled.WifiOff
import androidx.compose.material.icons.filled.Work
import androidx.compose.material.icons.outlined.SearchOff
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import com.desmoines.aipulse.util.rememberHapticPerformer
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import com.desmoines.aipulse.data.model.Attraction
import com.desmoines.aipulse.data.model.AttractionType
import com.desmoines.aipulse.data.model.Event
import com.desmoines.aipulse.data.model.EventCategory
import com.desmoines.aipulse.data.model.Restaurant
import com.desmoines.aipulse.ui.components.CachedAsyncImage
import com.desmoines.aipulse.ui.components.EmptyStateView
import com.desmoines.aipulse.ui.theme.DesMoinesInsiderTheme
import com.desmoines.aipulse.ui.theme.Dimens
import java.util.Locale

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SearchScreen(
    state: SearchScreenState = SearchScreenState(),
    isConnected: Boolean = true,
    savedSearches: List<com.desmoines.aipulse.data.model.SavedSearch> = emptyList(),
    onSearchTextChanged: (String) -> Unit = {},
    onTabSelected: (SearchTab) -> Unit = {},
    onClearSearch: () -> Unit = {},
    onSaveCurrentSearch: () -> Unit = {},
    onRerunSavedSearch: (com.desmoines.aipulse.data.model.SavedSearch) -> Unit = {},
    onToggleSavedSearchAlerts: (com.desmoines.aipulse.data.model.SavedSearch) -> Unit = {},
    onDeleteSavedSearch: (com.desmoines.aipulse.data.model.SavedSearch) -> Unit = {},
    onNavigateToEventDetail: (String) -> Unit = {},
    onNavigateToRestaurantDetail: (String) -> Unit = {},
    onNavigateToAttractionDetail: (String) -> Unit = {},
) {
    val haptics = rememberHapticPerformer()

    Column(modifier = Modifier.fillMaxSize()) {
        // Search bar
        SearchBar(
            searchText = state.searchText,
            onSearchTextChanged = onSearchTextChanged,
            onClear = onClearSearch,
        )

        // Tab picker (only shown after searching)
        if (state.hasSearched) {
            SearchTabPicker(
                selectedTab = state.selectedTab,
                state = state,
                onTabSelected = { tab ->
                    haptics.light()
                    onTabSelected(tab)
                },
            )
        }

        // Save the active query as a saved search.
        if (state.hasSearched && state.searchText.isNotBlank()) {
            Row(
                modifier = Modifier.fillMaxWidth().padding(horizontal = 8.dp),
                horizontalArrangement = Arrangement.End,
            ) {
                TextButton(onClick = { haptics.light(); onSaveCurrentSearch() }) {
                    Icon(
                        Icons.Filled.BookmarkAdd,
                        contentDescription = null,
                        modifier = Modifier.size(18.dp),
                    )
                    Spacer(Modifier.width(4.dp))
                    Text("Save search")
                }
            }
        }

        // Content
        when {
            state.searchText.isEmpty() && !state.hasSearched -> {
                Column(modifier = Modifier.fillMaxSize()) {
                    if (savedSearches.isNotEmpty()) {
                        SavedSearchSection(
                            searches = savedSearches,
                            onRerun = onRerunSavedSearch,
                            onToggleAlerts = onToggleSavedSearchAlerts,
                            onDelete = onDeleteSavedSearch,
                        )
                    }
                    SearchSuggestions(
                        onSuggestionSelected = onSearchTextChanged,
                    )
                }
            }
            state.isSearching -> {
                LoadingView()
            }
            state.isEmpty && !isConnected -> {
                EmptyStateView(
                    icon = Icons.Filled.WifiOff,
                    title = "You're Offline",
                    message = "Check your internet connection and try again.",
                    actionTitle = "Retry",
                    onAction = onClearSearch,
                )
            }
            state.isEmpty -> {
                EmptyStateView(
                    icon = Icons.Outlined.SearchOff,
                    title = "No Results",
                    message = "Try a different search term.",
                    actionTitle = "Clear",
                    onAction = onClearSearch,
                )
            }
            else -> {
                ResultsList(
                    state = state,
                    onNavigateToEventDetail = onNavigateToEventDetail,
                    onNavigateToRestaurantDetail = onNavigateToRestaurantDetail,
                    onNavigateToAttractionDetail = onNavigateToAttractionDetail,
                )
            }
        }
    }
}

// region Search Bar

@Composable
private fun SearchBar(
    searchText: String,
    onSearchTextChanged: (String) -> Unit,
    onClear: () -> Unit,
) {
    OutlinedTextField(
        value = searchText,
        onValueChange = onSearchTextChanged,
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = Dimens.SpacingMd, vertical = Dimens.SpacingSm),
        placeholder = {
            Text(
                text = "Search events, restaurants, attractions...",
                style = MaterialTheme.typography.bodyMedium,
            )
        },
        leadingIcon = {
            Icon(
                imageVector = Icons.Filled.Search,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        },
        trailingIcon = {
            if (searchText.isNotEmpty()) {
                IconButton(onClick = onClear) {
                    Icon(
                        imageVector = Icons.Filled.Close,
                        contentDescription = "Clear search",
                        tint = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
        },
        shape = RoundedCornerShape(28.dp),
        singleLine = true,
        colors = OutlinedTextFieldDefaults.colors(
            focusedContainerColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f),
            unfocusedContainerColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f),
            focusedBorderColor = MaterialTheme.colorScheme.primary,
            unfocusedBorderColor = Color.Transparent,
        ),
    )
}

// endregion

// region Tab Picker

@Composable
private fun SearchTabPicker(
    selectedTab: SearchTab,
    state: SearchScreenState,
    onTabSelected: (SearchTab) -> Unit,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = Dimens.SpacingMd)
            .padding(top = Dimens.SpacingSm),
    ) {
        SearchTab.entries.forEach { tab ->
            val isSelected = selectedTab == tab
            val count = state.countFor(tab)
            val indicatorColor = animateColorAsState(
                targetValue = if (isSelected) MaterialTheme.colorScheme.primary else Color.Transparent,
                label = "tab_indicator",
            )

            Column(
                modifier = Modifier
                    .weight(1f)
                    .clickable { onTabSelected(tab) }
                    .semantics {
                        contentDescription = "${tab.displayName}, $count results"
                        selected = isSelected
                    },
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.Center,
                    modifier = Modifier.padding(vertical = 6.dp),
                ) {
                    Icon(
                        imageVector = tabIcon(tab),
                        contentDescription = null,
                        modifier = Modifier.size(14.dp),
                        tint = if (isSelected) MaterialTheme.colorScheme.onSurface
                        else MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    Spacer(modifier = Modifier.width(4.dp))
                    Text(
                        text = tab.displayName,
                        style = MaterialTheme.typography.labelMedium,
                        fontWeight = if (isSelected) FontWeight.SemiBold else FontWeight.Medium,
                        color = if (isSelected) MaterialTheme.colorScheme.onSurface
                        else MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    if (count > 0) {
                        Spacer(modifier = Modifier.width(4.dp))
                        Text(
                            text = "$count",
                            style = MaterialTheme.typography.labelSmall,
                            fontWeight = FontWeight.Bold,
                            color = if (isSelected) Color.White
                            else MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier
                                .background(
                                    color = if (isSelected) MaterialTheme.colorScheme.primary
                                    else MaterialTheme.colorScheme.surfaceVariant,
                                    shape = CircleShape,
                                )
                                .padding(horizontal = 5.dp, vertical = 1.dp),
                        )
                    }
                }
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(2.dp)
                        .background(indicatorColor.value),
                )
            }
        }
    }
}

private fun tabIcon(tab: SearchTab): ImageVector = when (tab) {
    SearchTab.EVENTS -> Icons.Filled.CalendarToday
    SearchTab.RESTAURANTS -> Icons.Filled.Restaurant
    SearchTab.ATTRACTIONS -> Icons.Filled.Place
}

// endregion

// region Search Suggestions

@Composable
private fun SearchSuggestions(
    onSuggestionSelected: (String) -> Unit,
) {
    val haptics = rememberHapticPerformer()
    val categories = remember { EventCategory.entries.take(8) }
    val suggestions = remember {
        listOf(
            "Live music tonight",
            "Family friendly",
            "Free events",
            "Downtown restaurants",
            "Outdoor activities",
        )
    }

    LazyColumn(
        contentPadding = PaddingValues(top = 20.dp, bottom = Dimens.SpacingLg),
    ) {
        // Popular Categories header
        item {
            Text(
                text = "Popular Categories",
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.Bold,
                modifier = Modifier
                    .padding(horizontal = Dimens.SpacingMd)
                    .padding(bottom = Dimens.SpacingSm),
            )
        }

        // Category grid (fixed height, not nested lazy)
        item {
            LazyVerticalGrid(
                columns = GridCells.Adaptive(minSize = 100.dp),
                contentPadding = PaddingValues(horizontal = Dimens.SpacingMd),
                horizontalArrangement = Arrangement.spacedBy(10.dp),
                verticalArrangement = Arrangement.spacedBy(10.dp),
                modifier = Modifier
                    .fillMaxWidth()
                    .height(220.dp),
                userScrollEnabled = false,
            ) {
                items(categories) { category ->
                    Surface(
                        onClick = {
                            haptics.light()
                            onSuggestionSelected(category.displayName)
                        },
                        shape = RoundedCornerShape(12.dp),
                        color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.6f),
                        modifier = Modifier.semantics {
                            contentDescription = "Search ${category.displayName}"
                        },
                    ) {
                        Column(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(vertical = 14.dp),
                            horizontalAlignment = Alignment.CenterHorizontally,
                            verticalArrangement = Arrangement.Center,
                        ) {
                            Icon(
                                imageVector = categoryIcon(category),
                                contentDescription = null,
                                modifier = Modifier.size(24.dp),
                                tint = category.color,
                            )
                            Spacer(modifier = Modifier.height(8.dp))
                            Text(
                                text = category.displayName,
                                style = MaterialTheme.typography.labelSmall,
                                fontWeight = FontWeight.Medium,
                            )
                        }
                    }
                }
            }
        }

        // Try Searching header
        item {
            Spacer(modifier = Modifier.height(20.dp))
            Text(
                text = "Try Searching",
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.Bold,
                modifier = Modifier
                    .padding(horizontal = Dimens.SpacingMd)
                    .padding(bottom = Dimens.SpacingSm),
            )
        }

        // Quick suggestions
        items(suggestions) { suggestion ->
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .clickable {
                        haptics.light()
                        onSuggestionSelected(suggestion)
                    }
                    .padding(horizontal = Dimens.SpacingMd, vertical = 10.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Icon(
                    imageVector = Icons.Filled.Search,
                    contentDescription = null,
                    modifier = Modifier.size(16.dp),
                    tint = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Spacer(modifier = Modifier.width(Dimens.SpacingSm))
                Text(
                    text = suggestion,
                    style = MaterialTheme.typography.bodyMedium,
                    modifier = Modifier.weight(1f),
                )
                Icon(
                    imageVector = Icons.AutoMirrored.Filled.ArrowBack,
                    contentDescription = null,
                    modifier = Modifier.size(12.dp),
                    tint = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.5f),
                )
            }
        }
    }
}

/**
 * Map EventCategory to a Material Icon. Matches CategoryBadge icon mapping.
 */
private fun categoryIcon(category: EventCategory): ImageVector = when (category) {
    EventCategory.MUSIC -> Icons.Filled.MusicNote
    EventCategory.FOOD -> Icons.Filled.Restaurant
    EventCategory.ART -> Icons.Filled.Palette
    EventCategory.OUTDOOR -> Icons.Filled.Eco
    EventCategory.FAMILY -> Icons.Filled.FamilyRestroom
    EventCategory.SPORTS -> Icons.Filled.SportsTennis
    EventCategory.NIGHTLIFE -> Icons.Filled.Nightlife
    EventCategory.BUSINESS -> Icons.Filled.Work
    EventCategory.EDUCATION -> Icons.Filled.School
    EventCategory.CHARITY -> Icons.Filled.Favorite
    EventCategory.HOLIDAY -> Icons.Filled.CardGiftcard
    EventCategory.GENERAL -> Icons.Filled.CalendarToday
}

// endregion

// region Results List

@Composable
private fun ResultsList(
    state: SearchScreenState,
    onNavigateToEventDetail: (String) -> Unit,
    onNavigateToRestaurantDetail: (String) -> Unit,
    onNavigateToAttractionDetail: (String) -> Unit,
) {
    LazyColumn(
        contentPadding = PaddingValues(Dimens.SpacingMd),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        when (state.selectedTab) {
            SearchTab.EVENTS -> {
                items(
                    items = state.eventResults,
                    key = { it.id },
                ) { event ->
                    com.desmoines.aipulse.ui.screens.home.EventCardView(
                        event = event,
                        isFavorited = false,
                        modifier = Modifier.clickable { onNavigateToEventDetail(event.id) },
                    )
                }
            }
            SearchTab.RESTAURANTS -> {
                items(
                    items = state.restaurantResults,
                    key = { it.id },
                ) { restaurant ->
                    RestaurantSearchCard(
                        restaurant = restaurant,
                        onClick = { onNavigateToRestaurantDetail(restaurant.id) },
                    )
                }
            }
            SearchTab.ATTRACTIONS -> {
                items(
                    items = state.attractionResults,
                    key = { it.id },
                ) { attraction ->
                    AttractionCardView(
                        attraction = attraction,
                        onClick = { onNavigateToAttractionDetail(attraction.id) },
                    )
                }
            }
        }
    }
}

// endregion

// region Loading View

@Composable
private fun LoadingView() {
    Column(
        modifier = Modifier.fillMaxSize(),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        CircularProgressIndicator()
        Spacer(modifier = Modifier.height(Dimens.SpacingMd))
        Text(
            text = "Searching...",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}

// endregion

// region Restaurant Search Card (reuses RestaurantsScreen's RestaurantCard pattern)

@Composable
private fun RestaurantSearchCard(
    restaurant: Restaurant,
    onClick: () -> Unit,
) {
    Surface(
        onClick = onClick,
        shape = RoundedCornerShape(12.dp),
        color = MaterialTheme.colorScheme.surface,
        shadowElevation = 1.dp,
        modifier = Modifier
            .fillMaxWidth()
            .clearAndSetSemantics {
                contentDescription = "${restaurant.name}, ${restaurant.cuisine}, ${restaurant.location ?: ""}"
            },
    ) {
        Row(
            modifier = Modifier.padding(10.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            CachedAsyncImage(
                url = restaurant.imageUrl,
                contentDescription = restaurant.name,
                modifier = Modifier
                    .size(80.dp)
                    .clip(RoundedCornerShape(10.dp)),
            )
            Spacer(modifier = Modifier.width(14.dp))
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = restaurant.name,
                    style = MaterialTheme.typography.bodyMedium,
                    fontWeight = FontWeight.SemiBold,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                Spacer(modifier = Modifier.height(2.dp))
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(
                        text = restaurant.cuisine ?: "",
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    if (restaurant.priceRange != null) {
                        Text(
                            text = " · ${restaurant.priceRange}",
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }
                restaurant.rating?.let { rating ->
                    Spacer(modifier = Modifier.height(2.dp))
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(
                            imageVector = Icons.Filled.Star,
                            contentDescription = null,
                            modifier = Modifier.size(12.dp),
                            tint = Color(0xFFFFC107),
                        )
                        Spacer(modifier = Modifier.width(3.dp))
                        Text(
                            text = String.format(Locale.US, "%.1f", rating),
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }
                restaurant.location?.let { location ->
                    Spacer(modifier = Modifier.height(2.dp))
                    Text(
                        text = location,
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.7f),
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
            }
            Icon(
                imageVector = Icons.Filled.ChevronRight,
                contentDescription = null,
                modifier = Modifier.size(16.dp),
                tint = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.5f),
            )
        }
    }
}

// endregion

// region Attraction Card View (matches iOS AttractionCardView in SearchView.swift)

@Composable
fun AttractionCardView(
    attraction: Attraction,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Surface(
        onClick = onClick,
        shape = RoundedCornerShape(12.dp),
        color = MaterialTheme.colorScheme.surface,
        shadowElevation = 1.dp,
        modifier = modifier
            .fillMaxWidth()
            .clearAndSetSemantics {
                contentDescription = "${attraction.name}, ${attraction.type}"
            },
    ) {
        Row(
            modifier = Modifier.padding(10.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            // Image or placeholder
            Box(
                modifier = Modifier
                    .size(80.dp)
                    .clip(RoundedCornerShape(10.dp))
                    .background(Color(0xFF009688).copy(alpha = 0.1f)),
                contentAlignment = Alignment.Center,
            ) {
                if (attraction.imageUrl != null) {
                    CachedAsyncImage(
                        url = attraction.imageUrl,
                        contentDescription = attraction.name,
                        modifier = Modifier.size(80.dp),
                    )
                } else {
                    Icon(
                        imageVector = attractionTypeIcon(attraction.attractionType),
                        contentDescription = null,
                        modifier = Modifier.size(32.dp),
                        tint = Color(0xFF009688).copy(alpha = 0.4f),
                    )
                }
            }

            Spacer(modifier = Modifier.width(14.dp))

            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = attraction.name,
                    style = MaterialTheme.typography.bodyMedium,
                    fontWeight = FontWeight.SemiBold,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                Spacer(modifier = Modifier.height(4.dp))
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(
                        imageVector = attractionTypeIcon(attraction.attractionType),
                        contentDescription = null,
                        modifier = Modifier.size(12.dp),
                        tint = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    Spacer(modifier = Modifier.width(6.dp))
                    Text(
                        text = attraction.type,
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                attraction.rating?.let { rating ->
                    Spacer(modifier = Modifier.height(3.dp))
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(
                            imageVector = Icons.Filled.Star,
                            contentDescription = null,
                            modifier = Modifier.size(12.dp),
                            tint = Color(0xFFFFC107),
                        )
                        Spacer(modifier = Modifier.width(3.dp))
                        Text(
                            text = String.format(Locale.US, "%.1f", rating),
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }
                attraction.location?.let { location ->
                    Spacer(modifier = Modifier.height(3.dp))
                    Text(
                        text = location,
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.7f),
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
            }

            Icon(
                imageVector = Icons.Filled.ChevronRight,
                contentDescription = null,
                modifier = Modifier.size(16.dp),
                tint = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.5f),
            )
        }
    }
}

private fun attractionTypeIcon(type: AttractionType): ImageVector = when (type) {
    AttractionType.MUSEUM -> Icons.Filled.Place // museum
    AttractionType.PARK -> Icons.Filled.Eco
    AttractionType.HISTORIC_SITE -> Icons.Filled.Place
    AttractionType.ENTERTAINMENT -> Icons.Filled.Place
    AttractionType.ZOO -> Icons.Filled.Place
    AttractionType.GARDEN -> Icons.Filled.Eco
    AttractionType.SPORTS -> Icons.Filled.SportsTennis
    AttractionType.SHOPPING -> Icons.Filled.Place
    AttractionType.OTHER -> Icons.Filled.Place
}

// endregion

// endregion

@Preview(showBackground = true)
@Composable
private fun SearchScreenPreview() {
    DesMoinesInsiderTheme {
        SearchScreen()
    }
}

@Preview(showBackground = true)
@Composable
private fun SearchScreenWithResultsPreview() {
    DesMoinesInsiderTheme {
        SearchScreen(
            state = SearchScreenState(
                searchText = "music",
                hasSearched = true,
                eventResults = listOf(Event.preview),
                attractionResults = listOf(Attraction.preview),
            ),
        )
    }
}
