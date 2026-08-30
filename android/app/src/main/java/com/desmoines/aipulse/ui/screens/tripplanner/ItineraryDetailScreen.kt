package com.desmoines.aipulse.ui.screens.tripplanner

import com.desmoines.aipulse.util.UiFormatLocale
import android.location.Geocoder
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
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.AttachMoney
import androidx.compose.material.icons.filled.DirectionsBus
import androidx.compose.material.icons.filled.Event
import androidx.compose.material.icons.filled.KeyboardArrowDown
import androidx.compose.material.icons.filled.KeyboardArrowUp
import androidx.compose.material.icons.filled.LocationOn
import androidx.compose.material.icons.filled.Place
import androidx.compose.material.icons.filled.Restaurant
import androidx.compose.material.icons.filled.Schedule
import androidx.compose.material.icons.filled.SwapVert
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
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.desmoines.aipulse.data.model.TripPlanItem
import com.google.android.gms.maps.model.CameraPosition
import com.google.android.gms.maps.model.LatLng
import com.google.maps.android.compose.GoogleMap
import com.google.maps.android.compose.MapProperties
import com.google.maps.android.compose.MapUiSettings
import com.google.maps.android.compose.Marker
import com.google.maps.android.compose.rememberMarkerState
import com.google.maps.android.compose.rememberCameraPositionState
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.time.LocalTime
import java.time.format.DateTimeFormatter

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ItineraryDetailScreen(
    state: ItineraryDetailUiState,
    onToggleReorder: () -> Unit,
    onMove: (day: Int, index: Int, delta: Int) -> Unit,
    onConsumeMessage: () -> Unit,
    onRetry: () -> Unit,
    onNavigateBack: () -> Unit,
) {
    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(state.title.ifBlank { "Itinerary" }) },
                navigationIcon = {
                    IconButton(onClick = onNavigateBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
                    }
                },
                actions = {
                    if (!state.isLoading && !state.loadFailed && state.days.isNotEmpty()) {
                        IconButton(onClick = onToggleReorder) {
                            Icon(
                                Icons.Filled.SwapVert,
                                contentDescription = if (state.reorderMode) "Done reordering" else "Reorder stops",
                                tint = if (state.reorderMode) {
                                    MaterialTheme.colorScheme.primary
                                } else {
                                    MaterialTheme.colorScheme.onSurfaceVariant
                                },
                            )
                        }
                    }
                },
            )
        },
    ) { innerPadding ->
        Column(modifier = Modifier.fillMaxSize().padding(innerPadding)) {
            state.message?.let { message ->
                MessageBanner(message = message, onDismiss = onConsumeMessage)
            }

            when {
                state.isLoading -> LoadingState()
                state.loadFailed -> ErrorState(isOffline = state.isOffline, onRetry = onRetry)
                else -> LazyColumn(modifier = Modifier.fillMaxSize()) {
                    item(key = "header") { Header(state) }

                    if (state.mapLocations.isNotEmpty()) {
                        item(key = "map") { TripMapPreview(locations = state.mapLocations) }
                    }

                    state.days.forEach { section ->
                        item(key = "day_${section.day}") { DayHeader(section.day) }
                        items(section.items, key = { it.itemId ?: "${section.day}_${it.orderIndex}" }) { item ->
                            val index = section.items.indexOf(item)
                            ItineraryItemRow(
                                item = item,
                                reorderMode = state.reorderMode,
                                canMoveUp = index > 0,
                                canMoveDown = index < section.items.lastIndex,
                                onMoveUp = { onMove(section.day, index, -1) },
                                onMoveDown = { onMove(section.day, index, 1) },
                            )
                        }
                    }

                    if (state.tips.isNotEmpty()) {
                        item(key = "tips_header") { SectionHeader("Local tips") }
                        items(state.tips, key = { "tip_$it" }) { tip -> BulletRow(tip) }
                    }
                    if (state.packingList.isNotEmpty()) {
                        item(key = "packing_header") { SectionHeader("Don't forget") }
                        items(state.packingList, key = { "pack_$it" }) { entry -> BulletRow(entry) }
                    }

                    item(key = "footer_spacer") { Spacer(Modifier.height(24.dp)) }
                }
            }
        }
    }
}

@Composable
private fun Header(state: ItineraryDetailUiState) {
    Column(modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 12.dp)) {
        state.dateRange?.let {
            Text(it, style = MaterialTheme.typography.titleSmall, color = MaterialTheme.colorScheme.primary)
        }
        state.description?.takeIf { it.isNotBlank() }?.let {
            Spacer(Modifier.height(4.dp))
            Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        state.totalEstimatedCost?.takeIf { it.isNotBlank() }?.let {
            Spacer(Modifier.height(6.dp))
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(
                    Icons.Filled.AttachMoney,
                    contentDescription = null,
                    modifier = Modifier.size(16.dp),
                    tint = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Text(
                    "Est. $it",
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
        if (state.reorderMode) {
            Spacer(Modifier.height(8.dp))
            Text(
                "Reordering — use the arrows to move stops within a day.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.primary,
            )
        }
    }
}

@Composable
private fun DayHeader(day: Int) {
    Surface(color = MaterialTheme.colorScheme.surfaceVariant, modifier = Modifier.fillMaxWidth()) {
        Text(
            "Day $day",
            style = MaterialTheme.typography.titleSmall,
            fontWeight = FontWeight.Bold,
            modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp),
        )
    }
}

@Composable
private fun SectionHeader(title: String) {
    Text(
        title,
        style = MaterialTheme.typography.titleSmall,
        fontWeight = FontWeight.Bold,
        modifier = Modifier.fillMaxWidth().padding(start = 16.dp, end = 16.dp, top = 16.dp, bottom = 4.dp),
    )
}

@Composable
private fun ItineraryItemRow(
    item: TripPlanItem,
    reorderMode: Boolean,
    canMoveUp: Boolean,
    canMoveDown: Boolean,
    onMoveUp: () -> Unit,
    onMoveDown: () -> Unit,
) {
    Row(
        modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 10.dp),
        verticalAlignment = Alignment.Top,
    ) {
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            modifier = Modifier.width(40.dp).clearAndSetSemantics {},
        ) {
            Icon(
                imageVector = typeIcon(item.itemType),
                contentDescription = null,
                tint = MaterialTheme.colorScheme.primary,
                modifier = Modifier.size(22.dp),
            )
            startTimeDisplay(item.startTime)?.let {
                Spacer(Modifier.height(2.dp))
                Text(it, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
        Spacer(Modifier.width(12.dp))
        Column(modifier = Modifier.weight(1f)) {
            Text(
                item.title ?: "Stop",
                style = MaterialTheme.typography.bodyLarge,
                fontWeight = FontWeight.SemiBold,
            )
            item.location?.takeIf { it.isNotBlank() }?.let {
                Spacer(Modifier.height(2.dp))
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(
                        Icons.Filled.LocationOn,
                        contentDescription = null,
                        modifier = Modifier.size(14.dp),
                        tint = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    Spacer(Modifier.width(2.dp))
                    Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
            item.aiReason?.takeIf { it.isNotBlank() }?.let {
                Spacer(Modifier.height(2.dp))
                Text(
                    it,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 3,
                )
            }
            item.estimatedCost?.takeIf { it.isNotBlank() }?.let {
                Spacer(Modifier.height(2.dp))
                Text(it, style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
        if (reorderMode) {
            Column {
                IconButton(onClick = onMoveUp, enabled = canMoveUp) {
                    Icon(Icons.Filled.KeyboardArrowUp, contentDescription = "Move up")
                }
                IconButton(onClick = onMoveDown, enabled = canMoveDown) {
                    Icon(Icons.Filled.KeyboardArrowDown, contentDescription = "Move down")
                }
            }
        }
    }
}

@Composable
private fun BulletRow(text: String) {
    Row(modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 4.dp)) {
        Text("•  ", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.primary)
        Text(text, style = MaterialTheme.typography.bodyMedium)
    }
}

@Composable
private fun LoadingState() {
    Column(
        modifier = Modifier.fillMaxSize(),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        CircularProgressIndicator()
        Spacer(Modifier.height(12.dp))
        Text("Loading itinerary…", color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

@Composable
private fun ErrorState(isOffline: Boolean, onRetry: () -> Unit) {
    Column(
        modifier = Modifier.fillMaxSize().padding(24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Text(
            if (isOffline) "You're offline." else "Couldn't load this itinerary.",
            style = MaterialTheme.typography.titleMedium,
            fontWeight = FontWeight.SemiBold,
        )
        Spacer(Modifier.height(12.dp))
        OutlinedButton(onClick = onRetry) { Text("Try again") }
    }
}

@Composable
private fun MessageBanner(message: String, onDismiss: () -> Unit) {
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
            TextButton(onClick = onDismiss) { Text("Dismiss") }
        }
    }
}

/**
 * Best-effort map of itinerary stops: geocodes free-text locations (capped at 8) and
 * drops markers. Degrades gracefully — if nothing geocodes, the section renders nothing.
 * Offline-safe (geocode fails quietly). Mirrors iOS TripMapPreview.
 */
@Composable
private fun TripMapPreview(locations: List<String>) {
    val context = LocalContext.current
    var markers by remember(locations) { mutableStateOf<List<Pair<String, LatLng>>>(emptyList()) }
    val cameraPositionState = rememberCameraPositionState()

    LaunchedEffect(locations) {
        if (!Geocoder.isPresent()) return@LaunchedEffect
        val geocoder = Geocoder(context)
        val found = withContext(Dispatchers.IO) {
            locations.distinct().take(8).mapNotNull { location ->
                val query = if (location.contains("Des Moines", ignoreCase = true)) {
                    location
                } else {
                    "$location, Des Moines, IA"
                }
                runCatching {
                    @Suppress("DEPRECATION")
                    geocoder.getFromLocationName(query, 1)?.firstOrNull()
                }.getOrNull()?.let { addr -> location to LatLng(addr.latitude, addr.longitude) }
            }
        }
        markers = found
        found.firstOrNull()?.let {
            cameraPositionState.position = CameraPosition.fromLatLngZoom(it.second, 12f)
        }
    }

    if (markers.isEmpty()) return

    Box(modifier = Modifier.fillMaxWidth().height(180.dp)) {
        GoogleMap(
            modifier = Modifier.fillMaxSize(),
            cameraPositionState = cameraPositionState,
            properties = MapProperties(),
            uiSettings = MapUiSettings(
                zoomControlsEnabled = false,
                scrollGesturesEnabled = false,
                zoomGesturesEnabled = false,
                rotationGesturesEnabled = false,
                tiltGesturesEnabled = false,
                mapToolbarEnabled = false,
            ),
        ) {
            markers.forEach { (name, position) ->
                // rememberMarkerState keyed by name: MarkerState(...) built inline was
                // reallocated on every recomposition, which lint flags as an error
                // (UnrememberedMutableState) because the marker loses any state it
                // holds. AND-AUDIT-013.
                Marker(state = rememberMarkerState(key = name, position = position), title = name)
            }
        }
    }
}

private val timeInputFormats = listOf(
    DateTimeFormatter.ofPattern("HH:mm:ss"),
    DateTimeFormatter.ofPattern("HH:mm"),
)
private val timeDisplay = DateTimeFormatter.ofPattern("h:mm a", UiFormatLocale)

private fun startTimeDisplay(raw: String?): String? {
    if (raw.isNullOrBlank()) return null
    for (fmt in timeInputFormats) {
        runCatching { return LocalTime.parse(raw, fmt).format(timeDisplay) }
    }
    return null
}

private fun typeIcon(itemType: String): ImageVector = when (itemType.lowercase()) {
    "event" -> Icons.Filled.Event
    "restaurant" -> Icons.Filled.Restaurant
    "attraction" -> Icons.Filled.Place
    "transit" -> Icons.Filled.DirectionsBus
    else -> Icons.Filled.Schedule
}
