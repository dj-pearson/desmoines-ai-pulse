package com.desmoines.aipulse.ui.screens.eventdetail

import android.content.Intent
import androidx.compose.animation.animateContentSize
import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.spring
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.AccessTime
import androidx.compose.material.icons.filled.CalendarMonth
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.ChevronRight
import androidx.compose.material.icons.filled.ConfirmationNumber
import androidx.compose.material.icons.filled.Directions
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material.icons.filled.FavoriteBorder
import androidx.compose.material.icons.filled.Link
import androidx.compose.material.icons.filled.LocationOn
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.MyLocation
import androidx.compose.material.icons.filled.Notifications
import androidx.compose.material.icons.filled.NotificationsNone
import androidx.compose.material.icons.filled.Share
import androidx.compose.material.icons.filled.Star
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
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
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import com.desmoines.aipulse.data.model.Event
import com.desmoines.aipulse.data.model.EventCategory
import com.desmoines.aipulse.data.model.SubscriptionTier
import com.desmoines.aipulse.ui.components.CachedAsyncImage
import com.desmoines.aipulse.ui.components.CategoryBadge
import com.desmoines.aipulse.ui.components.FullScreenImageViewer
import com.desmoines.aipulse.ui.components.LoadingView
import com.desmoines.aipulse.ui.components.PremiumBadge
import com.desmoines.aipulse.ui.theme.BrandOrange
import com.desmoines.aipulse.ui.theme.DesMoinesInsiderTheme
import com.desmoines.aipulse.ui.theme.StatusSuccess
import com.desmoines.aipulse.util.rememberHapticPerformer
import java.time.format.DateTimeFormatter

/**
 * Event Detail screen matching iOS EventDetailView.swift.
 * Contains: hero header, date/time, info, actions, insider tips, and related events.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun EventDetailScreen(
    event: Event?,
    relatedEvents: List<Event>,
    isLoading: Boolean,
    isFavorited: Boolean,
    calendarAdded: Boolean,
    currentTier: SubscriptionTier,
    onNavigateBack: () -> Unit,
    onShare: () -> Unit,
    onToggleFavorite: () -> Unit,
    onAddToCalendar: () -> Unit,
    onOpenDirections: () -> Unit,
    onOpenDirectionsFallback: () -> Unit,
    onShowSubscription: () -> Unit,
    onNavigateToEventDetail: (String) -> Unit,
    onOpenSourceUrl: (String) -> Unit,
) {
    var showImageViewer by remember { mutableStateOf(false) }
    val haptic = rememberHapticPerformer()

    if (isLoading && event == null) {
        LoadingView(message = "Loading event...")
        return
    }

    if (event == null) {
        LoadingView(message = "Event not found")
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
                            contentDescription = "Share event"
                        )
                    }
                    IconButton(onClick = {
                        haptic.medium()
                        onToggleFavorite()
                    }) {
                        Icon(
                            imageVector = if (isFavorited) Icons.Filled.Favorite else Icons.Filled.FavoriteBorder,
                            contentDescription = if (isFavorited) "Remove from saved" else "Save event",
                            tint = if (isFavorited) Color.Red else MaterialTheme.colorScheme.onSurface
                        )
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
            // Hero Image Header
            EventDetailHeader(
                event = event,
                onImageTap = { showImageViewer = true }
            )

            // Date & Time
            EventDetailDateTime(event = event)

            // Info Section (location, price, distance, description)
            EventDetailInfo(
                event = event,
                onOpenDirections = onOpenDirections,
                onOpenDirectionsFallback = onOpenDirectionsFallback
            )

            // Action Buttons
            EventDetailActions(
                event = event,
                hasPremiumAccess = hasPremiumAccess,
                calendarAdded = calendarAdded,
                onAddToCalendar = onAddToCalendar,
                onShowSubscription = onShowSubscription,
                onOpenSourceUrl = onOpenSourceUrl,
            )

            // Insider Tips
            EventDetailInsiderTips(
                event = event,
                hasPremiumAccess = hasPremiumAccess,
                currentTier = currentTier,
                onShowSubscription = onShowSubscription,
            )

            // Related Events
            EventDetailRelated(
                relatedEvents = relatedEvents,
                onNavigateToEventDetail = onNavigateToEventDetail
            )

            Spacer(modifier = Modifier.height(24.dp))
        }
    }

    // Full-screen image viewer
    if (showImageViewer) {
        FullScreenImageViewer(
            imageUrl = event.imageUrl,
            onDismiss = { showImageViewer = false }
        )
    }
}

// region Hero Image Header

@Composable
private fun EventDetailHeader(
    event: Event,
    onImageTap: () -> Unit
) {
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .height(300.dp)
            .clickable(enabled = event.imageUrl != null) { onImageTap() }
    ) {
        // Image or category color placeholder
        if (event.imageUrl != null) {
            CachedAsyncImage(
                url = event.imageUrl,
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
                                event.eventCategory.color,
                                event.eventCategory.color.copy(alpha = 0.7f)
                            )
                        )
                    ),
                contentAlignment = Alignment.Center
            ) {
                // Placeholder icon not shown — category badge below serves that purpose
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

        // Title overlay at bottom
        Column(
            modifier = Modifier
                .align(Alignment.BottomStart)
                .padding(16.dp)
        ) {
            CategoryBadge(category = event.eventCategory)
            Spacer(modifier = Modifier.height(6.dp))
            Text(
                text = event.title,
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

// region Date & Time

@Composable
private fun EventDetailDateTime(event: Event) {
    val date = event.parsedDate ?: return

    val dateFormat = DateTimeFormatter.ofPattern("EEEE, MMMM d, yyyy")
    val timeFormat = DateTimeFormatter.ofPattern("h:mm a")

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 12.dp)
            .semantics(mergeDescendants = true) {
                val label = date.format(dateFormat) + ", " + date.format(timeFormat)
                val urgency = event.urgencyLabel
                contentDescription = if (urgency != null) "$label. $urgency" else label
            },
        verticalAlignment = Alignment.CenterVertically
    ) {
        Icon(
            imageVector = Icons.Filled.CalendarMonth,
            contentDescription = null,
            tint = MaterialTheme.colorScheme.primary,
            modifier = Modifier.size(28.dp)
        )
        Spacer(modifier = Modifier.width(10.dp))
        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = date.format(dateFormat),
                style = MaterialTheme.typography.bodyMedium,
                fontWeight = FontWeight.SemiBold
            )
            Text(
                text = date.format(timeFormat),
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
        }

        // Urgency label — icon + text so urgency is not conveyed by color alone
        event.urgencyLabel?.let { urgency ->
            Surface(
                shape = RoundedCornerShape(50),
                color = BrandOrange
            ) {
                Row(
                    modifier = Modifier.padding(horizontal = 10.dp, vertical = 4.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(4.dp)
                ) {
                    Icon(
                        imageVector = Icons.Filled.AccessTime,
                        contentDescription = null,
                        tint = Color.White,
                        modifier = Modifier.size(14.dp)
                    )
                    Text(
                        text = urgency,
                        style = MaterialTheme.typography.labelSmall,
                        fontWeight = FontWeight.Bold,
                        color = Color.White
                    )
                }
            }
        }
    }
}

// endregion

// region Info Section

@Composable
private fun EventDetailInfo(
    event: Event,
    onOpenDirections: () -> Unit,
    onOpenDirectionsFallback: () -> Unit
) {
    Column(
        modifier = Modifier.padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp)
    ) {
        // Location row
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
            Column(modifier = Modifier.weight(1f)) {
                event.venue?.let { venue ->
                    Text(
                        text = venue,
                        style = MaterialTheme.typography.bodyMedium,
                        fontWeight = FontWeight.SemiBold
                    )
                }
                if (!event.location.isNullOrEmpty()) {
                    Text(
                        text = event.location,
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
                event.city?.let { city ->
                    Text(
                        text = city,
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.7f)
                    )
                }
            }

            if (event.coordinate != null) {
                val context = LocalContext.current
                IconButton(
                    onClick = {
                        try {
                            context.startActivity(onOpenDirections.let {
                                // Try Google Maps first, fallback to generic geo intent
                                val intent = Intent(
                                    Intent.ACTION_VIEW,
                                    android.net.Uri.parse(
                                        "google.navigation:q=${event.coordinate!!.latitude},${event.coordinate!!.longitude}"
                                    )
                                ).apply { setPackage("com.google.android.apps.maps") }
                                if (intent.resolveActivity(context.packageManager) != null) {
                                    intent
                                } else {
                                    Intent(
                                        Intent.ACTION_VIEW,
                                        android.net.Uri.parse(
                                            "geo:${event.coordinate!!.latitude},${event.coordinate!!.longitude}?q=${event.coordinate!!.latitude},${event.coordinate!!.longitude}"
                                        )
                                    )
                                }
                            })
                        } catch (_: Exception) {
                            // Fallback handled
                        }
                    },
                    modifier = Modifier.semantics {
                        contentDescription = "Get directions to ${event.venue ?: event.displayLocation}"
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

        HorizontalDivider()

        // Price row
        Row(
            verticalAlignment = Alignment.CenterVertically
        ) {
            Icon(
                imageVector = Icons.Filled.ConfirmationNumber,
                contentDescription = null,
                tint = StatusSuccess,
                modifier = Modifier.size(28.dp)
            )
            Spacer(modifier = Modifier.width(10.dp))
            if (event.isFree) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(4.dp)
                ) {
                    Icon(
                        imageVector = Icons.Filled.CheckCircle,
                        contentDescription = null,
                        tint = StatusSuccess,
                        modifier = Modifier.size(18.dp)
                    )
                    Text(
                        text = "Free Event",
                        style = MaterialTheme.typography.bodyMedium,
                        fontWeight = FontWeight.SemiBold,
                        color = StatusSuccess
                    )
                }
            } else if (!event.price.isNullOrEmpty()) {
                Text(
                    text = event.price,
                    style = MaterialTheme.typography.bodyMedium,
                    fontWeight = FontWeight.SemiBold
                )
            } else {
                Text(
                    text = "Price not listed",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
        }

        // Distance row (if coordinates available)
        if (event.coordinate != null) {
            Row(
                verticalAlignment = Alignment.CenterVertically
            ) {
                Icon(
                    imageVector = Icons.Filled.MyLocation,
                    contentDescription = null,
                    tint = MaterialTheme.colorScheme.primary,
                    modifier = Modifier.size(28.dp)
                )
                Spacer(modifier = Modifier.width(10.dp))
                Text(
                    text = "Directions available",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
        }
    }

    // Description
    if (event.displayDescription.isNotEmpty()) {
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
                text = event.displayDescription,
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                lineHeight = MaterialTheme.typography.bodyMedium.lineHeight
            )
        }
    }
}

// endregion

// region Actions

@Composable
private fun EventDetailActions(
    event: Event,
    hasPremiumAccess: Boolean,
    calendarAdded: Boolean,
    onAddToCalendar: () -> Unit,
    onShowSubscription: () -> Unit,
    onOpenSourceUrl: (String) -> Unit,
) {
    val haptic = rememberHapticPerformer()

    Column(
        modifier = Modifier.padding(horizontal = 16.dp, vertical = 12.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp)
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            // Add to Calendar — Insider+ feature
            if (event.parsedDate != null) {
                if (hasPremiumAccess) {
                    Button(
                        onClick = {
                            haptic.medium()
                            onAddToCalendar()
                        },
                        modifier = Modifier.weight(1f),
                        enabled = !calendarAdded,
                        shape = RoundedCornerShape(12.dp),
                        colors = ButtonDefaults.buttonColors(
                            containerColor = if (calendarAdded) StatusSuccess else MaterialTheme.colorScheme.primary,
                            disabledContainerColor = StatusSuccess
                        )
                    ) {
                        Icon(
                            imageVector = if (calendarAdded) Icons.Filled.CheckCircle else Icons.Filled.CalendarMonth,
                            contentDescription = null,
                            modifier = Modifier.size(18.dp)
                        )
                        Spacer(modifier = Modifier.width(6.dp))
                        Text(
                            text = if (calendarAdded) "Added" else "Add to Calendar",
                            style = MaterialTheme.typography.labelLarge,
                            fontWeight = FontWeight.Medium
                        )
                    }
                } else {
                    // Locked calendar button for free users
                    Button(
                        onClick = {
                            haptic.medium()
                            onShowSubscription()
                        },
                        modifier = Modifier.weight(1f),
                        shape = RoundedCornerShape(12.dp),
                        colors = ButtonDefaults.buttonColors(
                            containerColor = MaterialTheme.colorScheme.surfaceVariant
                        )
                    ) {
                        Icon(
                            imageVector = Icons.Filled.Lock,
                            contentDescription = null,
                            tint = MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier.size(14.dp)
                        )
                        Spacer(modifier = Modifier.width(4.dp))
                        Text(
                            text = "Calendar",
                            style = MaterialTheme.typography.labelLarge,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                        Spacer(modifier = Modifier.width(4.dp))
                        PremiumBadge()
                    }
                }
            }

            // More Info external link
            if (!event.sourceUrl.isNullOrEmpty()) {
                Button(
                    onClick = { onOpenSourceUrl(event.sourceUrl) },
                    modifier = if (event.parsedDate != null) Modifier.weight(1f) else Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(12.dp),
                    colors = ButtonDefaults.buttonColors(
                        containerColor = MaterialTheme.colorScheme.surfaceVariant
                    )
                ) {
                    Icon(
                        imageVector = Icons.Filled.Link,
                        contentDescription = null,
                        tint = MaterialTheme.colorScheme.onSurface,
                        modifier = Modifier.size(18.dp)
                    )
                    Spacer(modifier = Modifier.width(6.dp))
                    Text(
                        text = "More Info",
                        style = MaterialTheme.typography.labelLarge,
                        fontWeight = FontWeight.Medium,
                        color = MaterialTheme.colorScheme.onSurface
                    )
                }
            }
        }

        // Remind Me button
        if (event.parsedDate != null) {
            // Placeholder — reminder toggle will be wired when notification service is built
            val isReminderSet = false
            Button(
                onClick = {
                    haptic.medium()
                    // Reminder toggle implemented in later story
                },
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(12.dp),
                colors = ButtonDefaults.buttonColors(
                    containerColor = if (isReminderSet) BrandOrange else MaterialTheme.colorScheme.surfaceVariant
                )
            ) {
                Icon(
                    imageVector = if (isReminderSet) Icons.Filled.Notifications else Icons.Filled.NotificationsNone,
                    contentDescription = null,
                    tint = if (isReminderSet) Color.White else MaterialTheme.colorScheme.onSurface,
                    modifier = Modifier.size(18.dp)
                )
                Spacer(modifier = Modifier.width(6.dp))
                Text(
                    text = if (isReminderSet) "Reminder Set" else "Remind Me",
                    style = MaterialTheme.typography.labelLarge,
                    fontWeight = FontWeight.Medium,
                    color = if (isReminderSet) Color.White else MaterialTheme.colorScheme.onSurface
                )
            }
        }
    }
}

// endregion

// region Insider Tips

@Composable
private fun EventDetailInsiderTips(
    event: Event,
    hasPremiumAccess: Boolean,
    currentTier: SubscriptionTier,
    onShowSubscription: () -> Unit,
) {
    if (hasPremiumAccess) {
        InsiderTipsPremiumContent(event = event, currentTier = currentTier)
    } else {
        InsiderTipsFreeTeaser(onShowSubscription = onShowSubscription)
    }
}

@Composable
private fun InsiderTipsPremiumContent(
    event: Event,
    currentTier: SubscriptionTier
) {
    val tipText = remember(event.id) { generateInsiderTip(event) }

    Surface(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 8.dp),
        shape = RoundedCornerShape(16.dp),
        color = BrandOrange.copy(alpha = 0.06f)
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Row(
                verticalAlignment = Alignment.CenterVertically
            ) {
                Icon(
                    imageVector = Icons.Filled.Star,
                    contentDescription = null,
                    tint = BrandOrange,
                    modifier = Modifier.size(24.dp)
                )
                Spacer(modifier = Modifier.width(8.dp))
                Text(
                    text = "Insider Tip",
                    style = MaterialTheme.typography.titleSmall,
                    fontWeight = FontWeight.Bold,
                    color = BrandOrange
                )
                Spacer(modifier = Modifier.weight(1f))
                PremiumBadge(tier = if (currentTier == SubscriptionTier.VIP) SubscriptionTier.VIP else SubscriptionTier.INSIDER)
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
private fun InsiderTipsFreeTeaser(
    onShowSubscription: () -> Unit
) {
    Surface(
        onClick = onShowSubscription,
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 8.dp)
            .semantics { contentDescription = "Unlock Insider Tips by upgrading to a premium plan" },
        shape = RoundedCornerShape(14.dp),
        color = BrandOrange.copy(alpha = 0.06f),
        border = androidx.compose.foundation.BorderStroke(1.dp, BrandOrange.copy(alpha = 0.15f))
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
                    text = "Insider Tips Available",
                    style = MaterialTheme.typography.bodyMedium,
                    fontWeight = FontWeight.SemiBold
                )
                Text(
                    text = "Upgrade to get exclusive tips, calendar sync, and ad-free browsing",
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

private fun generateInsiderTip(event: Event): String {
    val tips = mutableListOf<String>()

    if (event.isFree) {
        tips.add("This is a free event — arrive early for the best spots!")
    }

    val venue = event.venue
    if (venue != null && venue.lowercase().contains("downtown")) {
        tips.add("Parking can fill up fast downtown. Consider using the Des Moines Skywalk system or DART bus.")
    } else if (event.coordinate != null) {
        tips.add("Check the map for nearby parking options. Rideshare drops off nearby too.")
    }

    when (event.eventCategory) {
        EventCategory.MUSIC -> tips.add("Bring ear protection for indoor venues. Outdoor shows are great with a blanket or lawn chair.")
        EventCategory.FOOD -> tips.add("Come hungry! Many food events offer sample-size portions so you can try everything.")
        EventCategory.OUTDOOR -> tips.add("Check the weather forecast and dress in layers. Iowa weather can change quickly!")
        EventCategory.FAMILY -> tips.add("Most family events have activities for all ages. Strollers are usually welcome.")
        EventCategory.ART -> tips.add("Many art events feature local Des Moines artists. Ask about pieces — they love to talk about their work!")
        else -> tips.add("Get there a bit early to find your spot and enjoy the full experience.")
    }

    return tips.joinToString(" ")
}

// endregion

// region Related Events

@Composable
private fun EventDetailRelated(
    relatedEvents: List<Event>,
    onNavigateToEventDetail: (String) -> Unit
) {
    if (relatedEvents.isEmpty()) return

    Column(
        modifier = Modifier.padding(vertical = 16.dp)
    ) {
        Text(
            text = "Related Events",
            style = MaterialTheme.typography.titleMedium,
            fontWeight = FontWeight.Bold,
            modifier = Modifier.padding(horizontal = 16.dp)
        )
        Spacer(modifier = Modifier.height(12.dp))

        LazyRow(
            contentPadding = PaddingValues(horizontal = 16.dp),
            horizontalArrangement = Arrangement.spacedBy(14.dp)
        ) {
            items(relatedEvents, key = { it.id }) { related ->
                RelatedEventCard(
                    event = related,
                    onClick = { onNavigateToEventDetail(related.id) }
                )
            }
        }
    }
}

@Composable
private fun RelatedEventCard(
    event: Event,
    onClick: () -> Unit
) {
    Column(
        modifier = Modifier
            .width(180.dp)
            .clickable(onClick = onClick)
            .semantics { contentDescription = event.featuredCardAccessibilityLabel }
    ) {
        CachedAsyncImage(
            url = event.imageUrl,
            contentDescription = null,
            modifier = Modifier
                .width(180.dp)
                .height(100.dp)
                .clip(RoundedCornerShape(10.dp))
        )
        Spacer(modifier = Modifier.height(6.dp))
        Text(
            text = event.title,
            style = MaterialTheme.typography.labelMedium,
            fontWeight = FontWeight.SemiBold,
            maxLines = 2,
            overflow = TextOverflow.Ellipsis
        )
        event.parsedDate?.let { date ->
            Text(
                text = date.format(DateTimeFormatter.ofPattern("MMM d")),
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
        }
    }
}

// endregion

// region Previews

@Preview(showBackground = true)
@Composable
private fun EventDetailScreenPreview() {
    DesMoinesInsiderTheme {
        EventDetailScreen(
            event = Event.preview,
            relatedEvents = Event.previewList,
            isLoading = false,
            isFavorited = false,
            calendarAdded = false,
            currentTier = SubscriptionTier.INSIDER,
            onNavigateBack = {},
            onShare = {},
            onToggleFavorite = {},
            onAddToCalendar = {},
            onOpenDirections = {},
            onOpenDirectionsFallback = {},
            onShowSubscription = {},
            onNavigateToEventDetail = {},
            onOpenSourceUrl = {},
        )
    }
}

@Preview(showBackground = true)
@Composable
private fun EventDetailScreenFreeUserPreview() {
    DesMoinesInsiderTheme {
        EventDetailScreen(
            event = Event.preview,
            relatedEvents = emptyList(),
            isLoading = false,
            isFavorited = true,
            calendarAdded = false,
            currentTier = SubscriptionTier.FREE,
            onNavigateBack = {},
            onShare = {},
            onToggleFavorite = {},
            onAddToCalendar = {},
            onOpenDirections = {},
            onOpenDirectionsFallback = {},
            onShowSubscription = {},
            onNavigateToEventDetail = {},
            onOpenSourceUrl = {},
        )
    }
}

// endregion
