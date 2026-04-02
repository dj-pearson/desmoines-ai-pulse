package com.desmoines.aipulse.ui.screens.map

import android.content.Intent
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.animateDpAsState
import androidx.compose.animation.core.snap
import androidx.compose.animation.core.spring
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CalendarMonth
import androidx.compose.material.icons.filled.Cancel
import androidx.compose.material.icons.filled.CardGiftcard
import androidx.compose.material.icons.filled.ChevronRight
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Eco
import androidx.compose.material.icons.filled.FamilyRestroom
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material.icons.filled.Language
import androidx.compose.material.icons.filled.Map
import androidx.compose.material.icons.filled.MusicNote
import androidx.compose.material.icons.filled.Nightlife
import androidx.compose.material.icons.filled.Palette
import androidx.compose.material.icons.filled.Phone
import androidx.compose.material.icons.filled.Place
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Restaurant
import androidx.compose.material.icons.filled.School
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.SportsTennis
import androidx.compose.material.icons.filled.Star
import androidx.compose.material.icons.filled.Work
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.desmoines.aipulse.data.model.Attraction
import com.desmoines.aipulse.data.model.AttractionType
import com.desmoines.aipulse.data.model.Event
import com.desmoines.aipulse.data.model.EventCategory
import com.desmoines.aipulse.data.model.Restaurant
import com.desmoines.aipulse.ui.components.CachedAsyncImage
import com.desmoines.aipulse.util.rememberShouldReduceAnimations
import com.google.android.gms.maps.model.CameraPosition
import com.google.android.gms.maps.model.LatLng
import android.Manifest
import android.content.pm.PackageManager
import androidx.core.content.ContextCompat
import com.google.maps.android.compose.GoogleMap
import com.google.maps.android.compose.MapProperties
import com.google.maps.android.compose.MapUiSettings
import com.google.maps.android.compose.MarkerComposable
import com.google.maps.android.compose.MarkerState
import com.google.maps.android.compose.rememberCameraPositionState
import java.time.format.DateTimeFormatter

/**
 * Map/Explore screen showing nearby events, restaurants, and attractions
 * on an interactive Google Map with search and popup cards.
 * Mirrors iOS EventMapView.swift.
 */
@Composable
fun MapScreen(
    state: MapScreenState,
    onSearchTextChanged: (String) -> Unit,
    onSearch: () -> Unit,
    onToggleEvents: () -> Unit,
    onToggleRestaurants: () -> Unit,
    onToggleAttractions: () -> Unit,
    onSelectEvent: (Event) -> Unit,
    onSelectRestaurant: (Restaurant) -> Unit,
    onSelectAttraction: (Attraction) -> Unit,
    onClearSelection: () -> Unit,
    onRetry: () -> Unit,
    onNavigateToEventDetail: (String) -> Unit,
    onNavigateToRestaurantDetail: (String) -> Unit,
    onNavigateToAttractionDetail: (String) -> Unit,
) {
    val context = LocalContext.current
    val hasLocationPermission = remember(context) {
        ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_FINE_LOCATION) ==
            PackageManager.PERMISSION_GRANTED ||
        ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_COARSE_LOCATION) ==
            PackageManager.PERMISSION_GRANTED
    }

    val cameraPositionState = rememberCameraPositionState {
        position = state.cameraPosition
    }

    // Update camera when state changes (e.g., after search)
    androidx.compose.runtime.LaunchedEffect(state.cameraPosition) {
        if (state.hasLoadedOnce) {
            cameraPositionState.position = state.cameraPosition
        }
    }

    Box(modifier = Modifier.fillMaxSize()) {
        // Map layer
        GoogleMap(
            modifier = Modifier.fillMaxSize(),
            cameraPositionState = cameraPositionState,
            properties = MapProperties(
                isMyLocationEnabled = hasLocationPermission,
            ),
            uiSettings = MapUiSettings(
                myLocationButtonEnabled = true,
                compassEnabled = true,
                mapToolbarEnabled = false,
                zoomControlsEnabled = false,
            ),
            onMapClick = { onClearSelection() },
        ) {
            // Event markers
            state.eventAnnotations.forEach { annotation ->
                val isSelected = state.selectedEvent?.id == annotation.event.id
                MarkerComposable(
                    keys = arrayOf<Any>(annotation.id, isSelected),
                    state = MarkerState(position = annotation.position),
                    title = annotation.event.title,
                    onClick = {
                        onSelectEvent(annotation.event)
                        true
                    },
                ) {
                    EventMapPin(
                        category = annotation.event.eventCategory,
                        urgencyColor = annotation.urgencyColor,
                        isSelected = isSelected,
                    )
                }
            }

            // Restaurant markers
            state.restaurantAnnotations.forEach { annotation ->
                val isSelected = state.selectedRestaurant?.id == annotation.restaurant.id
                MarkerComposable(
                    keys = arrayOf<Any>(annotation.id, isSelected),
                    state = MarkerState(position = annotation.position),
                    title = annotation.restaurant.name,
                    onClick = {
                        onSelectRestaurant(annotation.restaurant)
                        true
                    },
                ) {
                    RestaurantMapPin(isSelected = isSelected)
                }
            }

            // Attraction markers
            state.attractionAnnotations.forEach { annotation ->
                val isSelected = state.selectedAttraction?.id == annotation.attraction.id
                MarkerComposable(
                    keys = arrayOf<Any>(annotation.id, isSelected),
                    state = MarkerState(position = annotation.position),
                    title = annotation.attraction.name,
                    onClick = {
                        onSelectAttraction(annotation.attraction)
                        true
                    },
                ) {
                    AttractionMapPin(isSelected = isSelected)
                }
            }
        }

        // Overlays
        Column(modifier = Modifier.fillMaxSize()) {
            // Search bar
            SearchBar(
                searchText = state.searchText,
                onSearchTextChanged = onSearchTextChanged,
                onSearch = onSearch,
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp, vertical = 8.dp),
            )

            Spacer(modifier = Modifier.weight(1f))

            // Error overlay (centered)
            if (state.errorMessage != null && state.isEmpty) {
                ErrorOverlay(
                    message = state.errorMessage,
                    onRetry = onRetry,
                    modifier = Modifier.align(Alignment.CenterHorizontally),
                )
            }

            Spacer(modifier = Modifier.weight(1f))

            // Loading indicator
            AnimatedVisibility(
                visible = state.isLoading,
                enter = fadeIn(),
                exit = fadeOut(),
                modifier = Modifier.align(Alignment.CenterHorizontally),
            ) {
                LoadingPill()
            }

            // Pin count badge
            if (state.totalPinCount > 0) {
                PinCountBadge(
                    count = state.totalPinCount,
                    modifier = Modifier
                        .align(Alignment.CenterHorizontally)
                        .padding(bottom = 4.dp),
                )
            }
        }

        // Toggle controls (top-right, below search bar)
        Column(
            modifier = Modifier
                .align(Alignment.TopEnd)
                .padding(top = 68.dp, end = 12.dp),
        ) {
            ToggleControls(
                showEvents = state.showEvents,
                showRestaurants = state.showRestaurants,
                showAttractions = state.showAttractions,
                onToggleEvents = onToggleEvents,
                onToggleRestaurants = onToggleRestaurants,
                onToggleAttractions = onToggleAttractions,
            )
        }

        // Popup card at bottom
        AnimatedVisibility(
            visible = state.selectedEvent != null || state.selectedRestaurant != null || state.selectedAttraction != null,
            enter = slideInVertically(initialOffsetY = { it }) + fadeIn(),
            exit = slideOutVertically(targetOffsetY = { it }) + fadeOut(),
            modifier = Modifier
                .align(Alignment.BottomCenter)
                .padding(16.dp),
        ) {
            when {
                state.selectedEvent != null -> EventPopup(
                    event = state.selectedEvent,
                    onNavigate = { onNavigateToEventDetail(state.selectedEvent.id) },
                    onDismiss = onClearSelection,
                )
                state.selectedRestaurant != null -> RestaurantPopup(
                    restaurant = state.selectedRestaurant,
                    onNavigate = { onNavigateToRestaurantDetail(state.selectedRestaurant.id) },
                    onDismiss = onClearSelection,
                )
                state.selectedAttraction != null -> AttractionPopup(
                    attraction = state.selectedAttraction,
                    onNavigate = { onNavigateToAttractionDetail(state.selectedAttraction.id) },
                    onDismiss = onClearSelection,
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
    onSearch: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Surface(
        modifier = modifier,
        shape = RoundedCornerShape(12.dp),
        shadowElevation = 4.dp,
        color = MaterialTheme.colorScheme.surface,
    ) {
        OutlinedTextField(
            value = searchText,
            onValueChange = onSearchTextChanged,
            modifier = Modifier.fillMaxWidth(),
            placeholder = {
                Text(
                    "Search events, dining, attractions...",
                    style = MaterialTheme.typography.bodySmall,
                )
            },
            leadingIcon = {
                Icon(
                    Icons.Filled.Search,
                    contentDescription = null,
                    tint = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.size(20.dp),
                )
            },
            trailingIcon = {
                if (searchText.isNotEmpty()) {
                    IconButton(onClick = {
                        onSearchTextChanged("")
                        onSearch()
                    }) {
                        Icon(
                            Icons.Filled.Cancel,
                            contentDescription = "Clear search",
                            tint = MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier.size(20.dp),
                        )
                    }
                }
            },
            keyboardOptions = KeyboardOptions(imeAction = ImeAction.Search),
            keyboardActions = KeyboardActions(onSearch = { onSearch() }),
            singleLine = true,
            shape = RoundedCornerShape(12.dp),
            colors = OutlinedTextFieldDefaults.colors(
                focusedBorderColor = Color.Transparent,
                unfocusedBorderColor = Color.Transparent,
            ),
            textStyle = MaterialTheme.typography.bodySmall,
        )
    }
}

// endregion

// region Toggle Controls

@Composable
private fun ToggleControls(
    showEvents: Boolean,
    showRestaurants: Boolean,
    showAttractions: Boolean,
    onToggleEvents: () -> Unit,
    onToggleRestaurants: () -> Unit,
    onToggleAttractions: () -> Unit,
) {
    Surface(
        shape = RoundedCornerShape(12.dp),
        color = MaterialTheme.colorScheme.surface.copy(alpha = 0.9f),
        shadowElevation = 4.dp,
    ) {
        Column(
            modifier = Modifier.padding(6.dp),
            verticalArrangement = Arrangement.spacedBy(4.dp),
        ) {
            ToggleButton(
                checked = showEvents,
                onToggle = onToggleEvents,
                icon = Icons.Filled.CalendarMonth,
                label = "Events",
                activeColor = Color(0xFF2196F3), // blue
            )
            ToggleButton(
                checked = showRestaurants,
                onToggle = onToggleRestaurants,
                icon = Icons.Filled.Restaurant,
                label = "Dining",
                activeColor = Color(0xFFFF9800), // orange
            )
            ToggleButton(
                checked = showAttractions,
                onToggle = onToggleAttractions,
                icon = Icons.Filled.Place,
                label = "Places",
                activeColor = Color(0xFF4CAF50), // green
            )
        }
    }
}

@Composable
private fun ToggleButton(
    checked: Boolean,
    onToggle: () -> Unit,
    icon: ImageVector,
    label: String,
    activeColor: Color,
) {
    val backgroundColor = if (checked) activeColor.copy(alpha = 0.15f) else Color.Transparent
    val contentColor = if (checked) activeColor else MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.5f)

    Surface(
        onClick = onToggle,
        shape = RoundedCornerShape(8.dp),
        color = backgroundColor,
        modifier = Modifier.semantics {
            contentDescription = "$label ${if (checked) "visible" else "hidden"}"
        },
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 8.dp, vertical = 6.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(4.dp),
        ) {
            Icon(
                icon,
                contentDescription = null,
                tint = contentColor,
                modifier = Modifier.size(16.dp),
            )
            Text(
                label,
                style = MaterialTheme.typography.labelSmall,
                color = contentColor,
            )
        }
    }
}

// endregion

// region Error Overlay

@Composable
private fun ErrorOverlay(
    message: String,
    onRetry: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Surface(
        modifier = modifier.padding(horizontal = 40.dp),
        shape = RoundedCornerShape(16.dp),
        color = MaterialTheme.colorScheme.surface.copy(alpha = 0.95f),
        shadowElevation = 8.dp,
    ) {
        Column(
            modifier = Modifier.padding(20.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Icon(
                Icons.Filled.Map,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.size(36.dp),
            )
            Text(
                message,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                textAlign = androidx.compose.ui.text.style.TextAlign.Center,
            )
            TextButton(onClick = onRetry) {
                Icon(Icons.Filled.Refresh, contentDescription = null, modifier = Modifier.size(16.dp))
                Spacer(modifier = Modifier.width(4.dp))
                Text("Try Again", style = MaterialTheme.typography.labelMedium.copy(fontWeight = FontWeight.Medium))
            }
        }
    }
}

// endregion

// region Loading Pill

@Composable
private fun LoadingPill() {
    Surface(
        shape = RoundedCornerShape(50),
        color = MaterialTheme.colorScheme.surface.copy(alpha = 0.9f),
        modifier = Modifier.padding(bottom = 8.dp),
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 16.dp, vertical = 10.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            CircularProgressIndicator(
                modifier = Modifier.size(14.dp),
                strokeWidth = 2.dp,
            )
            Text(
                "Finding nearby places...",
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

// endregion

// region Pin Count Badge

@Composable
private fun PinCountBadge(count: Int, modifier: Modifier = Modifier) {
    Surface(
        modifier = modifier,
        shape = RoundedCornerShape(50),
        color = MaterialTheme.colorScheme.surface.copy(alpha = 0.85f),
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 10.dp, vertical = 6.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            Icon(
                Icons.Filled.Place,
                contentDescription = null,
                modifier = Modifier.size(14.dp),
                tint = MaterialTheme.colorScheme.primary,
            )
            Text(
                "$count places",
                style = MaterialTheme.typography.labelSmall.copy(fontWeight = FontWeight.Medium),
            )
        }
    }
}

// endregion

// region Popup Cards

@Composable
private fun EventPopup(
    event: Event,
    onNavigate: () -> Unit,
    onDismiss: () -> Unit,
) {
    val dateFormatter = remember { DateTimeFormatter.ofPattern("MMM d, h:mm a") }

    PopupCard {
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            // Image
            Box(
                modifier = Modifier
                    .size(64.dp)
                    .clip(RoundedCornerShape(10.dp))
                    .background(event.eventCategory.color.copy(alpha = 0.15f)),
                contentAlignment = Alignment.Center,
            ) {
                if (event.imageUrl != null) {
                    CachedAsyncImage(
                        url = event.imageUrl,
                        contentDescription = event.title,
                        modifier = Modifier.fillMaxSize(),
                    )
                } else {
                    Icon(
                        Icons.Filled.CalendarMonth,
                        contentDescription = null,
                        tint = event.eventCategory.color.copy(alpha = 0.5f),
                        modifier = Modifier.size(28.dp),
                    )
                }
            }

            // Info
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    event.title,
                    style = MaterialTheme.typography.bodyMedium.copy(fontWeight = FontWeight.SemiBold),
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                event.parsedDate?.let { date ->
                    Text(
                        date.format(dateFormatter),
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                Text(
                    event.displayLocation,
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.7f),
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }

            // Navigate button
            IconButton(onClick = onNavigate) {
                Icon(
                    Icons.Filled.ChevronRight,
                    contentDescription = "View details",
                    tint = MaterialTheme.colorScheme.primary,
                    modifier = Modifier.size(28.dp),
                )
            }

            // Close button
            IconButton(onClick = onDismiss, modifier = Modifier.size(36.dp)) {
                Icon(
                    Icons.Filled.Close,
                    contentDescription = "Dismiss",
                    tint = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.size(20.dp),
                )
            }
        }
    }
}

@Composable
private fun RestaurantPopup(
    restaurant: Restaurant,
    onNavigate: () -> Unit,
    onDismiss: () -> Unit,
) {
    val context = LocalContext.current

    PopupCard {
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            // Image
            Box(
                modifier = Modifier
                    .size(64.dp)
                    .clip(RoundedCornerShape(10.dp))
                    .background(Color(0xFFFF9800).copy(alpha = 0.1f)),
                contentAlignment = Alignment.Center,
            ) {
                if (restaurant.imageUrl != null) {
                    CachedAsyncImage(
                        url = restaurant.imageUrl,
                        contentDescription = restaurant.name,
                        modifier = Modifier.fillMaxSize(),
                    )
                } else {
                    Icon(
                        Icons.Filled.Restaurant,
                        contentDescription = null,
                        tint = Color(0xFFFF9800).copy(alpha = 0.4f),
                        modifier = Modifier.size(28.dp),
                    )
                }
            }

            // Info
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    restaurant.name,
                    style = MaterialTheme.typography.bodyMedium.copy(fontWeight = FontWeight.SemiBold),
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    restaurant.cuisine?.let {
                        Text(
                            it,
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                    restaurant.rating?.let { rating ->
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(2.dp),
                        ) {
                            Icon(
                                Icons.Filled.Star,
                                contentDescription = null,
                                tint = Color(0xFFFFB300),
                                modifier = Modifier.size(12.dp),
                            )
                            Text(
                                String.format("%.1f", rating),
                                style = MaterialTheme.typography.labelSmall,
                            )
                        }
                    }
                }
                Text(
                    restaurant.displayLocation,
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.7f),
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }

            // Call button (if phone available)
            restaurant.callUri?.let { uri ->
                IconButton(onClick = {
                    context.startActivity(Intent(Intent.ACTION_DIAL, uri))
                }) {
                    Icon(
                        Icons.Filled.Phone,
                        contentDescription = "Call",
                        tint = Color(0xFF4CAF50),
                        modifier = Modifier.size(24.dp),
                    )
                }
            } ?: run {
                // Navigate button if no phone
                IconButton(onClick = onNavigate) {
                    Icon(
                        Icons.Filled.ChevronRight,
                        contentDescription = "View details",
                        tint = MaterialTheme.colorScheme.primary,
                        modifier = Modifier.size(28.dp),
                    )
                }
            }

            // Close button
            IconButton(onClick = onDismiss, modifier = Modifier.size(36.dp)) {
                Icon(
                    Icons.Filled.Close,
                    contentDescription = "Dismiss",
                    tint = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.size(20.dp),
                )
            }
        }
    }
}

@Composable
private fun AttractionPopup(
    attraction: Attraction,
    onNavigate: () -> Unit,
    onDismiss: () -> Unit,
) {
    val context = LocalContext.current

    PopupCard {
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            // Image
            Box(
                modifier = Modifier
                    .size(64.dp)
                    .clip(RoundedCornerShape(10.dp))
                    .background(Color(0xFF4CAF50).copy(alpha = 0.1f)),
                contentAlignment = Alignment.Center,
            ) {
                if (attraction.imageUrl != null) {
                    CachedAsyncImage(
                        url = attraction.imageUrl,
                        contentDescription = attraction.name,
                        modifier = Modifier.fillMaxSize(),
                    )
                } else {
                    Icon(
                        Icons.Filled.Place,
                        contentDescription = null,
                        tint = Color(0xFF4CAF50).copy(alpha = 0.4f),
                        modifier = Modifier.size(28.dp),
                    )
                }
            }

            // Info
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    attraction.name,
                    style = MaterialTheme.typography.bodyMedium.copy(fontWeight = FontWeight.SemiBold),
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                Text(
                    attraction.attractionType.displayName,
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                attraction.rating?.let { rating ->
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(2.dp),
                    ) {
                        Icon(
                            Icons.Filled.Star,
                            contentDescription = null,
                            tint = Color(0xFFFFB300),
                            modifier = Modifier.size(12.dp),
                        )
                        Text(
                            String.format("%.1f", rating),
                            style = MaterialTheme.typography.labelSmall,
                        )
                    }
                }
            }

            // Website button (if available) or navigate
            attraction.websiteUri?.let { uri ->
                IconButton(onClick = {
                    context.startActivity(Intent(Intent.ACTION_VIEW, uri))
                }) {
                    Icon(
                        Icons.Filled.Language,
                        contentDescription = "Website",
                        tint = MaterialTheme.colorScheme.primary,
                        modifier = Modifier.size(24.dp),
                    )
                }
            } ?: run {
                IconButton(onClick = onNavigate) {
                    Icon(
                        Icons.Filled.ChevronRight,
                        contentDescription = "View details",
                        tint = MaterialTheme.colorScheme.primary,
                        modifier = Modifier.size(28.dp),
                    )
                }
            }

            // Close button
            IconButton(onClick = onDismiss, modifier = Modifier.size(36.dp)) {
                Icon(
                    Icons.Filled.Close,
                    contentDescription = "Dismiss",
                    tint = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.size(20.dp),
                )
            }
        }
    }
}

@Composable
private fun PopupCard(content: @Composable () -> Unit) {
    Surface(
        shape = RoundedCornerShape(16.dp),
        color = MaterialTheme.colorScheme.surface.copy(alpha = 0.97f),
        shadowElevation = 8.dp,
        modifier = Modifier.fillMaxWidth(),
    ) {
        Box(modifier = Modifier.padding(14.dp)) {
            content()
        }
    }
}

// endregion

// region Custom Map Pins

@Composable
private fun EventMapPin(
    category: EventCategory,
    urgencyColor: PinColor,
    isSelected: Boolean,
) {
    val reduceAnimations = rememberShouldReduceAnimations()
    val pinAnimSpec = if (reduceAnimations) snap<Dp>() else spring<Dp>(dampingRatio = Spring.DampingRatioMediumBouncy)
    val size by animateDpAsState(
        targetValue = if (isSelected) 40.dp else 32.dp,
        animationSpec = pinAnimSpec,
        label = "pinSize",
    )
    val iconSize by animateDpAsState(
        targetValue = if (isSelected) 16.dp else 12.dp,
        animationSpec = pinAnimSpec,
        label = "iconSize",
    )
    val pinColor = category.color

    Box(
        modifier = Modifier
            .size(size)
            .shadow(
                elevation = if (isSelected) 6.dp else 3.dp,
                shape = CircleShape,
                ambientColor = pinColor.copy(alpha = 0.4f),
            )
            .background(pinColor, CircleShape),
        contentAlignment = Alignment.Center,
    ) {
        Icon(
            imageVector = categoryIcon(category),
            contentDescription = category.displayName,
            tint = Color.White,
            modifier = Modifier.size(iconSize),
        )
    }
}

@Composable
private fun RestaurantMapPin(isSelected: Boolean) {
    val reduceAnimations = rememberShouldReduceAnimations()
    val pinAnimSpec = if (reduceAnimations) snap<Dp>() else spring<Dp>(dampingRatio = Spring.DampingRatioMediumBouncy)
    val size by animateDpAsState(
        targetValue = if (isSelected) 38.dp else 30.dp,
        animationSpec = pinAnimSpec,
        label = "pinSize",
    )
    val iconSize by animateDpAsState(
        targetValue = if (isSelected) 14.dp else 11.dp,
        animationSpec = pinAnimSpec,
        label = "iconSize",
    )

    Box(
        modifier = Modifier
            .size(size)
            .shadow(
                elevation = if (isSelected) 6.dp else 3.dp,
                shape = CircleShape,
                ambientColor = Color(0xFFFF9800).copy(alpha = 0.4f),
            )
            .background(Color(0xFFFF9800), CircleShape),
        contentAlignment = Alignment.Center,
    ) {
        Icon(
            Icons.Filled.Restaurant,
            contentDescription = "Restaurant",
            tint = Color.White,
            modifier = Modifier.size(iconSize),
        )
    }
}

@Composable
private fun AttractionMapPin(isSelected: Boolean) {
    val reduceAnimations = rememberShouldReduceAnimations()
    val pinAnimSpec = if (reduceAnimations) snap<Dp>() else spring<Dp>(dampingRatio = Spring.DampingRatioMediumBouncy)
    val size by animateDpAsState(
        targetValue = if (isSelected) 38.dp else 30.dp,
        animationSpec = pinAnimSpec,
        label = "pinSize",
    )
    val iconSize by animateDpAsState(
        targetValue = if (isSelected) 14.dp else 11.dp,
        animationSpec = pinAnimSpec,
        label = "iconSize",
    )

    Box(
        modifier = Modifier
            .size(size)
            .shadow(
                elevation = if (isSelected) 6.dp else 3.dp,
                shape = CircleShape,
                ambientColor = Color(0xFF4CAF50).copy(alpha = 0.4f),
            )
            .background(Color(0xFF4CAF50), CircleShape),
        contentAlignment = Alignment.Center,
    ) {
        Icon(
            Icons.Filled.Place,
            contentDescription = "Attraction",
            tint = Color.White,
            modifier = Modifier.size(iconSize),
        )
    }
}

/** Map EventCategory to Material Icon (Extended). */
private fun categoryIcon(category: EventCategory): ImageVector = when (category) {
    EventCategory.GENERAL -> Icons.Filled.CalendarMonth
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
}

// endregion
