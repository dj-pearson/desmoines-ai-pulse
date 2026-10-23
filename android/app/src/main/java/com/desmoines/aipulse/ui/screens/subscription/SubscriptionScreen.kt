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
import androidx.compose.material.icons.filled.Star
import androidx.compose.material.icons.outlined.Tune
import androidx.compose.material.icons.filled.VisibilityOff
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
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.desmoines.aipulse.data.model.SubscriptionTier
import com.desmoines.aipulse.data.remote.BillingService.CrossPlatformOrigin
import com.desmoines.aipulse.data.remote.BillingService.CrossPlatformSubscription
import com.desmoines.aipulse.data.remote.PurchasePlan
import com.desmoines.aipulse.ui.components.BrandGhostButton
import com.desmoines.aipulse.ui.components.BrandPrimaryButton
import com.desmoines.aipulse.ui.components.BrandSecondaryButton
import com.desmoines.aipulse.util.SafeLinkLauncher

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
    insiderOffer: TierOffer,
    vipOffer: TierOffer,
    selectedTier: SubscriptionTier?,
    onSelectTier: (SubscriptionTier) -> Unit,
    onPurchase: () -> Unit,
    onRestorePurchases: () -> Unit,
    onNavigateBack: () -> Unit,
    onNavigateToTerms: () -> Unit,
    onNavigateToPrivacy: () -> Unit,
    crossPlatformSubscriptions: List<CrossPlatformSubscription> = emptyList(),
    manageSubscriptionUrl: String? = null,
    purchasePlan: PurchasePlan? = null,
    // False while the Trip Planner is paused (AND-OVH-011): don't sell it.
    showTripPlanner: Boolean = true,
) {
    val context = LocalContext.current
    val selectedPrice = when (selectedTier) {
        SubscriptionTier.INSIDER -> insiderOffer
        SubscriptionTier.VIP -> vipOffer
        else -> null
    }.let { (it as? TierOffer.Available)?.formattedPrice }

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

            // Tier selection cards. Each shows Play's formattedPrice, a
            // spinner while the query runs, or an unavailable notice; never a
            // price the app wrote itself (AND-OVH-008).
            TierSelectionCard(
                tierName = "Insider",
                offer = insiderOffer,
                isSelected = selectedTier == SubscriptionTier.INSIDER,
                isCurrent = currentTier == SubscriptionTier.INSIDER,
                color = InsiderColor,
                onClick = { onSelectTier(SubscriptionTier.INSIDER) },
            )

            Spacer(Modifier.height(12.dp))

            TierSelectionCard(
                tierName = "VIP",
                offer = vipOffer,
                isSelected = selectedTier == SubscriptionTier.VIP,
                isCurrent = currentTier == SubscriptionTier.VIP,
                color = VipColor,
                onClick = { onSelectTier(SubscriptionTier.VIP) },
            )

            Spacer(Modifier.height(20.dp))

            // Purchase button — migrated to BrandPrimaryButton. Disabled
            // until the selected tier has a Play price to charge.
            BrandPrimaryButton(
                onClick = onPurchase,
                enabled = selectedTier != null && selectedTier != currentTier && selectedPrice != null,
                isLoading = isLoading,
                text = if (isLoading) "Processing..." else purchaseButtonLabel(purchasePlan, selectedTier),
            )

            // Auto-renew disclosure, always with the price Play will charge.
            selectedPrice?.let { price ->
                Spacer(Modifier.height(8.dp))
                Text(
                    text = renewalDisclosure(purchasePlan, selectedTier, price),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    textAlign = TextAlign.Center,
                )
            }

            // Google Play subscribers manage or cancel in Play itself.
            manageSubscriptionUrl?.let { url ->
                Spacer(Modifier.height(12.dp))
                BrandSecondaryButton(
                    onClick = { SafeLinkLauncher.openUrl(context, url) },
                    text = "Manage subscription",
                )
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
            InsiderFeaturesList(
                price = (insiderOffer as? TierOffer.Available)?.formattedPrice,
                showTripPlanner = showTripPlanner,
            )

            Spacer(Modifier.height(8.dp))

            HorizontalDivider(modifier = Modifier.padding(vertical = 8.dp))

            VipFeaturesList(
                price = (vipOffer as? TierOffer.Available)?.formattedPrice,
                showTripPlanner = showTripPlanner,
            )

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

private const val UNAVAILABLE_TEXT = "Subscriptions unavailable right now"

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
    offer: TierOffer,
    isSelected: Boolean,
    isCurrent: Boolean,
    color: Color,
    onClick: () -> Unit,
) {
    val priceDescription = when (offer) {
        is TierOffer.Available -> "${offer.formattedPrice} per month"
        TierOffer.Loading -> "loading price"
        TierOffer.Unavailable -> UNAVAILABLE_TEXT
    }
    Card(
        onClick = onClick,
        enabled = offer is TierOffer.Available,
        modifier = Modifier
            .fillMaxWidth()
            .semantics {
                contentDescription = "$tierName plan, $priceDescription${if (isCurrent) ", current plan" else ""}"
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
                when (offer) {
                    is TierOffer.Available -> Text(
                        text = "${offer.formattedPrice}/month",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    TierOffer.Loading -> CircularProgressIndicator(
                        modifier = Modifier.size(18.dp),
                        strokeWidth = 2.dp,
                        color = color,
                    )
                    TierOffer.Unavailable -> Text(
                        text = UNAVAILABLE_TEXT,
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
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
private fun InsiderFeaturesList(price: String?, showTripPlanner: Boolean) {
    Column(modifier = Modifier.fillMaxWidth()) {
        Text(
            text = if (price != null) "Insider — $price/mo" else "Insider",
            style = MaterialTheme.typography.labelLarge,
            fontWeight = FontWeight.Bold,
            color = InsiderColor,
        )
        Spacer(Modifier.height(8.dp))
        if (showTripPlanner) {
            FeatureRow(icon = Icons.Filled.Map, color = InsiderColor, text = "AI Trip Planner (5 trips/month)")
        }
        FeatureRow(icon = Icons.Filled.FavoriteBorder, color = InsiderColor, text = "Unlimited favorites")
        FeatureRow(icon = Icons.Outlined.Tune, color = InsiderColor, text = "Advanced filters (distance, price, rating)")
        FeatureRow(icon = Icons.Filled.RateReview, color = InsiderColor, text = "Write reviews & ratings")
        FeatureRow(icon = Icons.Filled.Notifications, color = InsiderColor, text = "Saved searches & event alerts")
        FeatureRow(icon = Icons.Filled.VisibilityOff, color = InsiderColor, text = "Ad-free experience")
        FeatureRow(icon = Icons.Filled.Bolt, color = InsiderColor, text = "Early access to events")
    }
}

@Composable
private fun VipFeaturesList(price: String?, showTripPlanner: Boolean) {
    Column(modifier = Modifier.fillMaxWidth()) {
        Text(
            text = if (price != null) "VIP — $price/mo" else "VIP",
            style = MaterialTheme.typography.labelLarge,
            fontWeight = FontWeight.Bold,
            color = VipColor,
        )
        Spacer(Modifier.height(8.dp))
        // Only what Android actually does for VIP: every row must map to code
        // that checks SubscriptionTier.VIP (unlimited trips are
        // TripPlannerViewModel). Perks the web lists but this app doesn't
        // implement stay off until they ship here (AND-OVH-008).
        FeatureRow(icon = Icons.Filled.Star, color = VipColor, text = "Everything in Insider")
        if (showTripPlanner) {
            FeatureRow(icon = Icons.Filled.Map, color = VipColor, text = "Unlimited AI Trip Planner")
        }
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

/**
 * Says what the tap does. A tier change replaces the Play subscription the
 * user already has, so it is not labelled as a new subscription (AND-OVH-009).
 */
internal fun purchaseButtonLabel(plan: PurchasePlan?, target: SubscriptionTier?): String {
    val name = target?.displayName ?: return "Subscribe"
    return when (plan) {
        is PurchasePlan.Upgrade -> "Upgrade to $name"
        is PurchasePlan.Downgrade -> "Switch to $name"
        else -> "Subscribe"
    }
}

/**
 * The auto-renew disclosure, always with the price Play will charge. An
 * upgrade is prorated now (CHARGE_PRORATED_PRICE); a downgrade waits for the
 * renewal date (DEFERRED). Each says so, because the charge differs.
 */
internal fun renewalDisclosure(plan: PurchasePlan?, target: SubscriptionTier?, price: String): String {
    val name = target?.displayName ?: "your new plan"
    return when (plan) {
        is PurchasePlan.Upgrade ->
            "Switches to $name now. Google Play charges the prorated difference today, then $price monthly " +
                "from your current renewal date until cancelled. Cancel anytime in Google Play."
        is PurchasePlan.Downgrade ->
            "Your current plan stays active until it renews, then switches to $name at $price monthly " +
                "until cancelled. Cancel anytime in Google Play."
        else -> "Renews monthly at $price until cancelled. Cancel anytime in Google Play."
    }
}
