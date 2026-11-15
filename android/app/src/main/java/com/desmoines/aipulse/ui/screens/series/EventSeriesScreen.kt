package com.desmoines.aipulse.ui.screens.series

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Share
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.desmoines.aipulse.util.EventSeriesSchedule
import com.desmoines.aipulse.util.SeriesEdition
import com.desmoines.aipulse.util.SeriesInstance

/**
 * The native /events/series/<slug> page (AND-AUDIT-042, slice 3b;
 * src/pages/EventSeriesPage.tsx, iOS EventSeriesView): the series name and
 * blurb, this year's dates or "<year> date not announced yet", then past
 * years newest first. A row with a linkId opens event detail; a row the stale
 * sweep hid has no page on the web either and is plain text here.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun EventSeriesScreen(
    state: EventSeriesUiState,
    onOpenEvent: (String) -> Unit,
    onShare: () -> Unit,
    onRetry: () -> Unit,
    onNavigateBack: () -> Unit,
) {
    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Text(state.def?.name ?: "Annual event", maxLines = 1, overflow = TextOverflow.Ellipsis)
                },
                navigationIcon = {
                    IconButton(onClick = onNavigateBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
                    }
                },
                actions = {
                    if (state.def != null) {
                        IconButton(onClick = onShare) {
                            Icon(Icons.Filled.Share, contentDescription = "Share")
                        }
                    }
                },
            )
        },
    ) { innerPadding ->
        LazyColumn(
            modifier = Modifier.fillMaxSize().padding(innerPadding),
            contentPadding = PaddingValues(horizontal = 16.dp, vertical = 12.dp),
        ) {
            state.def?.let { def ->
                item(key = "intro") {
                    Column(modifier = Modifier.padding(bottom = 16.dp)) {
                        Text(
                            def.name,
                            style = MaterialTheme.typography.headlineSmall,
                            fontWeight = FontWeight.Bold,
                            modifier = Modifier.semantics { heading() },
                        )
                        Spacer(Modifier.height(6.dp))
                        Text(
                            def.about,
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }
            }
            val schedule = state.schedule
            when {
                schedule != null -> {
                    EventSeriesSchedule.currentHeading(schedule)?.let { sectionHeading(it, "current-heading") }
                    val current = schedule.current
                    if (current != null) {
                        editionRows(current, onOpenEvent)
                    } else {
                        schedule.unannouncedYear?.let { year ->
                            item(key = "unannounced") {
                                Text(
                                    "${EventSeriesSchedule.unannouncedLabel(year)}. The date shows here once the organiser publishes it.",
                                    style = MaterialTheme.typography.bodyMedium,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                    modifier = Modifier.padding(vertical = 8.dp),
                                )
                            }
                        }
                    }
                    schedule.past.forEach { edition ->
                        sectionHeading(edition.year.toString(), "past-${edition.year}")
                        item(key = "summary-${edition.year}") {
                            Text(
                                EventSeriesSchedule.editionSummary(edition),
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                modifier = Modifier.padding(bottom = 4.dp),
                            )
                        }
                        editionRows(edition, onOpenEvent)
                    }
                }
                state.isLoading -> item(key = "loading") {
                    Box(Modifier.fillMaxWidth().padding(32.dp), contentAlignment = Alignment.Center) {
                        CircularProgressIndicator()
                    }
                }
                state.loadError != null -> item(key = "error") {
                    Column(
                        modifier = Modifier.fillMaxWidth().padding(24.dp),
                        horizontalAlignment = Alignment.CenterHorizontally,
                        verticalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        Text(state.loadError, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
                        if (state.def != null) {
                            Text(
                                "Check your connection and try again.",
                                style = MaterialTheme.typography.bodyMedium,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                            OutlinedButton(onClick = onRetry) { Text("Try again") }
                        }
                    }
                }
            }
        }
    }
}

private fun LazyListScope.sectionHeading(text: String, key: String) {
    item(key = key) {
        Text(
            text,
            style = MaterialTheme.typography.titleMedium,
            fontWeight = FontWeight.SemiBold,
            modifier = Modifier.padding(top = 16.dp, bottom = 4.dp).semantics { heading() },
        )
    }
}

private fun LazyListScope.editionRows(edition: SeriesEdition, onOpenEvent: (String) -> Unit) {
    items(edition.instances, key = { "instance-${it.id}" }) { instance ->
        InstanceRow(instance, onOpenEvent)
        HorizontalDivider()
    }
}

@Composable
private fun InstanceRow(instance: SeriesInstance, onOpenEvent: (String) -> Unit) {
    val linkId = instance.linkId
    val base = Modifier.fillMaxWidth().heightIn(min = 48.dp)
    val modifier = if (linkId != null) {
        base.clickable(role = Role.Button, onClickLabel = "Open event") { onOpenEvent(linkId) }
    } else {
        base
    }
    Column(modifier = modifier.padding(vertical = 10.dp), verticalArrangement = Arrangement.Center) {
        Text(
            EventSeriesSchedule.instanceTitle(instance),
            style = MaterialTheme.typography.bodyLarge,
            fontWeight = FontWeight.Medium,
            color = if (linkId != null) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurface,
        )
        EventSeriesSchedule.instanceDetail(instance)?.let {
            Text(it, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}
