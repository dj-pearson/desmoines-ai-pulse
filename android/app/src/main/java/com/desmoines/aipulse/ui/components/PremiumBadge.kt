package com.desmoines.aipulse.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.desmoines.aipulse.data.model.SubscriptionTier
import com.desmoines.aipulse.ui.theme.BrandOrange
import com.desmoines.aipulse.ui.theme.DesMoinesInsiderTheme

/**
 * Inline premium lock label used for individual rows/buttons.
 * Shows a lock icon and tier name in a capsule badge.
 * Mirrors iOS PremiumBadge in PremiumGate.swift.
 */
@Composable
fun PremiumBadge(
    modifier: Modifier = Modifier,
    tier: SubscriptionTier = SubscriptionTier.INSIDER
) {
    val backgroundColor = if (tier == SubscriptionTier.VIP) {
        Color(0xFF9C27B0) // purple
    } else {
        BrandOrange
    }

    Row(
        modifier = modifier
            .clip(CircleShape)
            .background(backgroundColor)
            .padding(horizontal = 7.dp, vertical = 3.dp)
            .semantics {
                contentDescription = "${tier.displayName} premium feature"
            },
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(4.dp)
    ) {
        Icon(
            imageVector = Icons.Filled.Lock,
            contentDescription = null, // Described by container semantics
            modifier = Modifier.size(9.dp),
            tint = Color.White
        )
        Text(
            text = tier.displayName,
            color = Color.White,
            fontSize = 10.sp,
            fontWeight = FontWeight.SemiBold
        )
    }
}

@Preview(showBackground = true)
@Composable
private fun PremiumBadgePreview() {
    DesMoinesInsiderTheme {
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            PremiumBadge(tier = SubscriptionTier.INSIDER)
            PremiumBadge(tier = SubscriptionTier.VIP)
        }
    }
}
