package com.desmoines.aipulse.ui.screens.hoteldetail

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
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
import androidx.compose.material.icons.automirrored.filled.OpenInNew
import androidx.compose.material.icons.automirrored.filled.StarHalf
import androidx.compose.material.icons.filled.AccessTime
import androidx.compose.material.icons.filled.Directions
import androidx.compose.material.icons.filled.Hotel
import androidx.compose.material.icons.filled.LocationOn
import androidx.compose.material.icons.filled.Phone
import androidx.compose.material.icons.filled.Share
import androidx.compose.material.icons.filled.Star
import androidx.compose.material.icons.filled.StarOutline
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.desmoines.aipulse.data.model.Hotel
import com.desmoines.aipulse.ui.components.CachedAsyncImage
import com.desmoines.aipulse.ui.components.LoadingView
import com.desmoines.aipulse.ui.theme.BrandOrange
import com.desmoines.aipulse.ui.theme.GlassIntensity
import com.desmoines.aipulse.ui.theme.PremiumTokens
import com.desmoines.aipulse.ui.theme.StatusSuccess
import com.desmoines.aipulse.ui.theme.glassSurface
import com.desmoines.aipulse.util.rememberHapticPerformer
import java.util.Locale

/**
 * Hotel Detail screen (ANDP-034). Hero header, info, amenities, and a
 * prominent affiliate "Book Now" CTA. Mirrors iOS HotelDetailView.
 *
 * Deferred follow-ups: embedded Reviews section (ANDP-035 #252), affiliate
 * allowlist + safe-link hardening (ANDP-063 #249 / ANDP-065 #265), and
 * App Search indexing (ANDP-070 #270).
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun HotelDetailScreen(
    hotel: Hotel?,
    isLoading: Boolean,
    errorMessage: String?,
    distanceText: String? = null,
    onNavigateBack: () -> Unit,
    onShare: () -> Unit,
    onBook: () -> Unit,
    onCall: () -> Unit,
    onOpenDirections: () -> Unit,
    onRetry: () -> Unit,
) {
    val haptic = rememberHapticPerformer()

    Scaffold(
        topBar = {
            TopAppBar(
                title = { },
                navigationIcon = {
                    IconButton(onClick = onNavigateBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Go back")
                    }
                },
                actions = {
                    if (hotel != null) {
                        IconButton(onClick = { haptic.medium(); onShare() }) {
                            Icon(Icons.Filled.Share, contentDescription = "Share hotel")
                        }
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = MaterialTheme.colorScheme.surface,
                ),
            )
        },
    ) { paddingValues ->
        when {
            hotel == null && isLoading -> LoadingView(message = "Loading hotel...")
            hotel == null -> HotelDetailError(
                message = errorMessage ?: "Hotel not found.",
                onRetry = onRetry,
                modifier = Modifier.padding(paddingValues),
            )
            else -> Column(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(paddingValues)
                    .verticalScroll(rememberScrollState()),
            ) {
                HotelDetailHeader(hotel = hotel)
                HotelDetailInfo(hotel = hotel, distanceText = distanceText, onOpenDirections = onOpenDirections)
                HotelDetailActions(
                    hotel = hotel,
                    onBook = onBook,
                    onCall = onCall,
                    onOpenDirections = onOpenDirections,
                )
                Spacer(modifier = Modifier.height(24.dp))
            }
        }
    }
}

@Composable
private fun HotelDetailHeader(hotel: Hotel) {
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .height(280.dp),
    ) {
        if (hotel.imageUrl != null) {
            CachedAsyncImage(url = hotel.imageUrl, contentDescription = null, modifier = Modifier.fillMaxSize())
        } else {
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .background(
                        Brush.verticalGradient(
                            listOf(BrandOrange.copy(alpha = 0.15f), BrandOrange.copy(alpha = 0.25f)),
                        ),
                    ),
                contentAlignment = Alignment.Center,
            ) {
                Icon(
                    Icons.Filled.Hotel,
                    contentDescription = null,
                    tint = BrandOrange.copy(alpha = 0.3f),
                    modifier = Modifier.size(64.dp),
                )
            }
        }

        Box(modifier = Modifier.fillMaxSize().background(PremiumTokens.ImageScrim))

        Column(
            modifier = Modifier
                .align(Alignment.BottomStart)
                .padding(16.dp)
                .glassSurface(
                    shape = RoundedCornerShape(PremiumTokens.CornerLg),
                    intensity = GlassIntensity.Overlay,
                    elevation = PremiumTokens.Elevation2,
                )
                .padding(horizontal = 14.dp, vertical = 12.dp),
        ) {
            hotel.area?.takeIf { it.isNotBlank() }?.let { area ->
                Surface(shape = RoundedCornerShape(50), color = Color.White.copy(alpha = 0.2f)) {
                    Text(
                        text = area,
                        style = MaterialTheme.typography.labelSmall,
                        fontWeight = FontWeight.Bold,
                        color = Color.White,
                        modifier = Modifier.padding(horizontal = 10.dp, vertical = 4.dp),
                    )
                }
                Spacer(modifier = Modifier.height(6.dp))
            }
            Text(
                text = hotel.name,
                style = MaterialTheme.typography.titleLarge,
                fontWeight = FontWeight.Bold,
                color = Color.White,
                maxLines = 3,
                overflow = TextOverflow.Ellipsis,
            )
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun HotelDetailInfo(
    hotel: Hotel,
    distanceText: String?,
    onOpenDirections: () -> Unit,
) {
    val haptic = rememberHapticPerformer()

    Column(
        modifier = Modifier.padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        // Rating · price · nightly rate row.
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            hotel.starRating?.let { rating ->
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                    modifier = Modifier.semantics {
                        contentDescription = "${String.format(Locale.US, "%.1f", rating)} star hotel"
                    },
                ) {
                    Row(horizontalArrangement = Arrangement.spacedBy(2.dp)) {
                        for (star in 1..5) {
                            val icon = when {
                                star.toDouble() <= rating -> Icons.Filled.Star
                                star.toDouble() - 0.5 <= rating -> Icons.AutoMirrored.Filled.StarHalf
                                else -> Icons.Filled.StarOutline
                            }
                            val tint = if (star.toDouble() - 0.5 <= rating) Color(0xFFFFC107) else Color.Gray.copy(alpha = 0.3f)
                            Icon(icon, contentDescription = null, tint = tint, modifier = Modifier.size(16.dp))
                        }
                    }
                    Text(
                        text = String.format(Locale.US, "%.1f", rating),
                        style = MaterialTheme.typography.bodyMedium,
                        fontWeight = FontWeight.SemiBold,
                    )
                }
            }

            hotel.priceLabel?.let { price ->
                Text(
                    text = price,
                    style = MaterialTheme.typography.bodyMedium,
                    fontWeight = FontWeight.SemiBold,
                    color = StatusSuccess,
                )
            }

            Spacer(modifier = Modifier.weight(1f))

            hotel.nightlyRateLabel?.let { rate ->
                Text(
                    text = rate,
                    style = MaterialTheme.typography.bodyMedium,
                    fontWeight = FontWeight.Bold,
                )
            }
        }

        hotel.brandLine?.let { brand ->
            Text(
                text = brand,
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }

        HorizontalDivider()

        // Address + directions.
        if (hotel.fullAddress.isNotEmpty()) {
            Row(modifier = Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                Icon(Icons.Filled.LocationOn, contentDescription = null, tint = Color.Red, modifier = Modifier.size(28.dp))
                Spacer(modifier = Modifier.width(10.dp))
                Text(
                    text = hotel.fullAddress,
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.weight(1f),
                )
                if (hotel.hasCoordinates) {
                    IconButton(
                        onClick = { haptic.medium(); onOpenDirections() },
                        modifier = Modifier.semantics { contentDescription = "Get directions to ${hotel.name}" },
                    ) {
                        Icon(Icons.Filled.Directions, contentDescription = null, tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(28.dp))
                    }
                }
            }
        }

        if (hotel.hasCoordinates && distanceText != null) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(Icons.Filled.LocationOn, contentDescription = null, tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(28.dp))
                Spacer(modifier = Modifier.width(10.dp))
                Text(distanceText, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }

        // Check-in / check-out.
        val times = listOfNotNull(
            hotel.checkInTime?.trim()?.takeIf { it.isNotEmpty() }?.let { "Check-in $it" },
            hotel.checkOutTime?.trim()?.takeIf { it.isNotEmpty() }?.let { "Check-out $it" },
        )
        if (times.isNotEmpty()) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(Icons.Filled.AccessTime, contentDescription = null, tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(28.dp))
                Spacer(modifier = Modifier.width(10.dp))
                Text(times.joinToString(" · "), style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }

        // Phone.
        hotel.phone?.trim()?.takeIf { it.isNotEmpty() }?.let { phone ->
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(Icons.Filled.Phone, contentDescription = null, tint = StatusSuccess, modifier = Modifier.size(28.dp))
                Spacer(modifier = Modifier.width(10.dp))
                Text(phone, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.primary)
            }
        }

        // Amenities.
        val amenities = hotel.displayAmenities
        if (amenities.isNotEmpty()) {
            HorizontalDivider()
            Text(
                text = "Amenities",
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.Bold,
                modifier = Modifier.semantics { heading() },
            )
            FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                amenities.forEach { amenity ->
                    Surface(
                        shape = RoundedCornerShape(50),
                        color = MaterialTheme.colorScheme.surfaceVariant,
                    ) {
                        Text(
                            text = amenity,
                            style = MaterialTheme.typography.labelMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier.padding(horizontal = 12.dp, vertical = 6.dp),
                        )
                    }
                }
            }
        }

        // Description.
        val description = hotel.description?.trim()?.takeIf { it.isNotEmpty() }
        if (description != null) {
            HorizontalDivider()
            Text(
                text = "About",
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.Bold,
                modifier = Modifier.semantics { heading() },
            )
            Text(
                text = description,
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }

        // Reviews section is added in ANDP-035 (#252).
    }
}

@Composable
private fun HotelDetailActions(
    hotel: Hotel,
    onBook: () -> Unit,
    onCall: () -> Unit,
    onOpenDirections: () -> Unit,
) {
    val haptic = rememberHapticPerformer()

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        // Primary booking CTA.
        if (hotel.bookingUrl != null) {
            Button(
                onClick = { haptic.medium(); onBook() },
                modifier = Modifier
                    .fillMaxWidth()
                    .semantics { contentDescription = "${hotel.bookCtaLabel} for ${hotel.name}" },
                shape = RoundedCornerShape(12.dp),
                colors = ButtonDefaults.buttonColors(containerColor = BrandOrange),
            ) {
                Icon(Icons.AutoMirrored.Filled.OpenInNew, contentDescription = null, modifier = Modifier.size(18.dp))
                Spacer(modifier = Modifier.width(8.dp))
                Text(hotel.bookCtaLabel, style = MaterialTheme.typography.labelLarge, fontWeight = FontWeight.Bold)
            }
        }

        // Secondary actions.
        val hasCall = !hotel.phone?.trim().isNullOrEmpty()
        if (hasCall || hotel.hasCoordinates) {
            Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                if (hasCall) {
                    OutlinedButton(
                        onClick = { haptic.medium(); onCall() },
                        modifier = Modifier.weight(1f).semantics { contentDescription = "Call ${hotel.name}" },
                        shape = RoundedCornerShape(12.dp),
                    ) {
                        Icon(Icons.Filled.Phone, contentDescription = null, modifier = Modifier.size(18.dp))
                        Spacer(modifier = Modifier.width(6.dp))
                        Text("Call", style = MaterialTheme.typography.labelLarge)
                    }
                }
                if (hotel.hasCoordinates) {
                    OutlinedButton(
                        onClick = { haptic.medium(); onOpenDirections() },
                        modifier = Modifier.weight(1f).semantics { contentDescription = "Get directions to ${hotel.name}" },
                        shape = RoundedCornerShape(12.dp),
                    ) {
                        Icon(Icons.Filled.Directions, contentDescription = null, modifier = Modifier.size(18.dp))
                        Spacer(modifier = Modifier.width(6.dp))
                        Text("Directions", style = MaterialTheme.typography.labelLarge)
                    }
                }
            }
        }
    }
}

@Composable
private fun HotelDetailError(message: String, onRetry: () -> Unit, modifier: Modifier = Modifier) {
    Column(
        modifier = modifier.fillMaxSize().padding(24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Icon(Icons.Filled.Hotel, contentDescription = null, tint = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.size(48.dp))
        Spacer(modifier = Modifier.height(12.dp))
        Text(message, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Spacer(modifier = Modifier.height(12.dp))
        Button(onClick = onRetry) { Text("Retry") }
    }
}
