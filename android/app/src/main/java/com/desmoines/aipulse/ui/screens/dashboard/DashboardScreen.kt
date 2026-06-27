package com.desmoines.aipulse.ui.screens.dashboard

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
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.CalendarMonth
import androidx.compose.material.icons.filled.Place
import androidx.compose.material.icons.filled.Restaurant
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.desmoines.aipulse.data.model.RecentItem
import com.desmoines.aipulse.data.model.RecentItemType
import com.desmoines.aipulse.data.model.SavedSearch
import com.desmoines.aipulse.data.model.TripPlan
import com.desmoines.aipulse.ui.components.CachedAsyncImage
import com.desmoines.aipulse.ui.screens.home.ForYouRail
import com.desmoines.aipulse.ui.screens.search.SavedSearchSection

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DashboardScreen(
    state: DashboardUiState,
    savedSearches: List<SavedSearch>,
    onRerunSavedSearch: (SavedSearch) -> Unit,
    onToggleSavedSearchAlerts: (SavedSearch) -> Unit,
    onDeleteSavedSearch: (SavedSearch) -> Unit,
    onSignIn: () -> Unit,
    onUpgrade: () -> Unit,
    onPlanTrip: () -> Unit,
    onOpenTrip: (String) -> Unit,
    onOpenEvent: (String) -> Unit,
    onOpenRestaurant: (String) -> Unit,
    onOpenAttraction: (String) -> Unit,
    onRefresh: () -> Unit,
    onNavigateBack: () -> Unit,
) {
    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Dashboard") },
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
                state.isLoading -> CircularProgressIndicator(modifier = Modifier.align(Alignment.Center))
                !state.isAuthenticated -> GuestState(onSignIn = onSignIn, onUpgrade = onUpgrade)
                else -> PullToRefreshBox(isRefreshing = state.isRefreshing, onRefresh = onRefresh) {
                    androidx.compose.foundation.lazy.LazyColumn(
                        modifier = Modifier.fillMaxSize(),
                        contentPadding = PaddingValues(bottom = 24.dp),
                    ) {
                        item(key = "tripsHeader") { SectionHeader("Your trips") }
                        item(key = "trips") {
                            if (state.trips.isEmpty()) {
                                EmptyCta(message = "No saved itineraries yet.", action = "Plan a trip", onClick = onPlanTrip)
                            } else {
                                Column {
                                    state.trips.forEach { trip ->
                                        TripRow(trip = trip, onClick = { onOpenTrip(trip.id) })
                                    }
                                }
                            }
                        }

                        item(key = "favHeader") { SectionHeader("Your favorites") }
                        item(key = "favTiles") {
                            FavoritesOverview(
                                events = state.favoriteEvents,
                                dining = state.favoriteDining,
                                isEmpty = state.totalFavorites == 0,
                            )
                        }

                        if (savedSearches.isNotEmpty()) {
                            item(key = "savedSearches") {
                                SavedSearchSection(
                                    searches = savedSearches,
                                    onRerun = onRerunSavedSearch,
                                    onToggleAlerts = onToggleSavedSearchAlerts,
                                    onDelete = onDeleteSavedSearch,
                                )
                            }
                        }

                        if (state.recents.isNotEmpty()) {
                            item(key = "recentsHeader") { SectionHeader("Recently viewed") }
                            item(key = "recentsRail") {
                                RecentlyViewedRail(
                                    recents = state.recents,
                                    onOpen = { item -> dispatchRecent(item, onOpenEvent, onOpenRestaurant, onOpenAttraction) },
                                )
                            }
                        }

                        item(key = "forYou") {
                            ForYouRail(onNavigateToEvent = onOpenEvent)
                        }
                    }
                }
            }
        }
    }
}

private fun dispatchRecent(
    item: RecentItem,
    onOpenEvent: (String) -> Unit,
    onOpenRestaurant: (String) -> Unit,
    onOpenAttraction: (String) -> Unit,
) {
    when (item.type) {
        RecentItemType.EVENT -> onOpenEvent(item.id)
        RecentItemType.RESTAURANT -> onOpenRestaurant(item.id)
        RecentItemType.ATTRACTION -> onOpenAttraction(item.id)
        RecentItemType.ARTICLE, RecentItemType.HOTEL -> Unit // dedicated screens land in Epic 3
    }
}

@Composable
private fun GuestState(onSignIn: () -> Unit, onUpgrade: () -> Unit) {
    Column(
        modifier = Modifier.fillMaxSize().padding(24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Text(
            "Sign in for your dashboard",
            style = MaterialTheme.typography.titleLarge,
            fontWeight = FontWeight.Bold,
        )
        Spacer(Modifier.height(8.dp))
        Text(
            "Track your trips, favorites, saved searches, and personalized picks.",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Spacer(Modifier.height(20.dp))
        Button(onClick = onSignIn, modifier = Modifier.fillMaxWidth()) { Text("Sign in") }
        Spacer(Modifier.height(12.dp))
        Surface(
            modifier = Modifier.fillMaxWidth().clickable(onClick = onUpgrade),
            shape = MaterialTheme.shapes.large,
            color = MaterialTheme.colorScheme.secondaryContainer,
        ) {
            Row(modifier = Modifier.padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
                Column(modifier = Modifier.weight(1f)) {
                    Text("Go Insider", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.onSecondaryContainer)
                    Text("Unlimited favorites, AI trip planning, and premium picks.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSecondaryContainer)
                }
            }
        }
    }
}

@Composable
private fun SectionHeader(title: String) {
    Text(
        title,
        style = MaterialTheme.typography.titleMedium,
        fontWeight = FontWeight.Bold,
        modifier = Modifier.fillMaxWidth().padding(start = 16.dp, end = 16.dp, top = 16.dp, bottom = 8.dp),
    )
}

@Composable
private fun TripRow(trip: TripPlan, onClick: () -> Unit) {
    Row(
        modifier = Modifier.fillMaxWidth().clickable(onClick = onClick).padding(horizontal = 16.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(Icons.Filled.CalendarMonth, contentDescription = null, tint = MaterialTheme.colorScheme.primary)
        Spacer(Modifier.width(12.dp))
        Text(
            trip.title.ifBlank { "Untitled trip" },
            style = MaterialTheme.typography.bodyLarge,
            fontWeight = FontWeight.SemiBold,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
    }
}

@Composable
private fun EmptyCta(message: String, action: String, onClick: () -> Unit) {
    Column(modifier = Modifier.fillMaxWidth().padding(16.dp)) {
        Text(message, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Spacer(Modifier.height(8.dp))
        OutlinedButton(onClick = onClick) { Text(action) }
    }
}

@Composable
private fun FavoritesOverview(events: Int, dining: Int, isEmpty: Boolean) {
    Column(modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp)) {
        Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            StatTile("Events", events, Modifier.weight(1f))
            StatTile("Dining", dining, Modifier.weight(1f))
            StatTile("Places", 0, Modifier.weight(1f))
            StatTile("Guides", 0, Modifier.weight(1f))
        }
        if (isEmpty) {
            Spacer(Modifier.height(8.dp))
            Text(
                "Tap the heart on any listing to save it here.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

@Composable
private fun StatTile(label: String, count: Int, modifier: Modifier = Modifier) {
    Surface(
        modifier = modifier,
        shape = MaterialTheme.shapes.medium,
        color = MaterialTheme.colorScheme.surfaceVariant,
    ) {
        Column(
            modifier = Modifier.padding(vertical = 12.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Text("$count", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
            Text(label, style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}

@Composable
private fun RecentlyViewedRail(recents: List<RecentItem>, onOpen: (RecentItem) -> Unit) {
    LazyRow(
        contentPadding = PaddingValues(horizontal = 16.dp),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        items(recents, key = { "${it.type}_${it.id}" }) { item ->
            Column(modifier = Modifier.width(140.dp).clickable { onOpen(item) }) {
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(90.dp)
                        .clip(RoundedCornerShape(14.dp))
                        .background(MaterialTheme.colorScheme.surfaceVariant),
                ) {
                    CachedAsyncImage(url = item.imageUrl, contentDescription = null, modifier = Modifier.fillMaxSize())
                }
                Spacer(Modifier.height(6.dp))
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(recentIcon(item.type), contentDescription = null, modifier = Modifier.size(14.dp), tint = MaterialTheme.colorScheme.primary)
                    Spacer(Modifier.width(4.dp))
                    Text(
                        item.title,
                        style = MaterialTheme.typography.bodySmall,
                        fontWeight = FontWeight.SemiBold,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
            }
        }
    }
}

private fun recentIcon(type: RecentItemType): ImageVector = when (type) {
    RecentItemType.EVENT -> Icons.Filled.CalendarMonth
    RecentItemType.RESTAURANT -> Icons.Filled.Restaurant
    else -> Icons.Filled.Place
}
