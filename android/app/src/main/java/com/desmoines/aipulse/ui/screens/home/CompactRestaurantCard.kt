package com.desmoines.aipulse.ui.screens.home

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Restaurant
import androidx.compose.material.icons.filled.Star
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import com.desmoines.aipulse.data.model.Restaurant
import com.desmoines.aipulse.ui.components.CachedAsyncImage
import com.desmoines.aipulse.ui.theme.BrandOrange
import com.desmoines.aipulse.ui.theme.DesMoinesInsiderTheme
import com.desmoines.aipulse.ui.theme.Dimens
import com.desmoines.aipulse.ui.theme.GlassIntensity
import com.desmoines.aipulse.ui.theme.PremiumTokens
import com.desmoines.aipulse.ui.theme.StatusSuccess
import com.desmoines.aipulse.ui.theme.glassSurface
import java.util.Locale

/**
 * Compact restaurant card for the horizontal carousel on the Home screen.
 * 180dp width, image 180×110, name, cuisine, price, rating.
 * Mirrors iOS CompactRestaurantCard (inline in HomeView.swift).
 */
@Composable
fun CompactRestaurantCard(
    restaurant: Restaurant,
    modifier: Modifier = Modifier
) {
    Column(
        modifier = modifier
            .width(Dimens.CompactCardWidth)
            .semantics {
                contentDescription = restaurant.compactCardAccessibilityLabel
            },
    ) {
        // Image
        Box(
            modifier = Modifier
                .width(Dimens.CompactCardWidth)
                .height(110.dp)
                .glassSurface(
                    shape = RoundedCornerShape(Dimens.CardCornerRadius),
                    intensity = GlassIntensity.Card,
                    elevation = PremiumTokens.Elevation2,
                )
        ) {
            if (restaurant.imageUrl != null) {
                CachedAsyncImage(
                    url = restaurant.imageUrl,
                    contentDescription = null,
                    modifier = Modifier
                        .width(Dimens.CompactCardWidth)
                        .height(110.dp)
                )
            } else {
                Box(
                    modifier = Modifier
                        .width(Dimens.CompactCardWidth)
                        .height(110.dp)
                        .background(
                            Brush.verticalGradient(
                                colors = listOf(
                                    BrandOrange.copy(alpha = 0.15f),
                                    BrandOrange.copy(alpha = 0.05f)
                                )
                            )
                        ),
                    contentAlignment = Alignment.Center
                ) {
                    Icon(
                        imageVector = Icons.Filled.Restaurant,
                        contentDescription = null,
                        modifier = Modifier.size(24.dp),
                        tint = BrandOrange.copy(alpha = 0.3f)
                    )
                }
            }
        }

        Spacer(modifier = Modifier.height(Dimens.SpacingSm))

        // Name
        Text(
            text = restaurant.name,
            style = MaterialTheme.typography.bodyMedium,
            fontWeight = FontWeight.SemiBold,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis
        )

        Spacer(modifier = Modifier.height(2.dp))

        // Cuisine, price, rating row
        Row(
            modifier = Modifier.width(Dimens.CompactCardWidth),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(6.dp)
        ) {
            restaurant.cuisine?.let { cuisine ->
                Text(
                    text = cuisine,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.weight(1f, fill = false)
                )
            }

            restaurant.priceRange?.let { price ->
                Text(
                    text = price,
                    style = MaterialTheme.typography.bodySmall,
                    fontWeight = FontWeight.Medium,
                    color = StatusSuccess
                )
            }

            Spacer(modifier = Modifier.weight(1f))

            restaurant.rating?.let { rating ->
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(2.dp)
                ) {
                    Icon(
                        imageVector = Icons.Filled.Star,
                        contentDescription = null,
                        modifier = Modifier.size(12.dp),
                        tint = Color(0xFFFFC107) // yellow
                    )
                    Text(
                        text = String.format(Locale.US, "%.1f", rating),
                        style = MaterialTheme.typography.labelSmall,
                        fontWeight = FontWeight.Medium
                    )
                }
            }
        }
    }
}

@Preview(showBackground = true)
@Composable
private fun CompactRestaurantCardPreview() {
    DesMoinesInsiderTheme {
        CompactRestaurantCard(
            restaurant = Restaurant.preview,
            modifier = Modifier.padding(16.dp)
        )
    }
}
