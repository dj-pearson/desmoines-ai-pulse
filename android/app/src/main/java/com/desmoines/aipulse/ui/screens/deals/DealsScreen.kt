package com.desmoines.aipulse.ui.screens.deals

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
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.AssistChip
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.desmoines.aipulse.data.model.Deal

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DealsScreen(
    state: DealsUiState,
    entityTypes: List<String>,
    onSearchTextChanged: (String) -> Unit,
    onEntityTypeSelected: (String?) -> Unit,
    onToggleActiveNow: () -> Unit,
    onRetry: () -> Unit,
    onOpenDeal: (Deal) -> Unit,
    onNavigateBack: () -> Unit,
) {
    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Deals") },
                navigationIcon = {
                    IconButton(onClick = onNavigateBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
                    }
                },
            )
        },
    ) { innerPadding ->
        Column(modifier = Modifier.fillMaxSize().padding(innerPadding)) {
            OutlinedTextField(
                value = state.searchText,
                onValueChange = onSearchTextChanged,
                modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp),
                placeholder = { Text("Search deals") },
                leadingIcon = { Icon(Icons.Filled.Search, contentDescription = null) },
                singleLine = true,
            )

            LazyRow(
                contentPadding = PaddingValues(horizontal = 16.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                item(key = "all") {
                    FilterChip(selected = state.entityType == null, onClick = { onEntityTypeSelected(null) }, label = { Text("All") })
                }
                items(entityTypes, key = { it }) { type ->
                    FilterChip(
                        selected = state.entityType == type,
                        onClick = { onEntityTypeSelected(type) },
                        label = { Text(type.replaceFirstChar { it.uppercase() }) },
                    )
                }
                item(key = "activeNow") {
                    FilterChip(selected = state.activeNowOnly, onClick = { onToggleActiveNow() }, label = { Text("Active now") })
                }
            }

            Box(modifier = Modifier.fillMaxSize()) {
                when {
                    state.isLoading -> SkeletonList()
                    state.errorMessage != null -> StatusMessage(state.errorMessage, "Retry", onRetry, Modifier.align(Alignment.Center))
                    state.isEmpty -> StatusMessage(
                        if (state.isFiltered) "No deals match your filters." else "No active deals right now.",
                        action = if (state.isFiltered) null else "Refresh",
                        onAction = onRetry,
                        modifier = Modifier.align(Alignment.Center),
                    )
                    else -> LazyColumn(
                        modifier = Modifier.fillMaxSize(),
                        contentPadding = PaddingValues(vertical = 8.dp),
                    ) {
                        items(state.deals, key = { it.id }) { deal ->
                            DealCard(deal = deal, onClick = { if (deal.entityId != null) onOpenDeal(deal) })
                            // In-feed ad after the 3rd card (free tier) — wired in ANDP-040 (#284).
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun DealCard(deal: Deal, onClick: () -> Unit) {
    val tappable = deal.entityId != null
    val active = deal.isActiveNow()
    Surface(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 6.dp)
            .then(if (tappable) Modifier.clickable(onClick = onClick) else Modifier),
        shape = MaterialTheme.shapes.large,
        color = MaterialTheme.colorScheme.surfaceVariant,
        border = if (deal.isSponsored) {
            androidx.compose.foundation.BorderStroke(2.dp, MaterialTheme.colorScheme.primary)
        } else null,
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Surface(shape = RoundedCornerShape(8.dp), color = MaterialTheme.colorScheme.primary) {
                    Text(
                        deal.valueLabel,
                        style = MaterialTheme.typography.labelLarge,
                        fontWeight = FontWeight.Bold,
                        color = MaterialTheme.colorScheme.onPrimary,
                        modifier = Modifier.padding(horizontal = 10.dp, vertical = 4.dp),
                    )
                }
                Spacer(Modifier.width(8.dp))
                if (deal.isSponsored) {
                    Text("FEATURED", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.primary, fontWeight = FontWeight.Bold)
                }
                Spacer(Modifier.weight(1f))
                if (active) {
                    Box(modifier = Modifier.size(8.dp).clip(CircleShape).background(Color(0xFF43A047)))
                    Spacer(Modifier.width(4.dp))
                    Text("Active now", style = MaterialTheme.typography.labelSmall, color = Color(0xFF43A047))
                }
            }
            Spacer(Modifier.height(8.dp))
            Text(deal.businessName, style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.primary, fontWeight = FontWeight.SemiBold)
            Text(deal.title, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold, maxLines = 2, overflow = TextOverflow.Ellipsis)
            deal.scheduleText?.let {
                Spacer(Modifier.height(2.dp))
                Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            deal.code?.takeIf { it.isNotBlank() }?.let { code ->
                Spacer(Modifier.height(8.dp))
                AssistChip(onClick = {}, label = { Text("Code: $code") })
            }
        }
    }
}

@Composable
private fun StatusMessage(message: String, action: String?, onAction: () -> Unit, modifier: Modifier = Modifier) {
    Column(modifier = modifier.padding(24.dp), horizontalAlignment = Alignment.CenterHorizontally) {
        Text(message, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
        if (action != null) {
            Spacer(Modifier.height(12.dp))
            OutlinedButton(onClick = onAction) { Text(action) }
        }
    }
}

@Composable
private fun SkeletonList() {
    Column(modifier = Modifier.fillMaxSize().padding(16.dp)) {
        repeat(4) {
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(120.dp)
                    .padding(vertical = 6.dp)
                    .clip(RoundedCornerShape(16.dp))
                    .background(MaterialTheme.colorScheme.surfaceVariant),
            )
        }
    }
}
