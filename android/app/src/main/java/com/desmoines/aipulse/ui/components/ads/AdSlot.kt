package com.desmoines.aipulse.ui.components.ads

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.desmoines.aipulse.data.model.CampaignAd
import com.desmoines.aipulse.ui.components.CachedAsyncImage
import com.desmoines.aipulse.util.SafeLinkLauncher

/**
 * Renders the live first-party campaign ad for [placement] (ANDP-040), or
 * nothing when there's no campaign, the user is premium, or the fetch failed.
 * Usable in both feed and detail surfaces. Tapping opens the creative's
 * link_url.
 *
 * The safe external-link launcher + ad-link allowlist land in ANDP-063 (#249)
 * / ANDP-065 (#265); until then this opens a plain ACTION_VIEW, consistent
 * with the app's other outbound links.
 */
@Composable
fun AdSlot(placement: String, modifier: Modifier = Modifier) {
    val viewModel: AdSlotViewModel = hiltViewModel(key = "ad-$placement")
    val ad by viewModel.ad.collectAsStateWithLifecycle()
    val context = LocalContext.current

    LaunchedEffect(placement) { viewModel.load(placement) }

    val creative = ad ?: return
    if (!creative.isRenderable) return

    AdCard(
        ad = creative,
        modifier = modifier.trackAdViewability(key = creative.creativeId) { viewModel.onImpression(placement) },
        onClick = {
            viewModel.onClick()
            SafeLinkLauncher.openUrl(context, creative.linkUrl)
        },
    )
}

@Composable
private fun AdCard(ad: CampaignAd, onClick: () -> Unit, modifier: Modifier = Modifier) {
    Surface(
        modifier = modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 8.dp)
            .clickable(onClick = onClick),
        shape = RoundedCornerShape(16.dp),
        color = MaterialTheme.colorScheme.surfaceVariant,
    ) {
        Column {
            if (!ad.imageUrl.isNullOrBlank()) {
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(140.dp)
                        .clip(RoundedCornerShape(topStart = 16.dp, topEnd = 16.dp))
                        .background(MaterialTheme.colorScheme.surface),
                ) {
                    CachedAsyncImage(url = ad.imageUrl, contentDescription = null, modifier = Modifier.fillMaxWidth().height(140.dp))
                }
            }
            Column(modifier = Modifier.padding(14.dp)) {
                Text(
                    "Sponsored",
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    fontWeight = FontWeight.Medium,
                )
                ad.displayTitle?.let { title ->
                    Spacer(Modifier.height(2.dp))
                    Text(
                        title,
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.Bold,
                        maxLines = 2,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
                ad.description?.trim()?.takeIf { it.isNotEmpty() }?.let { desc ->
                    Spacer(Modifier.height(2.dp))
                    Text(
                        desc,
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        maxLines = 2,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
                Spacer(Modifier.height(8.dp))
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(
                        ad.displayCta,
                        style = MaterialTheme.typography.labelLarge,
                        fontWeight = FontWeight.SemiBold,
                        color = MaterialTheme.colorScheme.primary,
                    )
                }
            }
        }
    }
}
