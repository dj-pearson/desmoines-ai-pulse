package com.desmoines.aipulse.ui.components

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import com.desmoines.aipulse.data.model.SubscriptionTier
import com.desmoines.aipulse.ui.theme.BrandOrange
import com.desmoines.aipulse.ui.theme.DesMoinesInsiderTheme

/**
 * A reusable overlay that locks premium content behind a subscription tier.
 * Shows a locked state with feature name, tier badge, and unlock button.
 * Mirrors iOS PremiumGate.swift.
 *
 * @param requiredTier The minimum tier required to access the content
 * @param feature Description of the locked feature
 * @param currentTier The user's current subscription tier
 * @param onUpgradeClick Callback when "Unlock" button is tapped
 * @param content The premium content to show when user has access
 */
@Composable
fun PremiumGate(
    requiredTier: SubscriptionTier,
    feature: String,
    currentTier: SubscriptionTier,
    onUpgradeClick: () -> Unit,
    modifier: Modifier = Modifier,
    content: @Composable () -> Unit
) {
    val hasAccess = when (requiredTier) {
        SubscriptionTier.FREE -> true
        SubscriptionTier.INSIDER -> currentTier == SubscriptionTier.INSIDER || currentTier == SubscriptionTier.VIP
        SubscriptionTier.VIP -> currentTier == SubscriptionTier.VIP
    }

    if (hasAccess) {
        content()
    } else {
        LockedOverlay(
            requiredTier = requiredTier,
            feature = feature,
            onUpgradeClick = onUpgradeClick,
            modifier = modifier
        )
    }
}

@Composable
private fun LockedOverlay(
    requiredTier: SubscriptionTier,
    feature: String,
    onUpgradeClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    Surface(
        modifier = modifier
            .semantics {
                contentDescription = "${requiredTier.displayName} Feature. $feature. Tap to upgrade."
            },
        shape = RoundedCornerShape(14.dp),
        color = MaterialTheme.colorScheme.surfaceVariant,
        border = BorderStroke(1.dp, BrandOrange.copy(alpha = 0.2f))
    ) {
        Column(modifier = Modifier.padding(14.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(
                    imageVector = Icons.Filled.Lock,
                    contentDescription = null,
                    tint = BrandOrange
                )
                Spacer(modifier = Modifier.width(8.dp))
                Text(
                    text = "${requiredTier.displayName} Feature",
                    style = MaterialTheme.typography.titleSmall,
                    fontWeight = FontWeight.SemiBold
                )
            }

            Spacer(modifier = Modifier.height(4.dp))

            Text(
                text = feature,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )

            Spacer(modifier = Modifier.height(12.dp))

            Button(
                onClick = onUpgradeClick,
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(10.dp),
                colors = ButtonDefaults.buttonColors(
                    containerColor = MaterialTheme.colorScheme.primary
                )
            ) {
                Text(
                    text = "Unlock with ${requiredTier.displayName}",
                    style = MaterialTheme.typography.labelMedium,
                    fontWeight = FontWeight.SemiBold
                )
            }
        }
    }
}

@Preview(showBackground = true)
@Composable
private fun PremiumGateLockedPreview() {
    DesMoinesInsiderTheme {
        PremiumGate(
            requiredTier = SubscriptionTier.INSIDER,
            feature = "Advanced search filters including distance, price range, and rating",
            currentTier = SubscriptionTier.FREE,
            onUpgradeClick = {}
        ) {
            Text("Premium Content Here")
        }
    }
}

@Preview(showBackground = true)
@Composable
private fun PremiumGateUnlockedPreview() {
    DesMoinesInsiderTheme {
        PremiumGate(
            requiredTier = SubscriptionTier.INSIDER,
            feature = "Advanced filters",
            currentTier = SubscriptionTier.INSIDER,
            onUpgradeClick = {}
        ) {
            Text("Premium Content Visible!")
        }
    }
}
