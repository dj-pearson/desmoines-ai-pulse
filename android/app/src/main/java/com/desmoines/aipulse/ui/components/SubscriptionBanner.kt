package com.desmoines.aipulse.ui.components

import androidx.compose.animation.animateContentSize
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowRight
import androidx.compose.material.icons.filled.AutoAwesome
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.Star
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import com.desmoines.aipulse.data.model.SubscriptionTier
import com.desmoines.aipulse.ui.theme.BrandOrange
import com.desmoines.aipulse.ui.theme.DesMoinesInsiderTheme
import com.desmoines.aipulse.ui.theme.StatusError

/**
 * Banner style variants.
 */
enum class BannerStyle { FULL, COMPACT }

/**
 * Subscription status card showing current plan and upgrade CTA for free users.
 * Mirrors iOS SubscriptionBanner.swift.
 *
 * @param currentTier The user's current subscription tier
 * @param style FULL for profile page, COMPACT for favorites/home
 * @param onUpgradeClick Callback when upgrade button is tapped
 */
@Composable
fun SubscriptionBanner(
    currentTier: SubscriptionTier,
    onUpgradeClick: () -> Unit,
    modifier: Modifier = Modifier,
    style: BannerStyle = BannerStyle.FULL
) {
    when (style) {
        BannerStyle.FULL -> FullBanner(currentTier, onUpgradeClick, modifier)
        BannerStyle.COMPACT -> CompactBanner(currentTier, onUpgradeClick, modifier)
    }
}

@Composable
private fun FullBanner(
    currentTier: SubscriptionTier,
    onUpgradeClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    if (currentTier == SubscriptionTier.FREE) {
        FreeUserCard(onUpgradeClick, modifier)
    } else {
        SubscribedCard(currentTier, onUpgradeClick, modifier)
    }
}

@Composable
private fun FreeUserCard(
    onUpgradeClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    Surface(
        modifier = modifier
            .semantics { contentDescription = "Free Plan. Upgrade to premium for more features." },
        shape = RoundedCornerShape(16.dp),
        color = MaterialTheme.colorScheme.surfaceVariant
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Box(
                    modifier = Modifier
                        .size(44.dp)
                        .clip(CircleShape)
                        .background(
                            Brush.verticalGradient(
                                listOf(BrandOrange, BrandOrange.copy(alpha = 0.7f))
                            )
                        ),
                    contentAlignment = Alignment.Center
                ) {
                    Icon(
                        imageVector = Icons.Filled.AutoAwesome,
                        contentDescription = null,
                        tint = Color.White
                    )
                }
                Spacer(modifier = Modifier.width(12.dp))
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = "Free Plan",
                        style = MaterialTheme.typography.titleSmall,
                        fontWeight = FontWeight.Bold
                    )
                    Text(
                        text = "Unlock unlimited favorites, AI Trip Planner, advanced filters & more",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        maxLines = 2
                    )
                }
            }

            Spacer(modifier = Modifier.height(14.dp))

            Button(
                onClick = onUpgradeClick,
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(10.dp)
            ) {
                Text(
                    text = "Upgrade to Premium",
                    fontWeight = FontWeight.SemiBold
                )
            }
        }
    }
}

@Composable
private fun SubscribedCard(
    currentTier: SubscriptionTier,
    onUpgradeClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    val tierColor = when (currentTier) {
        SubscriptionTier.FREE -> MaterialTheme.colorScheme.onSurfaceVariant
        SubscriptionTier.INSIDER -> BrandOrange
        SubscriptionTier.VIP -> Color(0xFF9C27B0)
    }
    val tierIcon: ImageVector = when (currentTier) {
        SubscriptionTier.FREE -> Icons.Filled.Person
        SubscriptionTier.INSIDER -> Icons.Filled.Star
        SubscriptionTier.VIP -> Icons.Filled.Star // Crown not available in Material Icons
    }

    Surface(
        modifier = modifier
            .clickable(onClick = onUpgradeClick)
            .semantics {
                contentDescription = "${currentTier.displayName} plan. Tap to manage subscription."
            },
        shape = RoundedCornerShape(16.dp),
        color = tierColor.copy(alpha = 0.08f)
    ) {
        Row(
            modifier = Modifier.padding(16.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Box(
                modifier = Modifier
                    .size(44.dp)
                    .clip(CircleShape)
                    .background(
                        Brush.verticalGradient(
                            listOf(tierColor, tierColor.copy(alpha = 0.7f))
                        )
                    ),
                contentAlignment = Alignment.Center
            ) {
                Icon(
                    imageVector = tierIcon,
                    contentDescription = null,
                    tint = Color.White
                )
            }
            Spacer(modifier = Modifier.width(12.dp))
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = "${currentTier.displayName} Plan",
                    style = MaterialTheme.typography.titleSmall,
                    fontWeight = FontWeight.Bold
                )
                Text(
                    text = "Manage your subscription",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
            Icon(
                imageVector = Icons.AutoMirrored.Filled.KeyboardArrowRight,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.5f)
            )
        }
    }
}

@Composable
private fun CompactBanner(
    currentTier: SubscriptionTier,
    onUpgradeClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    // Only show compact banner for free users
    if (currentTier != SubscriptionTier.FREE) return

    Surface(
        modifier = modifier
            .clickable(onClick = onUpgradeClick)
            .semantics {
                contentDescription = "Upgrade to premium for unlimited favorites and more features"
            },
        shape = RoundedCornerShape(12.dp),
        color = BrandOrange.copy(alpha = 0.08f)
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 14.dp, vertical = 10.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Icon(
                imageVector = Icons.Filled.AutoAwesome,
                contentDescription = null,
                tint = BrandOrange,
                modifier = Modifier.size(18.dp)
            )
            Spacer(modifier = Modifier.width(10.dp))
            Text(
                text = "Upgrade for unlimited favorites, Trip Planner & more",
                style = MaterialTheme.typography.labelSmall,
                fontWeight = FontWeight.Medium,
                modifier = Modifier.weight(1f)
            )
            Spacer(modifier = Modifier.width(8.dp))
            Surface(
                shape = CircleShape,
                color = MaterialTheme.colorScheme.primary
            ) {
                Text(
                    text = "Upgrade",
                    style = MaterialTheme.typography.labelSmall,
                    fontWeight = FontWeight.Bold,
                    color = MaterialTheme.colorScheme.onPrimary,
                    modifier = Modifier.padding(horizontal = 12.dp, vertical = 6.dp)
                )
            }
        }
    }
}

/**
 * Shows the current favorites usage against the free tier limit with progress bar.
 * Mirrors iOS FavoritesLimitBanner.
 *
 * @param currentCount Current number of saved favorites
 * @param currentTier The user's subscription tier
 * @param onUpgradeClick Callback when "Go Unlimited" is tapped
 */
@Composable
fun FavoritesLimitBanner(
    currentCount: Int,
    currentTier: SubscriptionTier,
    onUpgradeClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    // Only show for free users with saved items
    if (currentTier != SubscriptionTier.FREE || currentCount <= 0) return

    val maxFavorites = SubscriptionTier.FREE.maxFavorites
    val isAtLimit = currentCount >= maxFavorites
    val isNearLimit = currentCount >= maxFavorites - 1 // maxFavorites is 3, so near at 2
    val progress = (currentCount.toFloat() / maxFavorites).coerceAtMost(1f)

    val statusColor = when {
        isAtLimit -> StatusError
        isNearLimit -> BrandOrange
        else -> MaterialTheme.colorScheme.primary
    }

    val backgroundColor = when {
        isAtLimit -> StatusError.copy(alpha = 0.06f)
        isNearLimit -> BrandOrange.copy(alpha = 0.06f)
        else -> MaterialTheme.colorScheme.surfaceVariant
    }

    Surface(
        modifier = modifier.animateContentSize(),
        shape = RoundedCornerShape(12.dp),
        color = backgroundColor
    ) {
        Column(
            modifier = Modifier.padding(horizontal = 16.dp, vertical = 12.dp)
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    text = "$currentCount/$maxFavorites saves used",
                    style = MaterialTheme.typography.labelSmall,
                    fontWeight = FontWeight.Medium,
                    color = statusColor
                )
                Spacer(modifier = Modifier.weight(1f))
                if (isNearLimit) {
                    Surface(
                        onClick = onUpgradeClick,
                        shape = CircleShape,
                        color = MaterialTheme.colorScheme.primary
                    ) {
                        Text(
                            text = "Go Unlimited",
                            style = MaterialTheme.typography.labelSmall,
                            fontWeight = FontWeight.Bold,
                            color = MaterialTheme.colorScheme.onPrimary,
                            modifier = Modifier.padding(horizontal = 12.dp, vertical = 5.dp)
                        )
                    }
                }
            }

            Spacer(modifier = Modifier.height(10.dp))

            // Progress bar
            LinearProgressIndicator(
                progress = { progress },
                modifier = Modifier
                    .fillMaxWidth()
                    .height(6.dp)
                    .clip(CircleShape),
                color = statusColor,
                trackColor = MaterialTheme.colorScheme.surfaceVariant
            )

            if (isAtLimit) {
                Spacer(modifier = Modifier.height(8.dp))
                Text(
                    text = "You've reached the free plan limit. Upgrade to save unlimited favorites.",
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
        }
    }
}

@Preview(showBackground = true)
@Composable
private fun SubscriptionBannerFreeFullPreview() {
    DesMoinesInsiderTheme {
        SubscriptionBanner(
            currentTier = SubscriptionTier.FREE,
            style = BannerStyle.FULL,
            onUpgradeClick = {},
            modifier = Modifier.padding(16.dp)
        )
    }
}

@Preview(showBackground = true)
@Composable
private fun SubscriptionBannerInsiderPreview() {
    DesMoinesInsiderTheme {
        SubscriptionBanner(
            currentTier = SubscriptionTier.INSIDER,
            style = BannerStyle.FULL,
            onUpgradeClick = {},
            modifier = Modifier.padding(16.dp)
        )
    }
}

@Preview(showBackground = true)
@Composable
private fun SubscriptionBannerCompactPreview() {
    DesMoinesInsiderTheme {
        SubscriptionBanner(
            currentTier = SubscriptionTier.FREE,
            style = BannerStyle.COMPACT,
            onUpgradeClick = {},
            modifier = Modifier.padding(16.dp)
        )
    }
}

@Preview(showBackground = true)
@Composable
private fun FavoritesLimitBannerPreview() {
    DesMoinesInsiderTheme {
        Column(
            modifier = Modifier.padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            FavoritesLimitBanner(currentCount = 1, currentTier = SubscriptionTier.FREE, onUpgradeClick = {})
            FavoritesLimitBanner(currentCount = 2, currentTier = SubscriptionTier.FREE, onUpgradeClick = {})
            FavoritesLimitBanner(currentCount = 3, currentTier = SubscriptionTier.FREE, onUpgradeClick = {})
        }
    }
}
