package com.desmoines.aipulse.ui.screens.tripplanner

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.AutoAwesome
import androidx.compose.material.icons.filled.Remove
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FilterChipDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.desmoines.aipulse.data.model.TripBudget
import com.desmoines.aipulse.data.model.TripPace
import com.desmoines.aipulse.data.model.TripPlan

@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
fun TripPlannerScreen(
    state: TripPlannerUiState,
    allInterests: List<String>,
    allAccessibilityNeeds: List<String>,
    allDietaryRestrictions: List<String>,
    onSetStartOffset: (Int) -> Unit,
    onSetLength: (Int) -> Unit,
    onToggleInterest: (String) -> Unit,
    onToggleAccessibilityNeed: (String) -> Unit,
    onToggleDietaryRestriction: (String) -> Unit,
    onSetGroupSize: (Int) -> Unit,
    onSetHasChildren: (Boolean) -> Unit,
    onSetBudget: (TripBudget) -> Unit,
    onSetPace: (TripPace) -> Unit,
    onGenerate: () -> Unit,
    onReset: () -> Unit,
    onClearError: () -> Unit,
    onViewSavedTrips: () -> Unit,
    onNavigateBack: () -> Unit,
) {
    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Trip Planner") },
                navigationIcon = {
                    IconButton(onClick = onNavigateBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
                    }
                },
                actions = {
                    TextButton(onClick = onViewSavedTrips) { Text("Saved") }
                },
            )
        },
    ) { innerPadding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding)
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 16.dp, vertical = 8.dp),
        ) {
            val result = state.result
            if (result != null) {
                ItineraryResult(plan = result, onReset = onReset)
            } else {
                PlannerForm(
                    state = state,
                    allInterests = allInterests,
                    allAccessibilityNeeds = allAccessibilityNeeds,
                    allDietaryRestrictions = allDietaryRestrictions,
                    onSetStartOffset = onSetStartOffset,
                    onSetLength = onSetLength,
                    onToggleInterest = onToggleInterest,
                    onToggleAccessibilityNeed = onToggleAccessibilityNeed,
                    onToggleDietaryRestriction = onToggleDietaryRestriction,
                    onSetGroupSize = onSetGroupSize,
                    onSetHasChildren = onSetHasChildren,
                    onSetBudget = onSetBudget,
                    onSetPace = onSetPace,
                    onGenerate = onGenerate,
                    onClearError = onClearError,
                )
            }
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun PlannerForm(
    state: TripPlannerUiState,
    allInterests: List<String>,
    allAccessibilityNeeds: List<String>,
    allDietaryRestrictions: List<String>,
    onSetStartOffset: (Int) -> Unit,
    onSetLength: (Int) -> Unit,
    onToggleInterest: (String) -> Unit,
    onToggleAccessibilityNeed: (String) -> Unit,
    onToggleDietaryRestriction: (String) -> Unit,
    onSetGroupSize: (Int) -> Unit,
    onSetHasChildren: (Boolean) -> Unit,
    onSetBudget: (TripBudget) -> Unit,
    onSetPace: (TripPace) -> Unit,
    onGenerate: () -> Unit,
    onClearError: () -> Unit,
) {
    QuotaMeter(label = state.quotaLabel)

    SectionLabel("When")
    Stepper(
        label = "Starts in ${state.startOffsetDays} day(s)  ·  ${state.startDate}",
        onMinus = { onSetStartOffset(state.startOffsetDays - 1) },
        onPlus = { onSetStartOffset(state.startOffsetDays + 1) },
    )
    Stepper(
        label = "${state.lengthDays} day(s)  ·  ends ${state.endDate}",
        onMinus = { onSetLength(state.lengthDays - 1) },
        onPlus = { onSetLength(state.lengthDays + 1) },
    )

    SectionLabel("Interests")
    FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        allInterests.forEach { interest ->
            FilterChip(
                selected = interest in state.interests,
                onClick = { onToggleInterest(interest) },
                label = { Text(interest.replaceFirstChar { it.uppercase() }) },
                leadingIcon = if (interest in state.interests) {
                    { Icon(Icons.Filled.AutoAwesome, contentDescription = null, modifier = Modifier.height(16.dp)) }
                } else null,
                colors = FilterChipDefaults.filterChipColors(),
            )
        }
    }

    SectionLabel("Accessibility")
    FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        allAccessibilityNeeds.forEach { need ->
            FilterChip(
                selected = need in state.accessibilityNeeds,
                onClick = { onToggleAccessibilityNeed(need) },
                label = { Text(need.replaceFirstChar { it.uppercase() }) },
                colors = FilterChipDefaults.filterChipColors(),
            )
        }
    }

    SectionLabel("Dietary needs")
    FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        allDietaryRestrictions.forEach { restriction ->
            FilterChip(
                selected = restriction in state.dietaryRestrictions,
                onClick = { onToggleDietaryRestriction(restriction) },
                label = { Text(restriction.replaceFirstChar { it.uppercase() }) },
                colors = FilterChipDefaults.filterChipColors(),
            )
        }
    }

    SectionLabel("Party")
    Stepper(
        label = "${state.groupSize} traveler(s)",
        onMinus = { onSetGroupSize(state.groupSize - 1) },
        onPlus = { onSetGroupSize(state.groupSize + 1) },
    )
    Row(
        modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text("Traveling with kids", modifier = Modifier.weight(1f))
        Switch(checked = state.hasChildren, onCheckedChange = onSetHasChildren)
    }

    SectionLabel("Budget")
    FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        TripBudget.entries.forEach { budget ->
            FilterChip(
                selected = state.budget == budget,
                onClick = { onSetBudget(budget) },
                label = { Text(budget.label) },
            )
        }
    }

    SectionLabel("Pace")
    FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        TripPace.entries.forEach { pace ->
            FilterChip(
                selected = state.pace == pace,
                onClick = { onSetPace(pace) },
                label = { Text(pace.label) },
            )
        }
    }

    state.errorMessage?.let { message ->
        Spacer(Modifier.height(12.dp))
        Surface(
            modifier = Modifier.fillMaxWidth(),
            shape = MaterialTheme.shapes.medium,
            color = MaterialTheme.colorScheme.errorContainer,
        ) {
            Row(
                modifier = Modifier.padding(12.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    message,
                    color = MaterialTheme.colorScheme.onErrorContainer,
                    style = MaterialTheme.typography.bodySmall,
                    modifier = Modifier.weight(1f),
                )
                OutlinedButton(onClick = onClearError) { Text("Dismiss") }
            }
        }
    }

    Spacer(Modifier.height(20.dp))
    Button(
        onClick = onGenerate,
        enabled = state.canGenerate,
        modifier = Modifier.fillMaxWidth(),
    ) {
        if (state.isGenerating) {
            CircularProgressIndicator(
                modifier = Modifier.height(18.dp),
                strokeWidth = 2.dp,
                color = MaterialTheme.colorScheme.onPrimary,
            )
            Text("  Building your itinerary…")
        } else {
            Text("Generate itinerary")
        }
    }
    Spacer(Modifier.height(24.dp))
}

@Composable
private fun ItineraryResult(plan: TripPlan, onReset: () -> Unit) {
    Text(
        text = plan.title.ifBlank { "Your Des Moines itinerary" },
        style = MaterialTheme.typography.headlineSmall,
        fontWeight = FontWeight.Bold,
    )
    plan.description?.takeIf { it.isNotBlank() }?.let {
        Text(it, style = MaterialTheme.typography.bodyMedium, modifier = Modifier.padding(top = 4.dp))
    }
    plan.totalEstimatedCost?.takeIf { it.isNotBlank() }?.let {
        Text(
            "Estimated cost: $it",
            style = MaterialTheme.typography.labelLarge,
            color = MaterialTheme.colorScheme.primary,
            modifier = Modifier.padding(top = 4.dp),
        )
    }

    plan.items.groupBy { it.dayNumber }.toSortedMap().forEach { (day, items) ->
        SectionLabel("Day $day")
        items.sortedBy { it.orderIndex }.forEach { item ->
            Column(modifier = Modifier.fillMaxWidth().padding(vertical = 6.dp)) {
                Row {
                    item.startTime?.let {
                        Text(
                            "$it  ",
                            style = MaterialTheme.typography.labelMedium,
                            color = MaterialTheme.colorScheme.primary,
                        )
                    }
                    Text(
                        item.title ?: item.itemType.replaceFirstChar { c -> c.uppercase() },
                        style = MaterialTheme.typography.titleSmall,
                        fontWeight = FontWeight.SemiBold,
                    )
                }
                item.aiReason?.takeIf { it.isNotBlank() }?.let {
                    Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
                item.estimatedCost?.takeIf { it.isNotBlank() }?.let {
                    Text(it, style = MaterialTheme.typography.labelSmall)
                }
            }
        }
    }

    if (plan.tips.isNotEmpty()) {
        SectionLabel("Tips")
        plan.tips.forEach { Text("• $it", style = MaterialTheme.typography.bodyMedium, modifier = Modifier.padding(vertical = 2.dp)) }
    }
    if (plan.packingList.isNotEmpty()) {
        SectionLabel("Packing list")
        plan.packingList.forEach { Text("• $it", style = MaterialTheme.typography.bodyMedium, modifier = Modifier.padding(vertical = 2.dp)) }
    }

    Spacer(Modifier.height(20.dp))
    OutlinedButton(onClick = onReset, modifier = Modifier.fillMaxWidth()) {
        Text("Plan another trip")
    }
    Spacer(Modifier.height(24.dp))
}

@Composable
private fun QuotaMeter(label: String) {
    Surface(
        modifier = Modifier.fillMaxWidth().padding(vertical = 8.dp),
        shape = MaterialTheme.shapes.medium,
        color = MaterialTheme.colorScheme.secondaryContainer,
    ) {
        Row(modifier = Modifier.padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
            Icon(Icons.Filled.AutoAwesome, contentDescription = null, tint = MaterialTheme.colorScheme.primary)
            Text(
                label,
                style = MaterialTheme.typography.bodyMedium,
                modifier = Modifier.padding(start = 8.dp),
            )
        }
    }
}

@Composable
private fun SectionLabel(text: String) {
    Text(
        text = text,
        style = MaterialTheme.typography.titleMedium,
        fontWeight = FontWeight.Bold,
        modifier = Modifier.padding(top = 16.dp, bottom = 8.dp),
    )
}

@Composable
private fun Stepper(label: String, onMinus: () -> Unit, onPlus: () -> Unit) {
    Row(
        modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(label, modifier = Modifier.weight(1f), style = MaterialTheme.typography.bodyLarge)
        IconButton(onClick = onMinus) { Icon(Icons.Filled.Remove, contentDescription = "Decrease") }
        IconButton(onClick = onPlus) { Icon(Icons.Filled.Add, contentDescription = "Increase") }
    }
}
