package com.desmoines.aipulse.ui.screens.subscription

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.AutoAwesome
import androidx.compose.material.icons.filled.Bolt
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.FavoriteBorder
import androidx.compose.material.icons.filled.Map
import androidx.compose.material.icons.filled.Notifications
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.RateReview
import androidx.compose.material.icons.filled.Restaurant
import androidx.compose.material.icons.filled.Star
import androidx.compose.material.icons.filled.Sms
import androidx.compose.material.icons.outlined.Tune
import androidx.compose.material.icons.filled.VisibilityOff
import androidx.compose.material.icons.filled.CardGiftcard
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.desmoines.aipulse.data.model.SubscriptionTier
import com.desmoines.aipulse.data.remote.BillingService.CrossPlatformOrigin
import com.desmoines.aipulse.data.remote.BillingService.CrossPlatformSubscription
import com.desmoines.aipulse.ui.components.BrandGhostButton
import com.desmoines.aipulse.ui.components.BrandPrimaryButton

/**
 * Subscription screen matching iOS SubscriptionView.swift.
 * Displays premium tiers with features, pricing, and purchase actions.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SubscriptionScreen(
    currentTier: SubscriptionTier,
    isLoading: Boolean,
    errorMessage: String?,
    insiderPrice: String,
    vipPrice: String,
    hasProducts: Boolean,
    selectedTier: SubscriptionTier?,
    onSelectTier: (SubscriptionTier) -> Unit,
    onPurchase: () -> Unit,
    onRestorePurchases: () -> Unit,
    onNavigateBack: () -> Unit,
    onNavigateToTerms: () -> Unit,
    onNavigateToPrivacy: () -> Unit,
    crossPlatformSubscriptions: List<CrossPlatformSubscription> = emptyList(),
) {
    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Premium") },
                navigationIcon = {
                    IconButton(onClick = onNavigateBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
                    }
                },
            )
        }
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 16.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Spacer(Modifier.height(16.dp))

            // Sparkles icon
            Icon(
                imageVector = Icons.Filled.AutoAwesome,
                contentDescription = null,
                modifier = Modifier.size(44.dp),
                tint = MaterialTheme.colorScheme.primary,
            )

            Spacer(Modifier.height(12.dp))

            Text(
                text = "Unlock Premium",
                style = MaterialTheme.typography.titleLarge,
                fontWeight = FontWeight.Bold,
            )

            Spacer(Modifier.height(8.dp))

            Text(
                text = "Get more out of Des Moines Insider with premium features.",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                textAlign = TextAlign.Center,
            )

            Spacer(Modifier.height(16.dp))

            // Current tier badge
            CurrentTierBadge(tier = currentTier)

            // Cross-platform subscription banner — surfaces other-platform
            // active subs (web/Stripe, iOS/StoreKit) so users know where to
            // manage / cancel them. Per Play policy we don't link to external
            // paid flows from inside the billing screen, so this is
            // informational copy only.
            if (crossPlatformSubscriptions.isNotEmpty()) {
                Spacer(Modifier.height(16.dp))
                CrossPlatformSubscriptionsBanner(crossPlatformSubscriptions)
            }

            Spacer(Modifier.height(24.dp))

            // Tier selection cards
            if (hasProducts) {
                TierSelectionCard(
                    tierName = "Insider",
                    price = insiderPrice,
                    isSelected = selectedTier == SubscriptionTier.INSIDER,
                    isCurrent = currentTier == SubscriptionTier.INSIDER,
                    color = InsiderColor,
                    onClick = { onSelectTier(SubscriptionTier.INSIDER) },
                )

                Spacer(Modifier.height(12.dp))

                TierSelectionCard(
                    tierName = "VIP",
                    price = vipPrice,
                    isSelected = selectedTier == SubscriptionTier.VIP,
                    isCurrent = currentTier == SubscriptionTier.VIP,
                    color = VipColor,
                    onClick = { onSelectTier(SubscriptionTier.VIP) },
                )

                Spacer(Modifier.height(20.dp))

                // Purchase button — migrated to BrandPrimaryButton
                BrandPrimaryButton(
                    onClick = onPurchase,
                    enabled = selectedTier != null && selectedTier != currentTier,
                    isLoading = isLoading,
                    text = if (isLoading) "Processing..." else "Subscribe",
                )
            } else if (isLoading) {
                CircularProgressIndicator(modifier = Modifier.padding(24.dp))
            }

            // Error message
            errorMessage?.let { msg ->
                Spacer(Modifier.height(8.dp))
                Text(
                    text = msg,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.error,
                    textAlign = TextAlign.Center,
                )
            }

            Spacer(Modifier.height(16.dp))

            // Restore purchases — migrated to BrandGhostButton
            BrandGhostButton(
                onClick = onRestorePurchases,
                enabled = !isLoading,
                text = "Restore Purchases",
            )

            Spacer(Modifier.height(24.dp))

            // Features list
            InsiderFeaturesList(price = insiderPrice)

            Spacer(Modifier.height(8.dp))

            HorizontalDivider(modifier = Modifier.padding(vertical = 8.dp))

            VipFeaturesList(price = vipPrice)

            Spacer(Modifier.height(24.dp))

            // Terms and Privacy links
            Row(
                horizontalArrangement = Arrangement.Center,
                modifier = Modifier.fillMaxWidth(),
            ) {
                TextButton(onClick = onNavigateToTerms) {
                    Text("Terms of Service", style = MaterialTheme.typography.bodySmall)
                }
                Text(
                    "  |  ",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.align(Alignment.CenterVertically),
                )
                TextButton(onClick = onNavigateToPrivacy) {
                    Text("Privacy Policy", style = MaterialTheme.typography.bodySmall)
                }
            }

            Spacer(Modifier.height(32.dp))
        }
    }
}

// region Sub-composables

private val InsiderColor = Color(0xFFFF9800) // Orange
private val VipColor = Color(0xFF9C27B0) // Purple

@Composable
private fun CurrentTierBadge(tier: SubscriptionTier) {
    val (icon, color) = when (tier) {
        SubscriptionTier.FREE -> Icons.Filled.Person to MaterialTheme.colorScheme.onSurfaceVariant
        SubscriptionTier.INSIDER -> Icons.Filled.Star to InsiderColor
        SubscriptionTier.VIP -> Icons.Filled.AutoAwesome to VipColor
    }

    Row(
        verticalAlignment = Alignment.CenterVertically,
        modifier = Modifier
            .background(
                color = color.copy(alpha = 0.1f),
                shape = RoundedCornerShape(50),
            )
            .padding(horizontal = 16.dp, vertical = 10.dp)
            .semantics { contentDescription = "Your current plan is ${tier.displayName}" },
    ) {
        Icon(
            imageVector = icon,
            contentDescription = null,
            tint = color,
            modifier = Modifier.size(18.dp),
        )
        Spacer(Modifier.width(8.dp))
        Text(
            text = "Current Plan: ${tier.displayName}",
            style = MaterialTheme.typography.labelLarge,
            fontWeight = FontWeight.SemiBold,
        )
    }
}

@Composable
private fun TierSelectionCard(
    tierName: String,
    price: String,
    isSelected: Boolean,
    isCurrent: Boolean,
    color: Color,
    onClick: () -> Unit,
) {
    Card(
        onClick = onClick,
        modifier = Modifier
            .fillMaxWidth()
            .semantics {
                contentDescription = "$tierName plan, $price per month${if (isCurrent) ", current plan" else ""}"
            },
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(
            containerColor = if (isSelected) color.copy(alpha = 0.08f) else MaterialTheme.colorScheme.surface,
        ),
        border = BorderStroke(
            width = if (isSelected) 2.dp else 1.dp,
            color = if (isSelected) color else MaterialTheme.colorScheme.outlineVariant,
        ),
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween,
        ) {
            Column {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(
                        text = tierName,
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.Bold,
                        color = color,
                    )
                    if (isCurrent) {
                        Spacer(Modifier.width(8.dp))
                        Text(
                            text = "Current",
                            style = MaterialTheme.typography.labelSmall,
                            color = color,
                            modifier = Modifier
                                .background(
                                    color = color.copy(alpha = 0.15f),
                                    shape = RoundedCornerShape(4.dp),
                                )
                                .padding(horizontal = 6.dp, vertical = 2.dp),
                        )
                    }
                }
                Spacer(Modifier.height(4.dp))
                Text(
                    text = if (price.isNotEmpty()) "$price/month" else "Loading...",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            if (isSelected) {
                Icon(
                    imageVector = Icons.Filled.CheckCircle,
                    contentDescription = "Selected",
                    tint = color,
                    modifier = Modifier.size(28.dp),
                )
            }
        }
    }
}

@Composable
private fun InsiderFeaturesList(price: String) {
    Column(modifier = Modifier.fillMaxWidth()) {
        Text(
            text = "Insider — ${price.ifEmpty { "$4.99" }}/mo",
            style = MaterialTheme.typography.labelLarge,
            fontWeight = FontWeight.Bold,
            color = InsiderColor,
        )
        Spacer(Modifier.height(8.dp))
        FeatureRow(icon = Icons.Filled.Map, color = InsiderColor, text = "AI Trip Planner (5 trips/month)")
        FeatureRow(icon = Icons.Filled.FavoriteBorder, color = InsiderColor, text = "Unlimited favorites")
        FeatureRow(icon = Icons.Outlined.Tune, color = InsiderColor, text = "Advanced filters (distance, price, rating)")
        FeatureRow(icon = Icons.Filled.RateReview, color = InsiderColor, text = "Write reviews & ratings")
        FeatureRow(icon = Icons.Filled.Notifications, color = InsiderColor, text = "Saved searches & event alerts")
        FeatureRow(icon = Icons.Filled.VisibilityOff, color = InsiderColor, text = "Ad-free experience")
        FeatureRow(icon = Icons.Filled.Bolt, color = InsiderColor, text = "Early access to events")
    }
}

@Composable
private fun VipFeaturesList(price: String) {
    Column(modifier = Modifier.fillMaxWidth()) {
        Text(
            text = "VIP — ${price.ifEmpty { "$12.99" }}/mo",
            style = MaterialTheme.typography.labelLarge,
            fontWeight = FontWeight.Bold,
            color = VipColor,
        )
        Spacer(Modifier.height(8.dp))
        FeatureRow(icon = Icons.Filled.Map, color = VipColor, text = "Unlimited AI Trip Planner")
        FeatureRow(icon = Icons.Filled.Star, color = VipColor, text = "VIP-exclusive events")
        FeatureRow(icon = Icons.Filled.Restaurant, color = VipColor, text = "Restaurant reservation help")
        FeatureRow(icon = Icons.Filled.Sms, color = VipColor, text = "SMS alerts for your interests")
        FeatureRow(icon = Icons.Filled.CardGiftcard, color = VipColor, text = "Monthly local business perks")
        FeatureRow(icon = Icons.Filled.Star, color = VipColor, text = "Concierge support")
    }
}

@Composable
private fun FeatureRow(
    icon: ImageVector,
    color: Color,
    text: String,
) {
    Row(
        verticalAlignment = Alignment.CenterVertically,
        modifier = Modifier.padding(vertical = 3.dp),
    ) {
        Icon(
            imageVector = icon,
            contentDescription = null,
            tint = color,
            modifier = Modifier.size(18.dp),
        )
        Spacer(Modifier.width(10.dp))
        Text(
            text = text,
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}

@Composable
private fun CrossPlatformSubscriptionsBanner(subs: List<CrossPlatformSubscription>) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.surfaceVariant,
        ),
    ) {
        Column(modifier = Modifier.padding(12.dp)) {
            subs.forEach { sub ->
                val (whereLabel, tierLabel) = when (sub.origin) {
                    CrossPlatformOrigin.WEB -> "via the website" to sub.tier.name.lowercase()
                        .replaceFirstChar { it.titlecase() }
                    CrossPlatformOrigin.IOS -> "on the App Store" to sub.tier.name.lowercase()
                        .replaceFirstChar { it.titlecase() }
                }
                Text(
                    text = "You also have an active $tierLabel subscription $whereLabel. Manage or cancel it from where you bought it.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
    }
}

// endregion
