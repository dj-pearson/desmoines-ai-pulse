package com.desmoines.aipulse.ui.screens.favorites

import androidx.compose.animation.animateContentSize
import androidx.compose.foundation.clickable
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
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CalendarMonth
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material.icons.filled.FavoriteBorder
import androidx.compose.material.icons.filled.History
import androidx.compose.material.icons.filled.LocationOn
import androidx.compose.material.icons.filled.Restaurant
import androidx.compose.material.icons.filled.Star
import androidx.compose.material.icons.filled.WifiOff
import androidx.compose.material.icons.outlined.FavoriteBorder
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LargeTopAppBar
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.input.nestedscroll.nestedScroll
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import com.desmoines.aipulse.data.model.Event
import com.desmoines.aipulse.data.model.Restaurant
import com.desmoines.aipulse.data.model.SubscriptionTier
import com.desmoines.aipulse.ui.components.CachedAsyncImage
import com.desmoines.aipulse.ui.components.EmptyStateView
import com.desmoines.aipulse.ui.components.FavoritesLimitBanner
import com.desmoines.aipulse.ui.components.SubscriptionBanner
import com.desmoines.aipulse.ui.components.BannerStyle
import com.desmoines.aipulse.ui.theme.DesMoinesInsiderTheme
import java.time.OffsetDateTime
import java.time.format.DateTimeFormatter

/**
 * Favorites/Saved screen matching iOS FavoritesView.swift.
 * Shows saved events (upcoming + past) and restaurants with sections.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun FavoritesScreen(
    state: FavoritesScreenState,
    onNavigateToEventDetail: (String) -> Unit = {},
    onNavigateToRestaurantDetail: (String) -> Unit = {},
    onNavigateToAuth: () -> Unit = {},
    onNavigateToSubscription: () -> Unit = {},
    onRemoveEventFavorite: (String) -> Unit = {},
    onRemoveRestaurantFavorite: (String) -> Unit = {},
    onRefresh: () -> Unit = {},
) {
    val scrollBehavior = TopAppBarDefaults.exitUntilCollapsedScrollBehavior()

    Scaffold(
        topBar = {
            LargeTopAppBar(
                title = { Text("Saved") },
                scrollBehavior = scrollBehavior,
            )
        },
        modifier = Modifier.nestedScroll(scrollBehavior.nestedScrollConnection),
    ) { padding ->
        PullToRefreshBox(
            isRefreshing = state.isRefreshing,
            onRefresh = onRefresh,
            modifier = Modifier
                .fillMaxSize()
                .padding(padding),
        ) {
            when {
                !state.isAuthenticated -> {
                    SignInPrompt(onNavigateToAuth = onNavigateToAuth)
                }
                state.isLoading && !state.isRefreshing -> {
                    LoadingView()
                }
                !state.hasAnyFavorites -> {
                    NoFavoritesView(
                        currentTier = state.currentTier,
                        onNavigateToSubscription = onNavigateToSubscription,
                    )
                }
                else -> {
                    SavedContent(
                        state = state,
                        onNavigateToEventDetail = onNavigateToEventDetail,
                        onNavigateToRestaurantDetail = onNavigateToRestaurantDetail,
                        onNavigateToSubscription = onNavigateToSubscription,
                        onRemoveEventFavorite = onRemoveEventFavorite,
                        onRemoveRestaurantFavorite = onRemoveRestaurantFavorite,
                    )
                }
            }
        }
    }
}

@Composable
private fun SavedContent(
    state: FavoritesScreenState,
    onNavigateToEventDetail: (String) -> Unit,
    onNavigateToRestaurantDetail: (String) -> Unit,
    onNavigateToSubscription: () -> Unit,
    onRemoveEventFavorite: (String) -> Unit,
    onRemoveRestaurantFavorite: (String) -> Unit,
) {
    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        // Favorites limit banner for free users
        item {
            FavoritesLimitBanner(
                currentCount = state.totalFavoriteCount,
                currentTier = state.currentTier,
                onUpgradeClick = onNavigateToSubscription,
                modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp),
            )
        }

        // Header count
        item {
            Text(
                text = "${state.totalFavoriteCount} saved item${if (state.totalFavoriteCount == 1) "" else "s"}",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(horizontal = 16.dp),
            )
        }

        // Upcoming Events Section
        if (state.upcomingEvents.isNotEmpty()) {
            item {
                SectionHeader(
                    title = "Upcoming Events",
                    icon = Icons.Filled.CalendarMonth,
                    count = state.upcomingEvents.size,
                )
            }
            items(
                items = state.upcomingEvents,
                key = { "event-${it.id}" },
            ) { event ->
                FavoriteEventRow(
                    event = event,
                    isPast = false,
                    onClick = { onNavigateToEventDetail(event.id) },
                    onRemove = { onRemoveEventFavorite(event.id) },
                    modifier = Modifier.padding(horizontal = 16.dp),
                )
            }
        }

        // Restaurants Section
        if (state.favoriteRestaurants.isNotEmpty()) {
            item {
                SectionHeader(
                    title = "Restaurants",
                    icon = Icons.Filled.Restaurant,
                    count = state.favoriteRestaurants.size,
                )
            }
            items(
                items = state.favoriteRestaurants,
                key = { "restaurant-${it.id}" },
            ) { restaurant ->
                FavoriteRestaurantRow(
                    restaurant = restaurant,
                    onClick = { onNavigateToRestaurantDetail(restaurant.id) },
                    onRemove = { onRemoveRestaurantFavorite(restaurant.id) },
                    modifier = Modifier.padding(horizontal = 16.dp),
                )
            }
        }

        // Past Events Section
        if (state.pastEvents.isNotEmpty()) {
            item {
                SectionHeader(
                    title = "Past Events",
                    icon = Icons.Filled.History,
                    count = state.pastEvents.size,
                )
            }
            items(
                items = state.pastEvents,
                key = { "past-event-${it.id}" },
            ) { event ->
                FavoriteEventRow(
                    event = event,
                    isPast = true,
                    onClick = { onNavigateToEventDetail(event.id) },
                    onRemove = { onRemoveEventFavorite(event.id) },
                    modifier = Modifier.padding(horizontal = 16.dp),
                )
            }
        }

        // Bottom spacer
        item { Spacer(modifier = Modifier.height(16.dp)) }
    }
}

// ================================================================
// Section Header
// ================================================================

@Composable
private fun SectionHeader(
    title: String,
    icon: ImageVector,
    count: Int,
) {
    Row(
        modifier = Modifier
            .padding(horizontal = 16.dp, vertical = 4.dp)
            .semantics {
                heading()
                contentDescription = "$title, $count ${if (count == 1) "item" else "items"}"
            },
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Icon(
            imageVector = icon,
            contentDescription = null,
            tint = MaterialTheme.colorScheme.primary,
            modifier = Modifier.size(18.dp),
        )
        Text(
            text = title,
            style = MaterialTheme.typography.titleSmall,
            fontWeight = FontWeight.SemiBold,
        )
        Text(
            text = "($count)",
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}

// ================================================================
// Favorite Event Row
// ================================================================

@Composable
private fun FavoriteEventRow(
    event: Event,
    isPast: Boolean,
    onClick: () -> Unit,
    onRemove: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val haptic = LocalHapticFeedback.current
    val opacity = if (isPast) 0.6f else 1f

    Card(
        modifier = modifier
            .fillMaxWidth()
            .clickable(onClick = onClick)
            .animateContentSize()
            .semantics {
                contentDescription = "${event.title}${if (isPast) ", past event" else ""}"
            },
        shape = RoundedCornerShape(14.dp),
        elevation = CardDefaults.cardElevation(defaultElevation = 2.dp),
    ) {
        Row(
            modifier = Modifier.padding(10.dp),
            horizontalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            // Event image
            CachedAsyncImage(
                url = event.imageUrl,
                contentDescription = event.title,
                modifier = Modifier
                    .size(80.dp)
                    .clip(RoundedCornerShape(10.dp))
                    .alpha(opacity),
            )

            // Event info
            Column(
                modifier = Modifier
                    .weight(1f)
                    .alpha(opacity),
                verticalArrangement = Arrangement.spacedBy(4.dp),
            ) {
                Text(
                    text = event.title,
                    style = MaterialTheme.typography.bodyMedium,
                    fontWeight = FontWeight.SemiBold,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                    color = if (isPast) MaterialTheme.colorScheme.onSurfaceVariant else MaterialTheme.colorScheme.onSurface,
                )

                event.parsedDate?.let { date ->
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(4.dp),
                    ) {
                        Icon(
                            imageVector = Icons.Filled.CalendarMonth,
                            contentDescription = null,
                            modifier = Modifier.size(12.dp),
                            tint = if (isPast) MaterialTheme.colorScheme.outline else MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                        Text(
                            text = date.format(DateTimeFormatter.ofPattern("MMM d, h:mm a")),
                            style = MaterialTheme.typography.labelSmall,
                            color = if (isPast) MaterialTheme.colorScheme.outline else MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }

                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(4.dp),
                ) {
                    Icon(
                        imageVector = Icons.Filled.LocationOn,
                        contentDescription = null,
                        modifier = Modifier.size(10.dp),
                        tint = MaterialTheme.colorScheme.outline,
                    )
                    Text(
                        text = event.displayLocation,
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.outline,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                }

                if (isPast) {
                    Text(
                        text = "Past event",
                        style = MaterialTheme.typography.labelSmall,
                        fontWeight = FontWeight.Medium,
                        color = Color(0xFFFF9800), // orange
                    )
                }
            }

            // Remove button
            IconButton(
                onClick = {
                    haptic.performHapticFeedback(HapticFeedbackType.LongPress)
                    onRemove()
                },
                modifier = Modifier.semantics { contentDescription = "Remove from saved" },
            ) {
                Icon(
                    imageVector = Icons.Filled.Favorite,
                    contentDescription = null,
                    tint = Color.Red,
                )
            }
        }
    }
}

// ================================================================
// Favorite Restaurant Row
// ================================================================

@Composable
private fun FavoriteRestaurantRow(
    restaurant: Restaurant,
    onClick: () -> Unit,
    onRemove: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val haptic = LocalHapticFeedback.current

    Card(
        modifier = modifier
            .fillMaxWidth()
            .clickable(onClick = onClick)
            .animateContentSize()
            .semantics {
                contentDescription = restaurant.name
            },
        shape = RoundedCornerShape(14.dp),
        elevation = CardDefaults.cardElevation(defaultElevation = 2.dp),
    ) {
        Row(
            modifier = Modifier.padding(10.dp),
            horizontalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            // Restaurant image
            CachedAsyncImage(
                url = restaurant.imageUrl,
                contentDescription = restaurant.name,
                modifier = Modifier
                    .size(80.dp)
                    .clip(RoundedCornerShape(10.dp)),
            )

            // Restaurant info
            Column(
                modifier = Modifier.weight(1f),
                verticalArrangement = Arrangement.spacedBy(4.dp),
            ) {
                Text(
                    text = restaurant.name,
                    style = MaterialTheme.typography.bodyMedium,
                    fontWeight = FontWeight.SemiBold,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                )

                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                ) {
                    restaurant.cuisine?.let { cuisine ->
                        Text(
                            text = cuisine,
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                    restaurant.priceRange?.let { price ->
                        Text(
                            text = price,
                            style = MaterialTheme.typography.labelSmall,
                            fontWeight = FontWeight.Medium,
                            color = Color(0xFF4CAF50), // green
                        )
                    }
                }

                restaurant.rating?.let { rating ->
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(3.dp),
                    ) {
                        Icon(
                            imageVector = Icons.Filled.Star,
                            contentDescription = null,
                            modifier = Modifier.size(10.dp),
                            tint = Color(0xFFFFD600), // yellow
                        )
                        Text(
                            text = String.format("%.1f", rating),
                            style = MaterialTheme.typography.labelSmall,
                            fontWeight = FontWeight.Medium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }

                if (restaurant.displayLocation.isNotEmpty()) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(4.dp),
                    ) {
                        Icon(
                            imageVector = Icons.Filled.LocationOn,
                            contentDescription = null,
                            modifier = Modifier.size(10.dp),
                            tint = MaterialTheme.colorScheme.outline,
                        )
                        Text(
                            text = restaurant.displayLocation,
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.outline,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                        )
                    }
                }
            }

            // Remove button
            IconButton(
                onClick = {
                    haptic.performHapticFeedback(HapticFeedbackType.LongPress)
                    onRemove()
                },
                modifier = Modifier.semantics { contentDescription = "Remove from saved" },
            ) {
                Icon(
                    imageVector = Icons.Filled.Favorite,
                    contentDescription = null,
                    tint = Color.Red,
                )
            }
        }
    }
}

// ================================================================
// Sign In Prompt
// ================================================================

@Composable
private fun SignInPrompt(onNavigateToAuth: () -> Unit) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(40.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Icon(
            imageVector = Icons.Outlined.FavoriteBorder,
            contentDescription = null,
            modifier = Modifier.size(64.dp),
            tint = MaterialTheme.colorScheme.primary.copy(alpha = 0.6f),
        )

        Spacer(modifier = Modifier.height(16.dp))

        Text(
            text = "Sign In to Save Items",
            style = MaterialTheme.typography.titleMedium,
            fontWeight = FontWeight.Bold,
        )

        Spacer(modifier = Modifier.height(8.dp))

        Text(
            text = "Create an account to save your favorite events and restaurants, and access them from any device.",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            textAlign = androidx.compose.ui.text.style.TextAlign.Center,
        )

        Spacer(modifier = Modifier.height(24.dp))

        androidx.compose.material3.Button(
            onClick = onNavigateToAuth,
            modifier = Modifier.fillMaxWidth(),
            shape = RoundedCornerShape(12.dp),
        ) {
            Text(
                text = "Sign In",
                style = MaterialTheme.typography.titleSmall,
                fontWeight = FontWeight.SemiBold,
                modifier = Modifier.padding(vertical = 6.dp),
            )
        }
    }
}

// ================================================================
// No Favorites View
// ================================================================

@Composable
private fun NoFavoritesView(
    currentTier: SubscriptionTier,
    onNavigateToSubscription: () -> Unit,
) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        EmptyStateView(
            icon = Icons.Outlined.FavoriteBorder,
            title = "No Saved Items",
            message = "Events and restaurants you save will appear here. Tap the heart icon on any item to save it.",
        )

        Spacer(modifier = Modifier.height(24.dp))

        SubscriptionBanner(
            currentTier = currentTier,
            onUpgradeClick = onNavigateToSubscription,
            style = BannerStyle.COMPACT,
            modifier = Modifier.padding(horizontal = 24.dp),
        )
    }
}

// ================================================================
// Loading View
// ================================================================

@Composable
private fun LoadingView() {
    Column(
        modifier = Modifier.fillMaxSize(),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        CircularProgressIndicator()
        Spacer(modifier = Modifier.height(16.dp))
        Text(
            text = "Loading saved items...",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}

// ================================================================
// Previews
// ================================================================

@Preview(showBackground = true)
@Composable
private fun FavoritesScreenSignInPreview() {
    DesMoinesInsiderTheme {
        FavoritesScreen(
            state = FavoritesScreenState(isAuthenticated = false),
        )
    }
}

@Preview(showBackground = true)
@Composable
private fun FavoritesScreenEmptyPreview() {
    DesMoinesInsiderTheme {
        FavoritesScreen(
            state = FavoritesScreenState(isAuthenticated = true),
        )
    }
}

@Preview(showBackground = true)
@Composable
private fun FavoritesScreenLoadingPreview() {
    DesMoinesInsiderTheme {
        FavoritesScreen(
            state = FavoritesScreenState(isAuthenticated = true, isLoading = true),
        )
    }
}
