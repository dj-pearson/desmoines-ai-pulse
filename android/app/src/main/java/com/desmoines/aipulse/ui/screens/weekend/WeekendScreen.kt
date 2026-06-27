package com.desmoines.aipulse.ui.screens.weekend

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
import androidx.compose.material.icons.filled.CalendarMonth
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
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
import com.desmoines.aipulse.util.rememberHapticPerformer

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun WeekendScreen(
    state: WeekendUiState,
    onRefresh: () -> Unit,
    onOpenEvent: (String) -> Unit,
    onOpenRestaurant: (String) -> Unit,
    onOpenAttraction: (String) -> Unit,
    onNavigateBack: () -> Unit,
) {
    val haptic = rememberHapticPerformer()

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("This Weekend") },
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
                state.isLoading && state.days.isEmpty() ->
                    CircularProgressIndicator(modifier = Modifier.align(Alignment.Center))

                state.errorMessage != null && state.days.isEmpty() ->
                    ErrorState(message = state.errorMessage, onRetry = onRefresh, modifier = Modifier.align(Alignment.Center))

                else -> PullToRefreshBox(
                    isRefreshing = state.isRefreshing,
                    onRefresh = { haptic.light(); onRefresh() },
                ) {
                    LazyColumn(
                        modifier = Modifier.fillMaxSize(),
                        contentPadding = PaddingValues(bottom = 24.dp),
                    ) {
                        if (state.railError) {
                            item(key = "railError") { RailErrorBanner(onRetry = onRefresh) }
                        }

                        state.days.forEach { day ->
                            item(key = "day_${day.date}") { DayHeader(day) }
                            items(day.events, key = { "ev_${it.id}" }) { event ->
                                EventCardView(
                                    event = event,
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .padding(horizontal = 16.dp, vertical = 6.dp)
                                        .clickable { onOpenEvent(event.id) },
                                )
                            }
                        }

                        if (state.days.isEmpty()) {
                            item(key = "noEvents") {
                                Text(
                                    "No events scheduled this weekend yet — check the featured picks below.",
                                    style = MaterialTheme.typography.bodyMedium,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                    modifier = Modifier.fillMaxWidth().padding(16.dp),
                                )
                            }
                        }

                        // Ad slot (free tier) between events and the featured rails —
                        // wired with campaign ad serving in ANDP-040 (#284).

                        if (state.featuredRestaurants.isNotEmpty()) {
                            item(key = "diningHeader") { SectionHeader("Where to eat") }
                            item(key = "diningRail") {
                                FeaturedRestaurantRail(state.featuredRestaurants, onOpenRestaurant)
                            }
                        }
                        if (state.featuredAttractions.isNotEmpty()) {
                            item(key = "attractionsHeader") { SectionHeader("Things to do") }
                            item(key = "attractionsRail") {
                                FeaturedAttractionRail(state.featuredAttractions, onOpenAttraction)
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun DayHeader(day: WeekendDay) {
    Surface(color = MaterialTheme.colorScheme.surfaceVariant, modifier = Modifier.fillMaxWidth()) {
        Row(
            modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Icon(
                Icons.Filled.CalendarMonth,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.primary,
                modifier = Modifier.size(18.dp),
            )
            Spacer(Modifier.width(8.dp))
            Text(day.name, style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold)
            Spacer(Modifier.width(8.dp))
            Text(
                "${day.count} ${if (day.count == 1) "event" else "events"}",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
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
private fun FeaturedRestaurantRail(restaurants: List<Restaurant>, onOpen: (String) -> Unit) {
    LazyRow(
        contentPadding = PaddingValues(horizontal = 16.dp),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        items(restaurants, key = { it.id }) { r ->
            FeaturedCard(
                imageUrl = r.imageUrl,
                title = r.name,
                subtitle = r.cuisine,
                onClick = { onOpen(r.id) },
            )
        }
    }
}

@Composable
private fun FeaturedAttractionRail(attractions: List<Attraction>, onOpen: (String) -> Unit) {
    LazyRow(
        contentPadding = PaddingValues(horizontal = 16.dp),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        items(attractions, key = { it.id }) { a ->
            FeaturedCard(
                imageUrl = a.imageUrl,
                title = a.name,
                subtitle = a.type,
                onClick = { onOpen(a.id) },
            )
        }
    }
}

@Composable
private fun FeaturedCard(imageUrl: String?, title: String, subtitle: String?, onClick: () -> Unit) {
    Column(modifier = Modifier.width(160.dp).clickable(onClick = onClick)) {
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .height(110.dp)
                .clip(RoundedCornerShape(16.dp))
                .background(MaterialTheme.colorScheme.surfaceVariant),
        ) {
            CachedAsyncImage(url = imageUrl, contentDescription = null, modifier = Modifier.fillMaxSize())
        }
        Spacer(Modifier.height(6.dp))
        Text(
            title,
            style = MaterialTheme.typography.titleSmall,
            fontWeight = FontWeight.SemiBold,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
        subtitle?.takeIf { it.isNotBlank() }?.let {
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

@Composable
private fun RailErrorBanner(onRetry: () -> Unit) {
    Surface(
        modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp),
        shape = MaterialTheme.shapes.medium,
        color = MaterialTheme.colorScheme.errorContainer,
    ) {
        Row(modifier = Modifier.padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
            Text(
                "Couldn't load some recommendations.",
                color = MaterialTheme.colorScheme.onErrorContainer,
                style = MaterialTheme.typography.bodySmall,
                modifier = Modifier.weight(1f),
            )
            TextButton(onClick = onRetry) { Text("Retry") }
        }
    }
}

@Composable
private fun ErrorState(message: String, onRetry: () -> Unit, modifier: Modifier = Modifier) {
    Column(modifier = modifier.padding(24.dp), horizontalAlignment = Alignment.CenterHorizontally) {
        Text(
            message,
            style = MaterialTheme.typography.titleMedium,
            fontWeight = FontWeight.SemiBold,
        )
        Spacer(Modifier.height(12.dp))
        OutlinedButton(onClick = onRetry) { Text("Try again") }
    }
}
