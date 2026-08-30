package com.desmoines.aipulse.ui.components.ads

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material3.Button
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import com.desmoines.aipulse.data.model.CampaignAd
import com.desmoines.aipulse.ui.components.CachedAsyncImage
import com.desmoines.aipulse.util.SafeLinkLauncher
import com.desmoines.aipulse.util.minHitTarget

/**
 * Full-screen interstitial ad (ANDP-044). Shown only at safe boundaries by the
 * host; always dismissible. Records an impression on appearance and a click when
 * the CTA opens the creative's link.
 */
@Composable
fun InterstitialAdView(
    ad: CampaignAd,
    onImpression: () -> Unit,
    onClick: () -> Unit,
    onDismiss: () -> Unit,
) {
    val context = LocalContext.current

    LaunchedEffect(ad.creativeId) { onImpression() }

    Dialog(
        onDismissRequest = onDismiss,
        properties = DialogProperties(usePlatformDefaultWidth = false),
    ) {
        Surface(
            modifier = Modifier.fillMaxWidth().padding(20.dp),
            shape = RoundedCornerShape(20.dp),
            color = MaterialTheme.colorScheme.surface,
        ) {
            Box {
                Column(modifier = Modifier.padding(20.dp)) {
                    ad.imageUrl?.let { image ->
                        CachedAsyncImage(
                            url = image,
                            contentDescription = ad.displayTitle,
                            modifier = Modifier
                                .fillMaxWidth()
                                .height(200.dp),
                        )
                    }

                    ad.displayTitle?.let { title ->
                        Text(
                            text = title,
                            style = MaterialTheme.typography.titleLarge,
                            fontWeight = FontWeight.Bold,
                            modifier = Modifier.padding(top = 16.dp),
                        )
                    }

                    ad.description?.takeIf { it.isNotBlank() }?.let { body ->
                        Text(
                            text = body,
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier.padding(top = 8.dp),
                        )
                    }

                    if (!ad.linkUrl.isNullOrBlank()) {
                        Button(
                            onClick = {
                                onClick()
                                SafeLinkLauncher.openUrl(context, ad.linkUrl)
                                onDismiss()
                            },
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(top = 20.dp),
                            shape = RoundedCornerShape(12.dp),
                        ) {
                            Text(ad.displayCta, fontWeight = FontWeight.SemiBold)
                        }
                    }
                }

                // Always-available dismiss.
                IconButton(
                    onClick = onDismiss,
                    modifier = Modifier
                        .align(Alignment.TopEnd)
                        .padding(4.dp)
                        .minHitTarget(),
                ) {
                    Icon(
                        imageVector = Icons.Filled.Close,
                        contentDescription = "Close ad",
                        tint = MaterialTheme.colorScheme.onSurface,
                    )
                }
            }
        }
    }
}
