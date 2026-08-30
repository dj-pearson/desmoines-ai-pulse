package com.desmoines.aipulse.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil3.compose.SubcomposeAsyncImage
import com.desmoines.aipulse.data.model.SubscriptionTier
import com.desmoines.aipulse.data.remote.AffiliateAdService

/**
 * Displays an affiliate ad creative from the current session partner.
 * Includes FTC-compliant "Ad" label in the top-left corner.
 * Only shown to free-tier users; hidden for Insider/VIP.
 * Mirrors iOS affiliate ad display behavior.
 *
 * @param affiliateAdService The service providing current partner and image URLs
 * @param placement The ad placement size (banner or compact)
 * @param currentTier The user's current subscription tier
 */
@Composable
fun AffiliateAdBanner(
    affiliateAdService: AffiliateAdService,
    placement: AffiliateAdService.Placement,
    currentTier: SubscriptionTier,
    modifier: Modifier = Modifier
) {
    // Only show for free users
    if (currentTier != SubscriptionTier.FREE) return

    val partner = affiliateAdService.currentPartner ?: return
    val imageUrl = affiliateAdService.imageUrl(placement) ?: return
    val context = LocalContext.current

    val aspectRatio = when (placement) {
        AffiliateAdService.Placement.BANNER -> 1.2f    // 300x250 ≈ 1.2:1
        AffiliateAdService.Placement.COMPACT -> 728f / 90f // 728x90 ≈ 8.09:1
    }

    Box(
        modifier = modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(14.dp))
            .clickable {
                // Validate against the affiliate allowlist + crash-safe launch (ANDP-065).
                affiliateAdService.safeOpen(context, partner.affiliateUrl)
            }
            .semantics {
                contentDescription = "Advertisement from ${partner.name}. Tap to learn more."
                role = Role.Button
            }
    ) {
        SubcomposeAsyncImage(
            model = imageUrl,
            contentDescription = "${partner.name} advertisement",
            contentScale = ContentScale.FillWidth,
            modifier = Modifier
                .fillMaxWidth()
                .aspectRatio(aspectRatio)
        )

        // FTC compliance: "Ad" label in top-left corner
        Text(
            text = "Ad",
            modifier = Modifier
                .align(Alignment.TopStart)
                .padding(6.dp)
                .background(
                    color = Color.Black.copy(alpha = 0.6f),
                    shape = RoundedCornerShape(4.dp)
                )
                .padding(horizontal = 6.dp, vertical = 2.dp),
            color = Color.White,
            fontSize = 10.sp,
            fontWeight = FontWeight.Bold,
            style = MaterialTheme.typography.labelSmall
        )
    }
}
