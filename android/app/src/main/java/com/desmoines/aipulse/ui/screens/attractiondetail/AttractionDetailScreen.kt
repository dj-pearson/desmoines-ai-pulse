package com.desmoines.aipulse.ui.screens.attractiondetail

import androidx.compose.animation.animateContentSize
import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.spring
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
import androidx.compose.material.icons.filled.Directions
import androidx.compose.material.icons.filled.Language
import androidx.compose.material.icons.filled.LocationOn
import androidx.compose.material.icons.filled.Map
import androidx.compose.material.icons.filled.MyLocation
import androidx.compose.material.icons.filled.Place
import androidx.compose.material.icons.filled.Share
import androidx.compose.material.icons.filled.Star
import androidx.compose.material.icons.filled.StarHalf
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
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
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
import com.desmoines.aipulse.data.model.Attraction
import com.desmoines.aipulse.ui.components.CachedAsyncImage
import com.desmoines.aipulse.ui.components.FullScreenImageViewer
import com.desmoines.aipulse.ui.components.LoadingView
import com.desmoines.aipulse.ui.theme.BrandOrange
import com.desmoines.aipulse.ui.theme.DesMoinesInsiderTheme

/**
 * Attraction Detail screen matching iOS AttractionDetailView.swift.
 * Simpler than events/restaurants — no favorites, no premium gating.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AttractionDetailScreen(
    attraction: Attraction?,
    isLoading: Boolean,
    onNavigateBack: () -> Unit,
    onShare: () -> Unit,
    onOpenWebsite: () -> Unit,
    onOpenDirections: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val haptic = rememberHapticPerformer()
    var showFullScreenImage by remember { mutableStateOf(false) }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { },
                navigationIcon = {
                    IconButton(onClick = onNavigateBack) {
                        Icon(
                            Icons.AutoMirrored.Filled.ArrowBack,
                            contentDescription = "Go back"
                        )
                    }
                },
                actions = {
                    if (attraction != null) {
                        IconButton(onClick = {
                            haptic.medium()
                            onShare()
                        }) {
                            Icon(Icons.Filled.Share, contentDescription = "Share attraction")
                        }
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = Color.Transparent
                ),
            )
        },
        modifier = modifier,
    ) { paddingValues ->
        if (isLoading || attraction == null) {
            LoadingView(message = "Loading attraction…")
            return@Scaffold
        }

        Column(
            modifier = Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .padding(paddingValues)
        ) {
            // Hero Image
            AttractionDetailHeader(
                attraction = attraction,
                onImageTap = { showFullScreenImage = true },
            )

            // Info Section
            AttractionDetailInfo(
                attraction = attraction,
                onOpenDirections = {
                    haptic.medium()
                    onOpenDirections()
                },
                onOpenWebsite = {
                    haptic.medium()
                    onOpenWebsite()
                },
            )

            // Action Buttons
            AttractionDetailActions(
                attraction = attraction,
                onOpenWebsite = {
                    haptic.medium()
                    onOpenWebsite()
                },
                onOpenDirections = {
                    haptic.medium()
                    onOpenDirections()
                },
            )

            // Description
            AttractionDescriptionSection(attraction = attraction)
        }

        // Full-screen image viewer overlay
        if (showFullScreenImage && attraction.imageUrl != null) {
            FullScreenImageViewer(
                imageUrl = attraction.imageUrl,
                onDismiss = { showFullScreenImage = false },
            )
        }
    }
}

// MARK: - Hero Image

@Composable
private fun AttractionDetailHeader(
    attraction: Attraction,
    onImageTap: () -> Unit,
) {
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .height(300.dp)
            .clickable(
                enabled = attraction.imageUrl != null,
                onClick = onImageTap,
            )
            .semantics { contentDescription = "${attraction.name} image" }
    ) {
        // Image or placeholder
        if (attraction.imageUrl != null) {
            CachedAsyncImage(
                url = attraction.imageUrl,
                contentDescription = attraction.name,
                modifier = Modifier.fillMaxSize()
            )
        } else {
            // Teal gradient placeholder with type icon (matching iOS)
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .background(Color(0xFF009688).copy(alpha = 0.15f)),
                contentAlignment = Alignment.Center
            ) {
                Icon(
                    Icons.Filled.Place,
                    contentDescription = null,
                    modifier = Modifier.size(64.dp),
                    tint = Color(0xFF009688).copy(alpha = 0.3f)
                )
            }
        }

        // Gradient overlay
        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(
                    Brush.verticalGradient(
                        colors = listOf(
                            Color.Transparent,
                            Color.Transparent,
                            Color.Black.copy(alpha = 0.7f)
                        )
                    )
                )
        )

        // Type badge + name at bottom-left
        Column(
            modifier = Modifier
                .align(Alignment.BottomStart)
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(6.dp)
        ) {
            // Type badge (frosted capsule)
            Surface(
                shape = RoundedCornerShape(50),
                color = Color.White.copy(alpha = 0.2f),
            ) {
                Row(
                    modifier = Modifier.padding(horizontal = 10.dp, vertical = 4.dp),
                    horizontalArrangement = Arrangement.spacedBy(4.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Icon(
                        Icons.Filled.Place,
                        contentDescription = null,
                        modifier = Modifier.size(12.dp),
                        tint = Color.White,
                    )
                    Text(
                        text = attraction.type,
                        style = MaterialTheme.typography.labelSmall,
                        fontWeight = FontWeight.Bold,
                        color = Color.White,
                    )
                }
            }

            Text(
                text = attraction.name,
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.Bold,
                color = Color.White,
                maxLines = 3,
                overflow = TextOverflow.Ellipsis,
            )
        }
    }
}

// MARK: - Info Section

@Composable
private fun AttractionDetailInfo(
    attraction: Attraction,
    onOpenDirections: () -> Unit,
    onOpenWebsite: () -> Unit,
) {
    Column(
        modifier = Modifier.padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp)
    ) {
        // Rating + Featured badge
        if (attraction.rating != null) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier
                    .fillMaxWidth()
                    .semantics {
                        contentDescription = "${String.format("%.1f", attraction.rating)} out of 5 stars"
                    }
            ) {
                // Star rating
                Row(horizontalArrangement = Arrangement.spacedBy(2.dp)) {
                    for (star in 1..5) {
                        val icon = when {
                            star.toDouble() <= attraction.rating -> Icons.Filled.Star
                            star - 0.5 <= attraction.rating -> Icons.Filled.StarHalf
                            else -> Icons.Filled.StarOutline
                        }
                        val tint = when {
                            star.toDouble() <= attraction.rating -> Color(0xFFFFC107)
                            star - 0.5 <= attraction.rating -> Color(0xFFFFC107)
                            else -> Color.Gray.copy(alpha = 0.3f)
                        }
                        Icon(
                            icon,
                            contentDescription = null,
                            modifier = Modifier.size(14.dp),
                            tint = tint
                        )
                    }
                }
                Spacer(modifier = Modifier.width(6.dp))
                Text(
                    text = attraction.ratingText,
                    style = MaterialTheme.typography.bodyMedium,
                    fontWeight = FontWeight.SemiBold,
                )

                Spacer(modifier = Modifier.weight(1f))

                // Featured badge
                if (attraction.isFeatured == true) {
                    Row(
                        horizontalArrangement = Arrangement.spacedBy(4.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Icon(
                            Icons.Filled.Star,
                            contentDescription = null,
                            modifier = Modifier.size(12.dp),
                            tint = BrandOrange,
                        )
                        Text(
                            text = "Featured",
                            style = MaterialTheme.typography.labelSmall,
                            fontWeight = FontWeight.SemiBold,
                            color = BrandOrange,
                        )
                    }
                }
            }

            HorizontalDivider()
        }

        // Location with Get Directions
        if (!attraction.location.isNullOrEmpty()) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier.fillMaxWidth()
            ) {
                Icon(
                    Icons.Filled.LocationOn,
                    contentDescription = null,
                    modifier = Modifier.size(24.dp),
                    tint = Color.Red,
                )
                Spacer(modifier = Modifier.width(10.dp))
                Text(
                    text = attraction.location,
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.weight(1f),
                )
                if (attraction.coordinate != null) {
                    IconButton(onClick = onOpenDirections) {
                        Icon(
                            Icons.Filled.Directions,
                            contentDescription = "Get directions",
                            tint = MaterialTheme.colorScheme.primary,
                            modifier = Modifier.size(28.dp),
                        )
                    }
                }
            }
        }

        // Distance (placeholder — will use LocationService when AND-029 wires it)
        if (attraction.coordinate != null) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Icon(
                    Icons.Filled.MyLocation,
                    contentDescription = null,
                    modifier = Modifier.size(24.dp),
                    tint = MaterialTheme.colorScheme.primary,
                )
                Spacer(modifier = Modifier.width(10.dp))
                Text(
                    text = "Des Moines area",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }

        // Website
        if (attraction.websiteUri != null) {
            HorizontalDivider()
            Row(
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier.clickable(onClick = onOpenWebsite)
            ) {
                Icon(
                    Icons.Filled.Language,
                    contentDescription = null,
                    modifier = Modifier.size(24.dp),
                    tint = MaterialTheme.colorScheme.primary,
                )
                Spacer(modifier = Modifier.width(10.dp))
                Text(
                    text = "Visit Website",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.primary,
                )
            }
        }
    }
}

// MARK: - Action Buttons

@Composable
private fun AttractionDetailActions(
    attraction: Attraction,
    onOpenWebsite: () -> Unit,
    onOpenDirections: () -> Unit,
) {
    val hasWebsite = attraction.websiteUri != null
    val hasCoordinate = attraction.coordinate != null

    if (!hasWebsite && !hasCoordinate) return

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp),
        horizontalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        if (hasWebsite) {
            Button(
                onClick = onOpenWebsite,
                modifier = Modifier.weight(1f),
                shape = RoundedCornerShape(12.dp),
                colors = ButtonDefaults.buttonColors(
                    containerColor = MaterialTheme.colorScheme.primary
                )
            ) {
                Icon(Icons.Filled.Language, contentDescription = null, modifier = Modifier.size(18.dp))
                Spacer(modifier = Modifier.width(6.dp))
                Text(
                    "Website",
                    style = MaterialTheme.typography.bodyMedium,
                    fontWeight = FontWeight.Medium,
                )
            }
        }
        if (hasCoordinate) {
            Button(
                onClick = onOpenDirections,
                modifier = Modifier.weight(1f),
                shape = RoundedCornerShape(12.dp),
                colors = ButtonDefaults.buttonColors(
                    containerColor = Color(0xFF2196F3)
                )
            ) {
                Icon(Icons.Filled.Map, contentDescription = null, modifier = Modifier.size(18.dp))
                Spacer(modifier = Modifier.width(6.dp))
                Text(
                    "Directions",
                    style = MaterialTheme.typography.bodyMedium,
                    fontWeight = FontWeight.Medium,
                )
            }
        }
    }
}

// MARK: - Description Section

@Composable
private fun AttractionDescriptionSection(attraction: Attraction) {
    if (attraction.description.isNullOrEmpty()) return

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(16.dp)
            .animateContentSize(
                animationSpec = spring(stiffness = Spring.StiffnessLow)
            ),
        verticalArrangement = Arrangement.spacedBy(10.dp)
    ) {
        Text(
            text = "About",
            style = MaterialTheme.typography.titleMedium,
            fontWeight = FontWeight.Bold,
            modifier = Modifier.semantics { heading() }
        )
        Text(
            text = attraction.description,
            style = MaterialTheme.typography.bodyLarge,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            lineHeight = MaterialTheme.typography.bodyLarge.lineHeight,
        )
    }
}

// MARK: - Preview

@Preview(showBackground = true)
@Composable
private fun AttractionDetailScreenPreview() {
    DesMoinesInsiderTheme {
        AttractionDetailScreen(
            attraction = Attraction.preview,
            isLoading = false,
            onNavigateBack = {},
            onShare = {},
            onOpenWebsite = {},
            onOpenDirections = {},
        )
    }
}
