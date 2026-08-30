package com.desmoines.aipulse.ui.screens.tripplanner

import com.desmoines.aipulse.util.UiFormatLocale
import android.content.Intent
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.CalendarMonth
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Share
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
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
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.desmoines.aipulse.data.model.TripPlan
import com.desmoines.aipulse.ui.components.EmptyStateView
import com.desmoines.aipulse.ui.components.LoadingView
import java.time.LocalDate
import java.time.format.DateTimeFormatter

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SavedTripsScreen(
    state: SavedTripsUiState,
    onShare: (String) -> Unit,
    onDelete: (String) -> Unit,
    onOpenTrip: (String) -> Unit,
    onConsumeShareUrl: () -> Unit,
    onClearError: () -> Unit,
    onNavigateBack: () -> Unit,
) {
    val context = LocalContext.current
    var pendingDelete by remember { mutableStateOf<String?>(null) }

    // Launch the system share sheet when a share URL becomes available.
    LaunchedEffect(state.shareUrl) {
        state.shareUrl?.let { url ->
            val intent = Intent(Intent.ACTION_SEND).apply {
                type = "text/plain"
                putExtra(Intent.EXTRA_TEXT, "Check out my Des Moines itinerary: $url")
            }
            context.startActivity(Intent.createChooser(intent, "Share itinerary"))
            onConsumeShareUrl()
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Your trips") },
                navigationIcon = {
                    IconButton(onClick = onNavigateBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
                    }
                },
            )
        },
    ) { innerPadding ->
        Column(modifier = Modifier.fillMaxSize().padding(innerPadding)) {
            state.errorMessage?.let { message ->
                ErrorBanner(message = message, onDismiss = onClearError)
            }

            when {
                state.isLoading && state.trips.isEmpty() -> LoadingView(message = "Loading…")
                state.isEmpty -> EmptyStateView(
                    icon = Icons.Filled.CalendarMonth,
                    title = "No saved trips yet",
                    message = "Your generated itineraries will appear here.",
                )
                else -> LazyColumn(modifier = Modifier.fillMaxSize()) {
                    items(state.trips, key = { it.id }) { trip ->
                        SavedTripRow(
                            trip = trip,
                            onOpen = { onOpenTrip(trip.id) },
                            onShare = { onShare(trip.id) },
                            onDelete = { pendingDelete = trip.id },
                        )
                        HorizontalDivider()
                    }
                }
            }
        }
    }

    pendingDelete?.let { id ->
        AlertDialog(
            onDismissRequest = { pendingDelete = null },
            title = { Text("Delete this trip?") },
            text = { Text("This itinerary will be permanently removed.") },
            confirmButton = {
                TextButton(onClick = {
                    onDelete(id)
                    pendingDelete = null
                }) { Text("Delete") }
            },
            dismissButton = {
                TextButton(onClick = { pendingDelete = null }) { Text("Cancel") }
            },
        )
    }
}

@Composable
private fun SavedTripRow(trip: TripPlan, onOpen: () -> Unit, onShare: () -> Unit, onDelete: () -> Unit) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onOpen)
            .padding(horizontal = 16.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = trip.title.ifBlank { "Untitled trip" },
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.SemiBold,
            )
            Text(
                text = dateRange(trip.startDate, trip.endDate),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        IconButton(onClick = onShare) {
            Icon(Icons.Filled.Share, contentDescription = "Share trip")
        }
        IconButton(onClick = onDelete) {
            Icon(
                Icons.Filled.Delete,
                contentDescription = "Delete trip",
                tint = MaterialTheme.colorScheme.error,
            )
        }
    }
}

@Composable
private fun ErrorBanner(message: String, onDismiss: () -> Unit) {
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

private val isoDate = DateTimeFormatter.ISO_LOCAL_DATE
private val prettyDate = DateTimeFormatter.ofPattern("MMM d", UiFormatLocale)

private fun dateRange(start: String?, end: String?): String {
    val s = start?.let { runCatching { LocalDate.parse(it, isoDate).format(prettyDate) }.getOrNull() } ?: start
    val e = end?.let { runCatching { LocalDate.parse(it, isoDate).format(prettyDate) }.getOrNull() } ?: end
    return when {
        s != null && e != null -> "$s – $e"
        s != null -> s
        else -> ""
    }
}
