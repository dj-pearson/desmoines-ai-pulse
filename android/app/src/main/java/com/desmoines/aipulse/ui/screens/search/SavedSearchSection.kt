package com.desmoines.aipulse.ui.screens.search

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.NotificationsActive
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.desmoines.aipulse.data.model.SavedSearch

/**
 * Saved-searches list embedded in the Search welcome state (and reusable on the
 * Dashboard). Tap a row to re-run it; toggle alerts; delete with confirmation.
 */
@Composable
fun SavedSearchSection(
    searches: List<SavedSearch>,
    onRerun: (SavedSearch) -> Unit,
    onToggleAlerts: (SavedSearch) -> Unit,
    onDelete: (SavedSearch) -> Unit,
    modifier: Modifier = Modifier,
    maxVisible: Int = 6,
) {
    var pendingDelete by remember { mutableStateOf<SavedSearch?>(null) }

    Column(modifier = modifier.fillMaxWidth()) {
        Text(
            "Saved searches",
            style = MaterialTheme.typography.titleSmall,
            fontWeight = FontWeight.Bold,
            modifier = Modifier.padding(start = 16.dp, end = 16.dp, top = 12.dp, bottom = 4.dp),
        )
        searches.take(maxVisible).forEach { search ->
            SavedSearchRow(
                search = search,
                onRerun = { onRerun(search) },
                onToggleAlerts = { onToggleAlerts(search) },
                onDelete = { pendingDelete = search },
            )
            HorizontalDivider()
        }
    }

    pendingDelete?.let { search ->
        AlertDialog(
            onDismissRequest = { pendingDelete = null },
            title = { Text("Delete saved search?") },
            text = { Text("\"${search.name}\" will be removed.") },
            confirmButton = {
                TextButton(onClick = {
                    onDelete(search)
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
private fun SavedSearchRow(
    search: SavedSearch,
    onRerun: () -> Unit,
    onToggleAlerts: () -> Unit,
    onDelete: () -> Unit,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onRerun)
            .padding(horizontal = 16.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(modifier = Modifier.weight(1f)) {
            Text(
                search.name.ifBlank { "Untitled search" },
                style = MaterialTheme.typography.bodyLarge,
                fontWeight = FontWeight.SemiBold,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            val tab = search.filters.tab
            if (!tab.isNullOrBlank()) {
                Text(
                    tab,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
        Row(verticalAlignment = Alignment.CenterVertically) {
            Icon(
                Icons.Filled.NotificationsActive,
                contentDescription = "Alerts",
                modifier = Modifier.size(18.dp),
                tint = if (search.alertsEnabled) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Spacer(Modifier.width(4.dp))
            Switch(checked = search.alertsEnabled, onCheckedChange = { onToggleAlerts() })
            IconButton(onClick = onDelete) {
                Icon(
                    Icons.Filled.Delete,
                    contentDescription = "Delete saved search",
                    tint = MaterialTheme.colorScheme.error,
                )
            }
        }
    }
}
