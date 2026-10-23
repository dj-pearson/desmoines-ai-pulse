package com.desmoines.aipulse.ui.screens.explore

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
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
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowRight
import androidx.compose.material.icons.automirrored.filled.MenuBook
import androidx.compose.material.icons.filled.Dashboard
import androidx.compose.material.icons.filled.EmojiEvents
import androidx.compose.material.icons.filled.Explore
import androidx.compose.material.icons.filled.Hotel
import androidx.compose.material.icons.filled.LocalOffer
import androidx.compose.material.icons.filled.LocationCity
import androidx.compose.material.icons.filled.Weekend
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import com.desmoines.aipulse.ui.navigation.Route
import com.desmoines.aipulse.ui.theme.DesMoinesInsiderTheme
import com.desmoines.aipulse.ui.theme.Dimens

/**
 * The destinations that used to be eight stacked cards on Home (AND-OVH-025).
 * Mirrors the iOS Discover hub that IOS-IA-001 moved them into, so Home leads
 * with content instead of a screen and a half of navigation.
 *
 * Each entry names a route that already exists; this screen adds no new
 * destination of its own. The icon lives in [icon] rather than on the enum so
 * the list can be read in a JVM unit test without building any vectors.
 */
enum class ExploreDestination(
    val title: String,
    val subtitle: String,
    val route: Route,
) {
    WEEKEND("This weekend", "Your Fri-Sun plan: events, dining, and things to do", Route.Weekend),
    NEIGHBORHOODS("Neighborhoods", "Dining, attractions, and events by area", Route.Neighborhoods),
    CONTENT_HUBS("Explore by topic", "Live music, sports, and trails & outdoors", Route.ContentHubs),
    DASHBOARD("Your dashboard", "Trips, favorites, alerts, and recents in one place", Route.Dashboard),
    ARTICLES("Guides", "Local stories, tips, and curated city guides", Route.Articles),
    DEALS("Local deals", "Discounts and offers at spots around town", Route.Deals),
    STAY("Stay", "Hotels and stays across the metro", Route.Hotels),
    BEST_OF("Best of Des Moines", "Vote for your local favorites", Route.BestOf),
}

val ExploreDestination.icon: ImageVector
    get() = when (this) {
        ExploreDestination.WEEKEND -> Icons.Filled.Weekend
        ExploreDestination.NEIGHBORHOODS -> Icons.Filled.LocationCity
        ExploreDestination.CONTENT_HUBS -> Icons.Filled.Explore
        ExploreDestination.DASHBOARD -> Icons.Filled.Dashboard
        ExploreDestination.ARTICLES -> Icons.AutoMirrored.Filled.MenuBook
        ExploreDestination.DEALS -> Icons.Filled.LocalOffer
        ExploreDestination.STAY -> Icons.Filled.Hotel
        ExploreDestination.BEST_OF -> Icons.Filled.EmojiEvents
    }

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ExploreHubScreen(
    onOpenDestination: (ExploreDestination) -> Unit,
    onNavigateBack: () -> Unit,
) {
    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Explore") },
                navigationIcon = {
                    IconButton(onClick = onNavigateBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
                    }
                },
            )
        },
    ) { innerPadding ->
        LazyColumn(
            modifier = Modifier.fillMaxSize().padding(innerPadding),
            contentPadding = PaddingValues(vertical = 8.dp),
        ) {
            items(ExploreDestination.entries, key = { it.name }) { destination ->
                ExploreRow(destination = destination, onClick = { onOpenDestination(destination) })
            }
        }
    }
}

@Composable
private fun ExploreRow(destination: ExploreDestination, onClick: () -> Unit) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(role = Role.Button, onClickLabel = "Open ${destination.title}", onClick = onClick)
            .padding(horizontal = Dimens.SpacingLg, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(
            modifier = Modifier
                .size(44.dp)
                .clip(RoundedCornerShape(12.dp))
                .background(MaterialTheme.colorScheme.primaryContainer),
            contentAlignment = Alignment.Center,
        ) {
            Icon(
                imageVector = destination.icon,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.onPrimaryContainer,
            )
        }
        Spacer(Modifier.width(14.dp))
        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = destination.title,
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.SemiBold,
                color = MaterialTheme.colorScheme.onSurface,
            )
            Spacer(Modifier.height(2.dp))
            Text(
                text = destination.subtitle,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                maxLines = 2,
            )
        }
        Icon(
            imageVector = Icons.AutoMirrored.Filled.KeyboardArrowRight,
            contentDescription = null,
            tint = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}

@Preview(showBackground = true)
@Composable
private fun ExploreHubScreenPreview() {
    DesMoinesInsiderTheme {
        ExploreHubScreen(onOpenDestination = {}, onNavigateBack = {})
    }
}
