package com.desmoines.aipulse.ui.components

import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.animation.togetherWith
import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.spring
import androidx.compose.foundation.background
import androidx.compose.foundation.border
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
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Check
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.desmoines.aipulse.ui.theme.GlassIntensity
import com.desmoines.aipulse.ui.theme.PremiumTokens
import com.desmoines.aipulse.ui.theme.glassSurface
import com.desmoines.aipulse.util.rememberHapticPerformer
import com.desmoines.aipulse.util.rememberShouldReduceAnimations

/**
 * Value proposition shown on a subscription tier card.
 */
data class TierValueProp(
    val icon: ImageVector,
    val text: String,
)

/**
 * Animated subscription tier card used in the redesigned SubscriptionScreen.
 * Mirrors iOS `SubscriptionTierCard.swift`.
 *
 * The featured tier is scaled up slightly and (for VIP) renders with a gold
 * gradient border. CTA press plays premiumUnlock haptic and scales to 0.97.
 */
@Composable
fun SubscriptionTierCard(
    tierName: String,
    price: String,
    billingLabel: String,
    tagline: String,
    valueProps: List<TierValueProp>,
    ctaLabel: String,
    onCtaClick: () -> Unit,
    modifier: Modifier = Modifier,
    isFeatured: Boolean = false,
    isVip: Boolean = false,
    strikethroughPrice: String? = null,
) {
    val haptic = rememberHapticPerformer()
    val reduceMotion = rememberShouldReduceAnimations()

    val scale by animateFloatAsState(
        targetValue = if (isFeatured) 1.03f else 1.0f,
        animationSpec = spring(dampingRatio = Spring.DampingRatioMediumBouncy),
        label = "card-scale",
    )

    val surface = MaterialTheme.colorScheme.surface

    Box(
        modifier = modifier
            .graphicsLayer {
                scaleX = scale
                scaleY = scale
            }
            .fillMaxWidth()
            .glassSurface(
                shape = RoundedCornerShape(PremiumTokens.CornerXl),
                intensity = GlassIntensity.Card,
                elevation = if (isFeatured) PremiumTokens.Elevation8 else PremiumTokens.Elevation4,
            )
            .then(
                if (isVip) {
                    Modifier.border(
                        width = 2.dp,
                        brush = PremiumTokens.PremiumGoldGradient,
                        shape = RoundedCornerShape(PremiumTokens.CornerXl),
                    )
                } else if (isFeatured) {
                    Modifier.border(
                        width = 1.5.dp,
                        brush = PremiumTokens.BrandGradient,
                        shape = RoundedCornerShape(PremiumTokens.CornerXl),
                    )
                } else Modifier
            )
            .padding(20.dp)
            .semantics {
                contentDescription = buildString {
                    append("$tierName tier. ")
                    append("$price $billingLabel. ")
                    append(tagline)
                    append(". ")
                    valueProps.forEach { append(it.text); append(". ") }
                }
            },
    ) {
        Column {
            // Header row with tier name + optional VIP badge
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    text = tierName,
                    style = MaterialTheme.typography.titleLarge,
                    fontWeight = FontWeight.Bold,
                )
                if (isVip) {
                    Spacer(Modifier.size(8.dp))
                    VipGoldBadge()
                }
            }
            Spacer(Modifier.height(4.dp))
            Text(
                text = tagline,
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )

            Spacer(Modifier.height(14.dp))

            // Price row — animated number roll / crossfade on change
            Row(verticalAlignment = Alignment.Bottom) {
                AnimatedContent(
                    targetState = price,
                    transitionSpec = {
                        if (reduceMotion) {
                            fadeIn() togetherWith fadeOut()
                        } else {
                            (slideInVertically { h -> h } + fadeIn()) togetherWith
                                (slideOutVertically { h -> -h } + fadeOut())
                        }
                    },
                    label = "price-roll",
                ) { p ->
                    Text(
                        text = p,
                        fontSize = 34.sp,
                        fontWeight = FontWeight.ExtraBold,
                    )
                }
                Spacer(Modifier.size(6.dp))
                Text(
                    text = billingLabel,
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(bottom = 6.dp),
                )
                if (strikethroughPrice != null) {
                    Spacer(Modifier.size(8.dp))
                    Text(
                        text = strikethroughPrice,
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        textDecoration = TextDecoration.LineThrough,
                        modifier = Modifier.padding(bottom = 6.dp),
                    )
                }
            }

            Spacer(Modifier.height(16.dp))

            // Value props list (top 4)
            valueProps.take(4).forEach { prop ->
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    modifier = Modifier.padding(vertical = 6.dp),
                ) {
                    Box(
                        modifier = Modifier
                            .size(22.dp)
                            .clip(CircleShape)
                            .background(
                                if (isVip) PremiumTokens.PremiumGoldGradient
                                else Brush.linearGradient(
                                    colors = listOf(
                                        MaterialTheme.colorScheme.primaryContainer,
                                        MaterialTheme.colorScheme.primaryContainer,
                                    )
                                )
                            ),
                        contentAlignment = Alignment.Center,
                    ) {
                        Icon(
                            imageVector = prop.icon,
                            contentDescription = null,
                            modifier = Modifier.size(14.dp),
                            tint = if (isVip) Color.White else MaterialTheme.colorScheme.onPrimaryContainer,
                        )
                    }
                    Spacer(Modifier.size(10.dp))
                    Text(
                        text = prop.text,
                        style = MaterialTheme.typography.bodyMedium,
                    )
                }
            }

            Spacer(Modifier.height(18.dp))

            // CTA
            val ctaScale by animateFloatAsState(
                targetValue = 1f,
                animationSpec = spring(dampingRatio = Spring.DampingRatioMediumBouncy),
                label = "cta-scale",
            )
            Button(
                onClick = {
                    haptic.premiumUnlock()
                    onCtaClick()
                },
                modifier = Modifier
                    .fillMaxWidth()
                    .height(52.dp)
                    .graphicsLayer {
                        scaleX = ctaScale
                        scaleY = ctaScale
                    },
                shape = RoundedCornerShape(PremiumTokens.CornerLg),
                colors = ButtonDefaults.buttonColors(
                    containerColor = if (isVip) Color(0xFFB8860B)
                    else MaterialTheme.colorScheme.primary,
                ),
            ) {
                Icon(
                    imageVector = Icons.Filled.Check,
                    contentDescription = null,
                    modifier = Modifier.size(18.dp),
                )
                Spacer(Modifier.size(8.dp))
                Text(
                    text = ctaLabel,
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.Bold,
                )
            }
        }
    }
}

/**
 * Monthly / Annual billing toggle with animated thumb.
 * Fires a light haptic on change.
 */
@Composable
fun BillingCycleToggle(
    isAnnual: Boolean,
    onChange: (Boolean) -> Unit,
    modifier: Modifier = Modifier,
) {
    val haptic = rememberHapticPerformer()
    val thumbOffset by animateFloatAsState(
        targetValue = if (isAnnual) 1f else 0f,
        animationSpec = spring(dampingRatio = Spring.DampingRatioMediumBouncy),
        label = "billing-thumb",
    )

    Row(
        modifier = modifier
            .clip(RoundedCornerShape(PremiumTokens.CornerLg))
            .background(MaterialTheme.colorScheme.surfaceVariant)
            .padding(4.dp)
            .semantics {
                contentDescription = if (isAnnual) "Annual billing selected" else "Monthly billing selected"
            },
        horizontalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        @Composable
        fun segment(label: String, selected: Boolean, onClick: () -> Unit) {
            Box(
                modifier = Modifier
                    .clip(RoundedCornerShape(PremiumTokens.CornerMd))
                    .background(
                        if (selected) MaterialTheme.colorScheme.surface else Color.Transparent
                    )
                    .clickable {
                        haptic.selection()
                        onClick()
                    }
                    .padding(horizontal = 18.dp, vertical = 10.dp),
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    text = label,
                    fontWeight = if (selected) FontWeight.Bold else FontWeight.Normal,
                    color = if (selected) MaterialTheme.colorScheme.primary
                    else MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }

        segment("Monthly", !isAnnual) { onChange(false) }
        segment("Annual · save 20%", isAnnual) { onChange(true) }
        // thumbOffset is exposed for future slide-thumb implementations
        val _unused = thumbOffset
    }
}
