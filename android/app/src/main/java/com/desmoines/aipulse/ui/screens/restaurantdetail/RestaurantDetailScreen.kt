package com.desmoines.aipulse.ui.screens.restaurantdetail

import androidx.compose.animation.animateContentSize
import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.spring
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
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
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.ChevronRight
import androidx.compose.material.icons.filled.Directions
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material.icons.filled.FavoriteBorder
import androidx.compose.material.icons.filled.Info
import androidx.compose.material.icons.filled.Language
import androidx.compose.material.icons.filled.LocationOn
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.MyLocation
import androidx.compose.material.icons.filled.Phone
import androidx.compose.material.icons.filled.Share
import androidx.compose.material.icons.filled.Star
import androidx.compose.material.icons.automirrored.filled.StarHalf
import androidx.compose.material.icons.filled.StarOutline
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import com.desmoines.aipulse.util.rememberHapticPerformer
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import com.desmoines.aipulse.data.model.Restaurant
import com.desmoines.aipulse.data.model.SubscriptionTier
import com.desmoines.aipulse.ui.components.AdBannerView
import com.desmoines.aipulse.ui.components.CachedAsyncImage
import com.desmoines.aipulse.ui.components.reviews.ReviewsSection
import com.desmoines.aipulse.ui.components.FullScreenImageViewer
import com.desmoines.aipulse.ui.components.HeartBurst
import com.desmoines.aipulse.ui.components.LoadingView
import com.desmoines.aipulse.ui.components.PremiumBadge
import com.desmoines.aipulse.ui.theme.GlassIntensity
import com.desmoines.aipulse.ui.theme.PremiumTokens
import com.desmoines.aipulse.ui.theme.glassSurface
import com.desmoines.aipulse.ui.theme.BrandOrange
import com.desmoines.aipulse.ui.theme.CategoryFood
import com.desmoines.aipulse.ui.theme.DesMoinesInsiderTheme
import com.desmoines.aipulse.ui.theme.StatusSuccess
import java.util.Locale

/**
 * Restaurant Detail screen matching iOS RestaurantDetailView.swift.
 * Contains: hero header, info, actions, dining tips, and ad banner.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun RestaurantDetailScreen(
    restaurant: Restaurant?,
    isLoading: Boolean,
    isFavorited: Boolean,
    currentTier: SubscriptionTier,
    distanceText: String? = null,
    onNavigateBack: () -> Unit,
    onShare: () -> Unit,
    onToggleFavorite: () -> Unit,
    onCall: () -> Unit,
    onOpenWebsite: () -> Unit,
    onOpenDirections: () -> Unit,
    onShowSubscription: () -> Unit,
    onNavigateToAuth: () -> Unit = {},
) {
    var showImageViewer by remember { mutableStateOf(false) }
    val haptic = rememberHapticPerformer()

    if (isLoading && restaurant == null) {
        LoadingView(message = "Loading restaurant...")
        return
    }

    if (restaurant == null) {
        LoadingView(message = "Restaurant not found")
        return
    }

    val hasPremiumAccess = currentTier == SubscriptionTier.INSIDER || currentTier == SubscriptionTier.VIP

    Scaffold(
        topBar = {
            TopAppBar(
                title = { },
                navigationIcon = {
                    IconButton(onClick = onNavigateBack) {
                        Icon(
                            imageVector = Icons.AutoMirrored.Filled.ArrowBack,
                            contentDescription = "Go back"
                        )
                    }
                },
                actions = {
                    IconButton(onClick = {
                        haptic.medium()
                        onShare()
                    }) {
                        Icon(
                            imageVector = Icons.Filled.Share,
                            contentDescription = "Share restaurant"
                        )
                    }
                    var favoriteBurst by remember { mutableIntStateOf(0) }
                    LaunchedEffect(isFavorited) {
                        if (isFavorited) favoriteBurst++
                    }
                    HeartBurst(
                        triggerKey = favoriteBurst,
                        modifier = Modifier.size(48.dp),
                    ) {
                        IconButton(onClick = {
                            haptic.medium()
                            onToggleFavorite()
                        }) {
                            Icon(
                                imageVector = if (isFavorited) Icons.Filled.Favorite else Icons.Filled.FavoriteBorder,
                                contentDescription = if (isFavorited) "Remove from saved" else "Save restaurant",
                                tint = if (isFavorited) Color.Red else MaterialTheme.colorScheme.onSurface
                            )
                        }
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = MaterialTheme.colorScheme.surface
                )
            )
        }
    ) { paddingValues ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(paddingValues)
                .verticalScroll(rememberScrollState())
        ) {
            // Hero Header
            RestaurantDetailHeader(
                restaurant = restaurant,
                onImageTap = { showImageViewer = true }
            )

            // Info Section
            RestaurantDetailInfo(
                restaurant = restaurant,
                distanceText = distanceText,
                onOpenDirections = onOpenDirections
            )

            // Action Buttons
            RestaurantDetailActions(
                restaurant = restaurant,
                onCall = onCall,
                onOpenWebsite = onOpenWebsite,
                onOpenDirections = onOpenDirections
            )

            // Dining Tips
            RestaurantDetailDiningTips(
                restaurant = restaurant,
                hasPremiumAccess = hasPremiumAccess,
                currentTier = currentTier,
                onShowSubscription = onShowSubscription
            )

            // Reviews (ANDP-035 / ANDP-036)
            Spacer(modifier = Modifier.height(8.dp))
            ReviewsSection(
                contentType = "restaurant",
                contentId = restaurant.id,
                onNavigateToSubscription = onShowSubscription,
                onNavigateToAuth = onNavigateToAuth,
            )

            // Ad Banner
            AdBannerView(
                currentTier = currentTier,
                onUpgradeClick = onShowSubscription,
                modifier = Modifier
                    .padding(horizontal = 16.dp)
                    .padding(vertical = 8.dp)
            )

            Spacer(modifier = Modifier.height(24.dp))
        }
    }

    // Full-screen image viewer
    if (showImageViewer) {
        FullScreenImageViewer(
            imageUrl = restaurant.imageUrl,
            onDismiss = { showImageViewer = false }
        )
    }
}

// region Hero Image Header

@Composable
private fun RestaurantDetailHeader(
    restaurant: Restaurant,
    onImageTap: () -> Unit
) {
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .height(300.dp)
            .clickable(enabled = restaurant.imageUrl != null) { onImageTap() }
    ) {
        // Image or placeholder
        if (restaurant.imageUrl != null) {
            CachedAsyncImage(
                url = restaurant.imageUrl,
                contentDescription = null,
                modifier = Modifier.fillMaxSize()
            )
        } else {
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .background(
                        Brush.verticalGradient(
                            colors = listOf(
                                CategoryFood.copy(alpha = 0.15f),
                                CategoryFood.copy(alpha = 0.25f)
                            )
                        )
                    ),
                contentAlignment = Alignment.Center
            ) {
                Icon(
                    imageVector = Icons.Filled.Phone, // fork.knife equivalent
                    contentDescription = null,
                    tint = CategoryFood.copy(alpha = 0.3f),
                    modifier = Modifier.size(64.dp)
                )
            }
        }

        // Layered scrim matching PremiumTokens.ImageScrim
        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(PremiumTokens.ImageScrim)
        )

        // Subtle top-left highlight
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .height(180.dp)
                .background(
                    Brush.linearGradient(
                        colors = listOf(
                            Color.White.copy(alpha = 0.18f),
                            Color.Transparent,
                        )
                    )
                )
        )

        // Title overlay — wrapped in glass panel for legibility and cohesion
        Column(
            modifier = Modifier
                .align(Alignment.BottomStart)
                .padding(16.dp)
                .glassSurface(
                    shape = RoundedCornerShape(PremiumTokens.CornerLg),
                    intensity = GlassIntensity.Overlay,
                    elevation = PremiumTokens.Elevation2,
                )
                .padding(horizontal = 14.dp, vertical = 12.dp)
        ) {
            // Cuisine badge
            restaurant.cuisine?.let { cuisine ->
                Surface(
                    shape = RoundedCornerShape(50),
                    color = Color.White.copy(alpha = 0.2f)
                ) {
                    Text(
                        text = cuisine,
                        style = MaterialTheme.typography.labelSmall,
                        fontWeight = FontWeight.Bold,
                        color = Color.White,
                        modifier = Modifier.padding(horizontal = 10.dp, vertical = 4.dp)
                    )
                }
                Spacer(modifier = Modifier.height(6.dp))
            }

            Text(
                text = restaurant.name,
                style = MaterialTheme.typography.titleLarge,
                fontWeight = FontWeight.Bold,
                color = Color.White,
                maxLines = 3,
                overflow = TextOverflow.Ellipsis
            )
        }
    }
}

// endregion

// region Info Section

@Composable
private fun RestaurantDetailInfo(
    restaurant: Restaurant,
    distanceText: String? = null,
    onOpenDirections: () -> Unit
) {
    val haptic = rememberHapticPerformer()

    Column(
        modifier = Modifier.padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp)
    ) {
        // Rating & Price row
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            restaurant.rating?.let { rating ->
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                    modifier = Modifier.semantics {
                        contentDescription = "${String.format(Locale.US, "%.1f", rating)} out of 5 stars"
                    }
                ) {
                    // Star icons
                    Row(horizontalArrangement = Arrangement.spacedBy(2.dp)) {
                        for (star in 1..5) {
                            val icon = when {
                                star.toDouble() <= rating -> Icons.Filled.Star
                                star.toDouble() - 0.5 <= rating -> Icons.AutoMirrored.Filled.StarHalf
                                else -> Icons.Filled.StarOutline
                            }
                            val tint = when {
                                star.toDouble() <= rating -> Color(0xFFFFC107) // yellow
                                star.toDouble() - 0.5 <= rating -> Color(0xFFFFC107)
                                else -> Color.Gray.copy(alpha = 0.3f)
                            }
                            Icon(
                                imageVector = icon,
                                contentDescription = null,
                                tint = tint,
                                modifier = Modifier.size(14.dp)
                            )
                        }
                    }
                    Text(
                        text = String.format(Locale.US, "%.1f", rating),
                        style = MaterialTheme.typography.bodyMedium,
                        fontWeight = FontWeight.SemiBold
                    )
                }
            }

            restaurant.priceRange?.let { price ->
                Text(
                    text = price,
                    style = MaterialTheme.typography.bodyMedium,
                    fontWeight = FontWeight.SemiBold,
                    color = StatusSuccess
                )
            }

            Spacer(modifier = Modifier.weight(1f))

            if (restaurant.isFeatured == true) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(4.dp)
                ) {
                    Icon(
                        imageVector = Icons.Filled.Star,
                        contentDescription = null,
                        tint = BrandOrange,
                        modifier = Modifier.size(14.dp)
                    )
                    Text(
                        text = "Featured",
                        style = MaterialTheme.typography.labelSmall,
                        fontWeight = FontWeight.SemiBold,
                        color = BrandOrange
                    )
                }
            }
        }

        HorizontalDivider()

        // Location row
        if (restaurant.displayLocation.isNotEmpty()) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Icon(
                    imageVector = Icons.Filled.LocationOn,
                    contentDescription = null,
                    tint = Color.Red,
                    modifier = Modifier.size(28.dp)
                )
                Spacer(modifier = Modifier.width(10.dp))
                Text(
                    text = restaurant.displayLocation,
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.weight(1f)
                )

                if (restaurant.coordinate != null) {
                    IconButton(
                        onClick = {
                            haptic.medium()
                            onOpenDirections()
                        },
                        modifier = Modifier.semantics {
                            contentDescription = "Get directions to ${restaurant.name}"
                        }
                    ) {
                        Icon(
                            imageVector = Icons.Filled.Directions,
                            contentDescription = null,
                            tint = MaterialTheme.colorScheme.primary,
                            modifier = Modifier.size(28.dp)
                        )
                    }
                }
            }
        }

        // Distance row (from user's location)
        if (restaurant.coordinate != null && distanceText != null) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(
                    imageVector = Icons.Filled.MyLocation,
                    contentDescription = null,
                    tint = MaterialTheme.colorScheme.primary,
                    modifier = Modifier.size(28.dp)
                )
                Spacer(modifier = Modifier.width(10.dp))
                Text(
                    text = distanceText,
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
        }

        // Phone row
        if (!restaurant.phone.isNullOrEmpty()) {
            HorizontalDivider()
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(
                    imageVector = Icons.Filled.Phone,
                    contentDescription = null,
                    tint = StatusSuccess,
                    modifier = Modifier.size(28.dp)
                )
                Spacer(modifier = Modifier.width(10.dp))
                Text(
                    text = restaurant.phone,
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.primary
                )
            }
        }

        // Website row
        if (restaurant.websiteUri != null) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(
                    imageVector = Icons.Filled.Language,
                    contentDescription = null,
                    tint = MaterialTheme.colorScheme.primary,
                    modifier = Modifier.size(28.dp)
                )
                Spacer(modifier = Modifier.width(10.dp))
                Text(
                    text = "Visit Website",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.primary
                )
            }
        }

        // Status row
        if (!restaurant.status.isNullOrEmpty()) {
            HorizontalDivider()
            Row(verticalAlignment = Alignment.CenterVertically) {
                val isOpen = restaurant.status.lowercase().contains("open")
                Icon(
                    imageVector = if (isOpen) Icons.Filled.CheckCircle else Icons.Filled.Info,
                    contentDescription = null,
                    tint = if (isOpen) StatusSuccess else MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.size(28.dp)
                )
                Spacer(modifier = Modifier.width(10.dp))
                Text(
                    text = restaurant.status.replaceFirstChar { it.uppercase() },
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
        }
    }

    // Description / About
    if (restaurant.displayDescription.isNotEmpty()) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 16.dp)
                .animateContentSize(
                    animationSpec = spring(stiffness = Spring.StiffnessLow)
                )
        ) {
            Text(
                text = "About",
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.Bold,
                modifier = Modifier.semantics { heading() }
            )
            Spacer(modifier = Modifier.height(10.dp))
            Text(
                text = restaurant.displayDescription,
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                lineHeight = MaterialTheme.typography.bodyMedium.lineHeight
            )
        }
    }
}

// endregion

// region Action Buttons

@Composable
private fun RestaurantDetailActions(
    restaurant: Restaurant,
    onCall: () -> Unit,
    onOpenWebsite: () -> Unit,
    onOpenDirections: () -> Unit
) {
    val haptic = rememberHapticPerformer()
    val hasAnyAction = restaurant.callUri != null || restaurant.websiteUri != null || restaurant.coordinate != null

    if (!hasAnyAction) return

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp)
            .padding(top = 12.dp),
        horizontalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        // Call button
        if (restaurant.callUri != null) {
            Button(
                onClick = {
                    haptic.medium()
                    onCall()
                },
                modifier = Modifier
                    .weight(1f)
                    .semantics { contentDescription = "Call ${restaurant.name}" },
                shape = RoundedCornerShape(12.dp),
                colors = ButtonDefaults.buttonColors(containerColor = StatusSuccess)
            ) {
                Icon(
                    imageVector = Icons.Filled.Phone,
                    contentDescription = null,
                    modifier = Modifier.size(18.dp)
                )
                Spacer(modifier = Modifier.width(6.dp))
                Text(
                    text = "Call",
                    style = MaterialTheme.typography.labelLarge,
                    fontWeight = FontWeight.Medium
                )
            }
        }

        // Website button
        if (restaurant.websiteUri != null) {
            Button(
                onClick = {
                    haptic.medium()
                    onOpenWebsite()
                },
                modifier = Modifier
                    .weight(1f)
                    .semantics { contentDescription = "Visit ${restaurant.name} website" },
                shape = RoundedCornerShape(12.dp),
                colors = ButtonDefaults.buttonColors(
                    containerColor = MaterialTheme.colorScheme.surfaceVariant
                )
            ) {
                Icon(
                    imageVector = Icons.Filled.Language,
                    contentDescription = null,
                    tint = MaterialTheme.colorScheme.onSurface,
                    modifier = Modifier.size(18.dp)
                )
                Spacer(modifier = Modifier.width(6.dp))
                Text(
                    text = "Website",
                    style = MaterialTheme.typography.labelLarge,
                    fontWeight = FontWeight.Medium,
                    color = MaterialTheme.colorScheme.onSurface
                )
            }
        }

        // Directions button
        if (restaurant.coordinate != null) {
            Button(
                onClick = {
                    haptic.medium()
                    onOpenDirections()
                },
                modifier = Modifier
                    .weight(1f)
                    .semantics { contentDescription = "Get directions to ${restaurant.name}" },
                shape = RoundedCornerShape(12.dp),
                colors = ButtonDefaults.buttonColors(
                    containerColor = MaterialTheme.colorScheme.primary
                )
            ) {
                Icon(
                    imageVector = Icons.Filled.Directions,
                    contentDescription = null,
                    modifier = Modifier.size(18.dp)
                )
                Spacer(modifier = Modifier.width(6.dp))
                Text(
                    text = "Directions",
                    style = MaterialTheme.typography.labelLarge,
                    fontWeight = FontWeight.Medium
                )
            }
        }
    }
}

// endregion

// region Dining Tips

@Composable
private fun RestaurantDetailDiningTips(
    restaurant: Restaurant,
    hasPremiumAccess: Boolean,
    currentTier: SubscriptionTier,
    onShowSubscription: () -> Unit
) {
    if (hasPremiumAccess) {
        DiningTipsPremiumContent(restaurant = restaurant, currentTier = currentTier)
    } else {
        DiningTipsUpgradePrompt(onShowSubscription = onShowSubscription)
    }
}

@Composable
private fun DiningTipsPremiumContent(
    restaurant: Restaurant,
    currentTier: SubscriptionTier
) {
    val tipText = remember(restaurant.id) { generateDiningTip(restaurant) }

    Surface(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp)
            .padding(top = 8.dp),
        shape = RoundedCornerShape(16.dp),
        color = BrandOrange.copy(alpha = 0.06f)
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(
                    imageVector = Icons.Filled.Star,
                    contentDescription = null,
                    tint = BrandOrange,
                    modifier = Modifier.size(24.dp)
                )
                Spacer(modifier = Modifier.width(8.dp))
                Text(
                    text = "Insider Dining Tip",
                    style = MaterialTheme.typography.titleSmall,
                    fontWeight = FontWeight.Bold,
                    color = BrandOrange
                )
                Spacer(modifier = Modifier.weight(1f))
                PremiumBadge(
                    tier = if (currentTier == SubscriptionTier.VIP) SubscriptionTier.VIP else SubscriptionTier.INSIDER
                )
            }

            Spacer(modifier = Modifier.height(10.dp))

            Text(
                text = tipText,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                lineHeight = MaterialTheme.typography.bodySmall.lineHeight
            )
        }
    }
}

@Composable
private fun DiningTipsUpgradePrompt(
    onShowSubscription: () -> Unit
) {
    Surface(
        onClick = onShowSubscription,
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp)
            .padding(top = 8.dp)
            .semantics { contentDescription = "Unlock Insider Dining Tips by upgrading to a premium plan" },
        shape = RoundedCornerShape(14.dp),
        color = BrandOrange.copy(alpha = 0.06f),
        border = BorderStroke(1.dp, BrandOrange.copy(alpha = 0.15f))
    ) {
        Row(
            modifier = Modifier.padding(14.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Icon(
                imageVector = Icons.Filled.Lock,
                contentDescription = null,
                tint = BrandOrange,
                modifier = Modifier.size(20.dp)
            )
            Spacer(modifier = Modifier.width(10.dp))
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = "Insider Dining Tips",
                    style = MaterialTheme.typography.bodyMedium,
                    fontWeight = FontWeight.SemiBold
                )
                Text(
                    text = "Upgrade to see exclusive recommendations for this restaurant",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis
                )
            }
            Icon(
                imageVector = Icons.Filled.ChevronRight,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.5f),
                modifier = Modifier.size(18.dp)
            )
        }
    }
}

private fun generateDiningTip(restaurant: Restaurant): String {
    val tips = mutableListOf<String>()

    restaurant.priceRange?.let { price ->
        when (price) {
            "$" -> tips.add("Great value spot! Perfect for a casual meal without breaking the bank.")
            "$$" -> tips.add("Moderately priced with generous portions \u2014 a solid pick for date night or group dinners.")
            "$$$" -> tips.add("Upscale dining experience. Reservations recommended, especially on weekends.")
            "$$$$" -> tips.add("Fine dining at its best. Consider the tasting menu for the full experience.")
        }
    }

    restaurant.cuisine?.let { cuisine ->
        val lower = cuisine.lowercase()
        when {
            lower.contains("italian") || lower.contains("pizza") ->
                tips.add("Ask about daily pasta specials \u2014 they're often not on the menu.")
            lower.contains("mexican") || lower.contains("taco") ->
                tips.add("Try the house salsa and ask if they have off-menu specials.")
            lower.contains("bbq") || lower.contains("barbecue") ->
                tips.add("Get there early \u2014 the best cuts sell out fast!")
            lower.contains("asian") || lower.contains("sushi") || lower.contains("chinese") || lower.contains("thai") ->
                tips.add("Don't skip the appetizers \u2014 they're often the hidden gems here.")
            lower.contains("breakfast") || lower.contains("brunch") ->
                tips.add("Weekend brunch gets busy. Arrive before 10 AM or expect a wait.")
        }
    }

    if (tips.isEmpty()) {
        tips.add("Local favorite! Ask your server for their personal recommendation \u2014 you won't be disappointed.")
    }

    return tips.joinToString(" ")
}

// endregion

// region Previews

@Preview(showBackground = true)
@Composable
private fun RestaurantDetailScreenPreview() {
    DesMoinesInsiderTheme {
        RestaurantDetailScreen(
            restaurant = Restaurant.preview,
            isLoading = false,
            isFavorited = false,
            currentTier = SubscriptionTier.INSIDER,
            onNavigateBack = {},
            onShare = {},
            onToggleFavorite = {},
            onCall = {},
            onOpenWebsite = {},
            onOpenDirections = {},
            onShowSubscription = {},
        )
    }
}

@Preview(showBackground = true)
@Composable
private fun RestaurantDetailScreenFreeUserPreview() {
    DesMoinesInsiderTheme {
        RestaurantDetailScreen(
            restaurant = Restaurant.preview,
            isLoading = false,
            isFavorited = true,
            currentTier = SubscriptionTier.FREE,
            onNavigateBack = {},
            onShare = {},
            onToggleFavorite = {},
            onCall = {},
            onOpenWebsite = {},
            onOpenDirections = {},
            onShowSubscription = {},
        )
    }
}

// endregion
