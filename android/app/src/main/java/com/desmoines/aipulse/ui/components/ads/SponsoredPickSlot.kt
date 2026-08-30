package com.desmoines.aipulse.ui.components.ads

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.OpenInNew
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.desmoines.aipulse.data.model.SponsoredPick
import com.desmoines.aipulse.ui.components.CachedAsyncImage

/**
 * Renders the labeled sponsored pick for an AI [surface] (ANDP-042), or nothing
 * when there's no inventory, the user is premium, or the fetch failed. Logs a
 * viewable impression and a click via AdTrackingService. Mirrors iOS
 * SponsoredPickCard.
 *
 * @param onOpenItem invoked with (itemType, itemId) on tap.
 */
@Composable
fun SponsoredPickSlot(
    surface: String,
    query: String?,
    onOpenItem: (String, String) -> Unit,
    modifier: Modifier = Modifier,
) {
    val viewModel: SponsoredPickViewModel = hiltViewModel(key = "sponsored-$surface")
    val pick by viewModel.pick.collectAsStateWithLifecycle()

    LaunchedEffect(surface, query) { viewModel.load(surface, query) }

    val sponsored = pick ?: return
    if (!sponsored.isRenderable) return

    SponsoredPickCard(
        pick = sponsored,
        modifier = modifier.trackAdViewability(key = sponsored.itemId) { viewModel.onImpression(surface) },
        onClick = {
            viewModel.onClick(surface)
            onOpenItem(sponsored.itemType, sponsored.itemId)
        },
    )
}

@Composable
private fun SponsoredPickCard(pick: SponsoredPick, onClick: () -> Unit, modifier: Modifier = Modifier) {
    Surface(
        modifier = modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 8.dp)
            .clickable(onClick = onClick),
        shape = RoundedCornerShape(16.dp),
        color = MaterialTheme.colorScheme.surfaceVariant,
    ) {
        Column(modifier = Modifier.padding(12.dp)) {
            Text(
                "Sponsored",
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                fontWeight = FontWeight.Medium,
            )
            Spacer(Modifier.size(6.dp))
            Row(verticalAlignment = Alignment.CenterVertically) {
                Box(
                    modifier = Modifier
                        .size(56.dp)
                        .clip(RoundedCornerShape(10.dp))
                        .background(MaterialTheme.colorScheme.surface),
                ) {
                    CachedAsyncImage(url = pick.imageUrl, contentDescription = null, modifier = Modifier.size(56.dp))
                }
                Column(modifier = Modifier.weight(1f).padding(horizontal = 12.dp)) {
                    Text(
                        pick.title,
                        style = MaterialTheme.typography.titleSmall,
                        fontWeight = FontWeight.Bold,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                    if (pick.reason.isNotBlank()) {
                        Text(
                            pick.reason,
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            maxLines = 2,
                            overflow = TextOverflow.Ellipsis,
                        )
                    }
                }
                Icon(
                    Icons.AutoMirrored.Filled.OpenInNew,
                    contentDescription = null,
                    tint = MaterialTheme.colorScheme.primary,
                    modifier = Modifier.size(18.dp),
                )
            }
        }
    }
}
