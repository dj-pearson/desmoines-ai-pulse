package com.desmoines.aipulse.ui.screens.home

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AutoAwesome
import androidx.compose.material.icons.filled.Casino
import androidx.compose.material.icons.filled.GridView
import androidx.compose.material.icons.filled.Style
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import com.desmoines.aipulse.ui.theme.DesMoinesInsiderTheme
import com.desmoines.aipulse.ui.theme.Dimens
import com.desmoines.aipulse.util.rememberHapticPerformer

/**
 * One compact row of discovery entry points (AND-OVH-025), in place of the
 * full-width cards that used to push every event below the fold. Mirrors iOS
 * WaysToExploreRow (HomeSections.swift). Explore opens the hub that now holds
 * the less-used destinations: weekend, neighborhoods, guides, deals and so on.
 *
 * It is also the only Ask Pulse entry on Home, now that the global floating
 * button is gone.
 */
@Composable
fun WaysToExploreRow(
    onAskPulse: () -> Unit,
    onSwipe: () -> Unit,
    onSurprise: () -> Unit,
    onExplore: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Column(modifier = modifier.fillMaxWidth().padding(top = 8.dp, bottom = 4.dp)) {
        Text(
            text = "Ways to explore",
            style = MaterialTheme.typography.labelLarge,
            fontWeight = FontWeight.SemiBold,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier
                .padding(horizontal = Dimens.SpacingLg)
                .semantics { heading() },
        )
        Row(
            horizontalArrangement = Arrangement.spacedBy(10.dp),
            modifier = Modifier
                .horizontalScroll(rememberScrollState())
                .padding(horizontal = Dimens.SpacingLg, vertical = 8.dp),
        ) {
            ExploreTile(
                title = "Ask Pulse",
                icon = Icons.Filled.AutoAwesome,
                hint = "Describe what you're looking for and get curated picks",
                onClick = onAskPulse,
            )
            ExploreTile(
                title = "Swipe",
                icon = Icons.Filled.Style,
                hint = "Swipe through hand-picked events and dining",
                onClick = onSwipe,
            )
            ExploreTile(
                title = "Surprise Me",
                icon = Icons.Filled.Casino,
                hint = "One committed recommendation, no browsing",
                onClick = onSurprise,
            )
            ExploreTile(
                title = "Explore",
                icon = Icons.Filled.GridView,
                hint = "Weekend, neighborhoods, guides, deals, hotels and more",
                onClick = onExplore,
            )
        }
    }
}

@Composable
private fun ExploreTile(
    title: String,
    icon: ImageVector,
    hint: String,
    onClick: () -> Unit,
) {
    val haptic = rememberHapticPerformer()
    Column(
        horizontalAlignment = Alignment.CenterHorizontally,
        modifier = Modifier
            .width(76.dp)
            .clip(RoundedCornerShape(12.dp))
            .clickable(role = Role.Button, onClickLabel = hint) {
                haptic.light()
                onClick()
            }
            .padding(vertical = 4.dp),
    ) {
        Box(
            modifier = Modifier
                .size(56.dp)
                .clip(RoundedCornerShape(14.dp))
                .background(MaterialTheme.colorScheme.primaryContainer),
            contentAlignment = Alignment.Center,
        ) {
            Icon(
                imageVector = icon,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.onPrimaryContainer,
            )
        }
        Text(
            text = title,
            style = MaterialTheme.typography.labelMedium,
            fontWeight = FontWeight.Medium,
            color = MaterialTheme.colorScheme.onSurface,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.padding(top = 8.dp),
        )
    }
}

@Preview(showBackground = true)
@Composable
private fun WaysToExploreRowPreview() {
    DesMoinesInsiderTheme {
        WaysToExploreRow(onAskPulse = {}, onSwipe = {}, onSurprise = {}, onExplore = {})
    }
}
