package com.desmoines.aipulse.ui.screens.home

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.ConfirmationNumber
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.Map
import androidx.compose.material.icons.filled.Star
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Slider
import androidx.compose.material3.SliderDefaults
import androidx.compose.material3.Surface
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableDoubleStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import com.desmoines.aipulse.data.model.DateFilterPreset
import com.desmoines.aipulse.data.model.EventCategory
import com.desmoines.aipulse.data.model.SubscriptionTier
import com.desmoines.aipulse.ui.components.PremiumGate
import com.desmoines.aipulse.ui.components.icon
import com.desmoines.aipulse.ui.theme.BrandOrange
import com.desmoines.aipulse.ui.theme.DesMoinesInsiderTheme
import com.desmoines.aipulse.ui.theme.Dimens
import kotlin.math.roundToInt

/**
 * Event filter bottom sheet matching iOS FilterSheet.swift.
 * Contains basic filters (all users) and advanced filters (Insider+ gated).
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun FilterSheet(
    selectedCategory: EventCategory?,
    selectedDatePreset: DateFilterPreset?,
    showFeaturedOnly: Boolean,
    showFreeOnly: Boolean,
    maxDistance: Double?,
    minRating: Double?,
    currentTier: SubscriptionTier,
    onCategorySelected: (EventCategory?) -> Unit,
    onDatePresetSelected: (DateFilterPreset?) -> Unit,
    onFeaturedOnlyChanged: (Boolean) -> Unit,
    onFreeOnlyChanged: (Boolean) -> Unit,
    onMaxDistanceChanged: (Double?) -> Unit,
    onMinRatingChanged: (Double?) -> Unit,
    onClearFilters: () -> Unit,
    onUpgradeClick: () -> Unit,
    onDismiss: () -> Unit,
) {
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)

    // Local state for sliders to avoid constant ViewModel updates during drag
    var localMaxDistance by remember(maxDistance) {
        mutableDoubleStateOf(maxDistance ?: 30.0)
    }
    var localMaxDistanceEnabled by remember(maxDistance) {
        mutableStateOf(maxDistance != null)
    }
    var localMinRating by remember(minRating) {
        mutableDoubleStateOf(minRating ?: 3.0)
    }
    var localMinRatingEnabled by remember(minRating) {
        mutableStateOf(minRating != null)
    }

    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = sheetState,
    ) {
        Column(
            modifier = Modifier
                .verticalScroll(rememberScrollState())
                .padding(horizontal = Dimens.SpacingLg)
                .padding(bottom = Dimens.SpacingXl)
        ) {
            // Header
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = "Filters",
                    style = MaterialTheme.typography.titleLarge,
                    fontWeight = FontWeight.Bold
                )
                Row {
                    TextButton(onClick = onClearFilters) {
                        Text("Clear")
                    }
                    IconButton(onClick = onDismiss) {
                        Icon(
                            imageVector = Icons.Filled.Close,
                            contentDescription = "Close filters"
                        )
                    }
                }
            }

            Spacer(modifier = Modifier.height(Dimens.SpacingLg))

            // --- Category Section ---
            SectionHeader(title = "Category")
            Spacer(modifier = Modifier.height(Dimens.SpacingSm))
            CategoryGrid(
                selected = selectedCategory,
                onSelect = { category ->
                    onCategorySelected(if (selectedCategory == category) null else category)
                }
            )

            Spacer(modifier = Modifier.height(Dimens.SpacingXl))

            // --- Date Section ---
            SectionHeader(title = "When")
            Spacer(modifier = Modifier.height(Dimens.SpacingSm))
            DatePresetGrid(
                selected = selectedDatePreset,
                onSelect = { preset ->
                    onDatePresetSelected(if (selectedDatePreset == preset) null else preset)
                }
            )

            Spacer(modifier = Modifier.height(Dimens.SpacingXl))

            // --- Options Section ---
            SectionHeader(title = "Options")
            Spacer(modifier = Modifier.height(Dimens.SpacingSm))
            ToggleRow(
                label = "Featured Events Only",
                checked = showFeaturedOnly,
                onCheckedChange = onFeaturedOnlyChanged
            )

            Spacer(modifier = Modifier.height(Dimens.SpacingXl))
            HorizontalDivider()
            Spacer(modifier = Modifier.height(Dimens.SpacingXl))

            // --- Advanced Filters (Premium) ---
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(Dimens.SpacingSm),
                modifier = Modifier.semantics { heading() }
            ) {
                Text(
                    text = "Advanced Filters",
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.SemiBold,
                )
                if (currentTier == SubscriptionTier.FREE) {
                    Surface(
                        shape = RoundedCornerShape(6.dp),
                        color = MaterialTheme.colorScheme.primaryContainer,
                    ) {
                        Row(
                            modifier = Modifier.padding(horizontal = 8.dp, vertical = 2.dp),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(4.dp),
                        ) {
                            Icon(
                                imageVector = Icons.Filled.Lock,
                                contentDescription = null,
                                modifier = Modifier.size(12.dp),
                                tint = MaterialTheme.colorScheme.onPrimaryContainer,
                            )
                            Text(
                                text = "Insider",
                                style = MaterialTheme.typography.labelSmall,
                                fontWeight = FontWeight.SemiBold,
                                color = MaterialTheme.colorScheme.onPrimaryContainer,
                            )
                        }
                    }
                }
            }
            Spacer(modifier = Modifier.height(Dimens.SpacingSm))

            PremiumGate(
                requiredTier = SubscriptionTier.INSIDER,
                feature = "Distance radius, free events filter, and minimum rating",
                currentTier = currentTier,
                onUpgradeClick = onUpgradeClick,
            ) {
                Column {
                    // Free Events Only
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.SpaceBetween
                    ) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Icon(
                                imageVector = Icons.Filled.ConfirmationNumber,
                                contentDescription = null,
                                tint = MaterialTheme.colorScheme.primary,
                                modifier = Modifier.size(20.dp)
                            )
                            Spacer(modifier = Modifier.width(Dimens.SpacingSm))
                            Text(
                                text = "Free Events Only",
                                style = MaterialTheme.typography.bodyLarge
                            )
                        }
                        Switch(
                            checked = showFreeOnly,
                            onCheckedChange = onFreeOnlyChanged
                        )
                    }

                    Spacer(modifier = Modifier.height(Dimens.SpacingLg))

                    // Max Distance slider
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.SpaceBetween
                    ) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Icon(
                                imageVector = Icons.Filled.Map,
                                contentDescription = null,
                                tint = MaterialTheme.colorScheme.primary,
                                modifier = Modifier.size(20.dp)
                            )
                            Spacer(modifier = Modifier.width(Dimens.SpacingSm))
                            Text(
                                text = "Max Distance",
                                style = MaterialTheme.typography.bodyLarge
                            )
                        }
                        if (localMaxDistanceEnabled) {
                            TextButton(onClick = {
                                localMaxDistanceEnabled = false
                                onMaxDistanceChanged(null)
                            }) {
                                Text("Clear", style = MaterialTheme.typography.labelMedium)
                            }
                        }
                    }

                    if (!localMaxDistanceEnabled) {
                        TextButton(onClick = {
                            localMaxDistanceEnabled = true
                            localMaxDistance = 30.0
                            onMaxDistanceChanged(30.0)
                        }) {
                            Text("Set distance limit")
                        }
                    } else {
                        Text(
                            text = "${localMaxDistance.roundToInt()} miles",
                            style = MaterialTheme.typography.titleMedium,
                            fontWeight = FontWeight.SemiBold,
                            color = MaterialTheme.colorScheme.primary,
                            modifier = Modifier
                                .fillMaxWidth()
                                .semantics {
                                    contentDescription = "${localMaxDistance.roundToInt()} miles maximum distance"
                                }
                        )
                        Slider(
                            value = localMaxDistance.toFloat(),
                            onValueChange = { localMaxDistance = it.toDouble() },
                            onValueChangeFinished = { onMaxDistanceChanged(localMaxDistance) },
                            valueRange = 1f..50f,
                            steps = 48,
                            colors = SliderDefaults.colors(
                                thumbColor = MaterialTheme.colorScheme.primary,
                                activeTrackColor = MaterialTheme.colorScheme.primary
                            )
                        )
                    }

                    Spacer(modifier = Modifier.height(Dimens.SpacingLg))

                    // Min Rating slider
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.SpaceBetween
                    ) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Icon(
                                imageVector = Icons.Filled.Star,
                                contentDescription = null,
                                tint = BrandOrange,
                                modifier = Modifier.size(20.dp)
                            )
                            Spacer(modifier = Modifier.width(Dimens.SpacingSm))
                            Text(
                                text = "Min Rating",
                                style = MaterialTheme.typography.bodyLarge
                            )
                        }
                        if (localMinRatingEnabled) {
                            TextButton(onClick = {
                                localMinRatingEnabled = false
                                onMinRatingChanged(null)
                            }) {
                                Text("Clear", style = MaterialTheme.typography.labelMedium)
                            }
                        }
                    }

                    if (!localMinRatingEnabled) {
                        TextButton(onClick = {
                            localMinRatingEnabled = true
                            localMinRating = 3.0
                            onMinRatingChanged(3.0)
                        }) {
                            Text("Set minimum rating")
                        }
                    } else {
                        Text(
                            text = "${String.format("%.1f", localMinRating)} stars",
                            style = MaterialTheme.typography.titleMedium,
                            fontWeight = FontWeight.SemiBold,
                            color = BrandOrange,
                            modifier = Modifier
                                .fillMaxWidth()
                                .semantics {
                                    contentDescription = "${String.format("%.1f", localMinRating)} stars minimum rating"
                                }
                        )
                        Slider(
                            value = localMinRating.toFloat(),
                            onValueChange = { value ->
                                // Snap to half-star increments
                                localMinRating = (value * 2).roundToInt() / 2.0
                            },
                            onValueChangeFinished = { onMinRatingChanged(localMinRating) },
                            valueRange = 1f..5f,
                            steps = 7, // 1.0, 1.5, 2.0, 2.5, 3.0, 3.5, 4.0, 4.5, 5.0 → 7 intermediate steps
                            colors = SliderDefaults.colors(
                                thumbColor = BrandOrange,
                                activeTrackColor = BrandOrange
                            )
                        )
                    }
                }
            }

            Spacer(modifier = Modifier.height(Dimens.SpacingXl))

            // Done button
            Button(
                onClick = onDismiss,
                modifier = Modifier
                    .fillMaxWidth()
                    .height(Dimens.ButtonHeight),
                shape = RoundedCornerShape(Dimens.CardCornerRadius)
            ) {
                Text(
                    text = "Done",
                    style = MaterialTheme.typography.labelLarge,
                    fontWeight = FontWeight.SemiBold
                )
            }
        }
    }
}

// region Sub-composables

@Composable
private fun SectionHeader(title: String) {
    Text(
        text = title,
        style = MaterialTheme.typography.titleMedium,
        fontWeight = FontWeight.SemiBold,
        modifier = Modifier.semantics { heading() }
    )
}

@Composable
private fun CategoryGrid(
    selected: EventCategory?,
    onSelect: (EventCategory) -> Unit,
) {
    LazyVerticalGrid(
        columns = GridCells.Fixed(2),
        horizontalArrangement = Arrangement.spacedBy(Dimens.SpacingSm),
        verticalArrangement = Arrangement.spacedBy(Dimens.SpacingSm),
        modifier = Modifier.height(288.dp), // ~6 rows × 48dp
        userScrollEnabled = false
    ) {
        items(EventCategory.entries.toList()) { category ->
            val isSelected = selected == category
            Surface(
                onClick = { onSelect(category) },
                shape = RoundedCornerShape(10.dp),
                color = if (isSelected) category.color.copy(alpha = 0.15f)
                else MaterialTheme.colorScheme.surfaceVariant,
                border = if (isSelected) androidx.compose.foundation.BorderStroke(
                    2.dp, category.color
                ) else null,
                modifier = Modifier
                    .fillMaxWidth()
                    .semantics {
                        contentDescription = "${category.displayName}${if (isSelected) ", selected" else ""}"
                    }
            ) {
                Row(
                    modifier = Modifier.padding(
                        horizontal = Dimens.SpacingMd,
                        vertical = Dimens.SpacingSm
                    ),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Icon(
                        imageVector = category.icon,
                        contentDescription = null,
                        tint = category.color,
                        modifier = Modifier.size(Dimens.IconSizeSmall)
                    )
                    Spacer(modifier = Modifier.width(Dimens.SpacingSm))
                    Text(
                        text = category.displayName,
                        style = MaterialTheme.typography.bodyMedium,
                        modifier = Modifier.weight(1f)
                    )
                    if (isSelected) {
                        Icon(
                            imageVector = Icons.Filled.Check,
                            contentDescription = null,
                            tint = category.color,
                            modifier = Modifier.size(Dimens.IconSizeSmall)
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun DatePresetGrid(
    selected: DateFilterPreset?,
    onSelect: (DateFilterPreset) -> Unit,
) {
    LazyVerticalGrid(
        columns = GridCells.Fixed(2),
        horizontalArrangement = Arrangement.spacedBy(Dimens.SpacingSm),
        verticalArrangement = Arrangement.spacedBy(Dimens.SpacingSm),
        modifier = Modifier.height(144.dp), // 3 rows × 48dp
        userScrollEnabled = false
    ) {
        items(DateFilterPreset.entries.toList()) { preset ->
            val isSelected = selected == preset
            Surface(
                onClick = { onSelect(preset) },
                shape = RoundedCornerShape(10.dp),
                color = if (isSelected) MaterialTheme.colorScheme.primary.copy(alpha = 0.12f)
                else MaterialTheme.colorScheme.surfaceVariant,
                border = if (isSelected) androidx.compose.foundation.BorderStroke(
                    2.dp, MaterialTheme.colorScheme.primary
                ) else null,
                modifier = Modifier
                    .fillMaxWidth()
                    .semantics {
                        contentDescription = "${preset.displayName}${if (isSelected) ", selected" else ""}"
                    }
            ) {
                Row(
                    modifier = Modifier.padding(
                        horizontal = Dimens.SpacingMd,
                        vertical = Dimens.SpacingSm
                    ),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.Center
                ) {
                    Text(
                        text = preset.displayName,
                        style = MaterialTheme.typography.bodyMedium,
                        color = if (isSelected) MaterialTheme.colorScheme.primary
                        else MaterialTheme.colorScheme.onSurfaceVariant
                    )
                    if (isSelected) {
                        Spacer(modifier = Modifier.width(Dimens.SpacingXs))
                        Icon(
                            imageVector = Icons.Filled.Check,
                            contentDescription = null,
                            tint = MaterialTheme.colorScheme.primary,
                            modifier = Modifier.size(Dimens.IconSizeSmall)
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun ToggleRow(
    label: String,
    checked: Boolean,
    onCheckedChange: (Boolean) -> Unit,
) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.SpaceBetween
    ) {
        Text(
            text = label,
            style = MaterialTheme.typography.bodyLarge
        )
        Switch(
            checked = checked,
            onCheckedChange = onCheckedChange
        )
    }
}

// endregion

// region Previews

@Preview(showBackground = true)
@Composable
private fun FilterSheetPreview() {
    DesMoinesInsiderTheme {
        // Preview just the content (not the bottom sheet itself)
        Column(modifier = Modifier.padding(16.dp)) {
            Text("FilterSheet preview — content shown inline for design verification")
        }
    }
}

// endregion
