package com.desmoines.aipulse.ui.components

import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.WorkspacePremium
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.desmoines.aipulse.data.model.SubscriptionTier
import com.desmoines.aipulse.ui.theme.BrandOrange
import com.desmoines.aipulse.ui.theme.DesMoinesInsiderTheme
import com.desmoines.aipulse.ui.theme.PremiumTokens
import com.desmoines.aipulse.util.rememberShouldReduceAnimations

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

/**
 * Gold-accented VIP badge with crown icon and subtle shimmer.
 * Used on VIP-exclusive content to create a recognizable paid-tier look.
 *
 * Mirrors iOS `VipGoldBadge` in PremiumBadge.swift. Respects system
 * reduce-motion (static gradient when enabled).
 */
@Composable
fun VipGoldBadge(
    modifier: Modifier = Modifier,
    label: String = "VIP",
) {
    val reduceMotion = rememberShouldReduceAnimations()
    val transition = rememberInfiniteTransition(label = "vip-shimmer")
    val shimmerX by transition.animateFloat(
        initialValue = 0f,
        targetValue = 1f,
        animationSpec = infiniteRepeatable(
            animation = tween(durationMillis = 2400, easing = FastOutSlowInEasing),
            repeatMode = RepeatMode.Reverse
        ),
        label = "vip-shimmer-x"
    )

    Row(
        modifier = modifier
            .clip(CircleShape)
            .background(PremiumTokens.PremiumGoldGradient)
            .graphicsLayer { if (!reduceMotion) translationX = (shimmerX - 0.5f) * 4f }
            .padding(horizontal = 8.dp, vertical = 3.dp)
            .semantics { contentDescription = "VIP exclusive" },
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(4.dp)
    ) {
        Icon(
            imageVector = Icons.Filled.WorkspacePremium,
            contentDescription = null,
            modifier = Modifier.size(12.dp),
            tint = Color.White
        )
        Text(
            text = label,
            color = Color.White,
            fontSize = 10.sp,
            fontWeight = FontWeight.Bold
        )
    }
}

/**
 * Modifier that applies the premium gold gradient border to a surface.
 * Use on VIP-only cards for instant recognition.
 */
@Composable
fun Modifier.vipGoldBorder(
    cornerRadius: androidx.compose.ui.unit.Dp = PremiumTokens.CornerLg,
    width: androidx.compose.ui.unit.Dp = 2.dp,
): Modifier = this.border(
    width = width,
    brush = PremiumTokens.PremiumGoldGradient,
    shape = RoundedCornerShape(cornerRadius)
)

@Preview(showBackground = true)
@Composable
private fun PremiumBadgePreview() {
    DesMoinesInsiderTheme {
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            PremiumBadge(tier = SubscriptionTier.INSIDER)
            PremiumBadge(tier = SubscriptionTier.VIP)
            VipGoldBadge()
        }
    }
}
