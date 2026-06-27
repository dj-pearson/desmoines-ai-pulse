package com.desmoines.aipulse.ui.screens.home

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AccessTime
import androidx.compose.material.icons.filled.ConfirmationNumber
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material.icons.filled.LocationOn
import androidx.compose.material.icons.filled.Star
import androidx.compose.material.icons.filled.Timer
import androidx.compose.material.icons.outlined.FavoriteBorder
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import com.desmoines.aipulse.data.model.Event
import com.desmoines.aipulse.ui.components.CachedAsyncImage
import com.desmoines.aipulse.ui.components.CategoryBadge
import com.desmoines.aipulse.ui.components.bestof.BestOfBadge
import com.desmoines.aipulse.ui.components.HeartBurst
import com.desmoines.aipulse.ui.components.icon
import com.desmoines.aipulse.ui.theme.BrandOrange
import com.desmoines.aipulse.ui.theme.DesMoinesInsiderTheme
import com.desmoines.aipulse.ui.theme.Dimens
import com.desmoines.aipulse.ui.theme.GlassIntensity
import com.desmoines.aipulse.ui.theme.PremiumTokens
import com.desmoines.aipulse.ui.theme.StatusSuccess
import com.desmoines.aipulse.ui.theme.glassSurface
import java.time.OffsetDateTime
import java.time.format.DateTimeFormatter
import java.util.Locale

/**
 * Full event card for the vertical events list.
 * Mirrors iOS EventCardView.swift.
 */
@Composable
fun EventCardView(
    event: Event,
    isFavorited: Boolean = false,
    onFavoriteClick: ((String) -> Unit)? = null,
    modifier: Modifier = Modifier
) {
    val category = event.eventCategory

    // Accessibility label
    val accessibilityLabel = buildString {
        append(event.title)
        event.parsedDate?.let {
            append(". ")
            append(it.format(DateTimeFormatter.ofPattern("EEEE, MMMM d, h:mm a", Locale.US)))
        }
        append(". ${event.displayLocation}")
        if (event.isFree) append(". Free event")
        else if (!event.price.isNullOrEmpty()) append(". ${event.price}")
        if (event.isFeatured == true) append(". Featured event")
        event.urgencyLabel?.let { append(". $it") }
    }

    Card(
        modifier = modifier
            .fillMaxWidth()
            .glassSurface(
                shape = RoundedCornerShape(18.dp),
                intensity = GlassIntensity.Card,
                elevation = PremiumTokens.Elevation4,
            )
            .semantics { contentDescription = accessibilityLabel },
        shape = RoundedCornerShape(18.dp),
        colors = CardDefaults.cardColors(containerColor = Color.Transparent),
        elevation = CardDefaults.cardElevation(defaultElevation = 0.dp)
    ) {
        Column {
            // Image section
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(180.dp)
            ) {
                // Event image or category gradient fallback
                if (event.imageUrl != null) {
                    CachedAsyncImage(
                        url = event.imageUrl,
                        contentDescription = null,
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(180.dp)
                    )
                } else {
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(180.dp)
                            .background(
                                Brush.verticalGradient(
                                    colors = listOf(
                                        category.color.copy(alpha = 0.15f),
                                        category.color.copy(alpha = 0.05f)
                                    )
                                )
                            ),
                        contentAlignment = Alignment.Center
                    ) {
                        Icon(
                            imageVector = category.icon,
                            contentDescription = null,
                            modifier = Modifier.size(36.dp),
                            tint = category.color.copy(alpha = 0.4f)
                        )
                    }
                }

                // Overlays
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(10.dp),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.Top
                ) {
                    // Category badge
                    CategoryBadge(category = category)

                    // Favorite button with heart-burst micro-interaction
                    if (onFavoriteClick != null) {
                        var burstKey by remember { mutableIntStateOf(0) }
                        LaunchedEffect(isFavorited) {
                            // Trigger burst only on favoriting, not un-favoriting
                            if (isFavorited) burstKey++
                        }
                        HeartBurst(
                            triggerKey = burstKey,
                            modifier = Modifier.size(40.dp),
                        ) {
                            IconButton(
                                onClick = { onFavoriteClick(event.id) },
                                modifier = Modifier
                                    .size(36.dp)
                                    .glassSurface(
                                        shape = CircleShape,
                                        intensity = GlassIntensity.Chip,
                                        elevation = PremiumTokens.Elevation2,
                                    )
                            ) {
                                Icon(
                                    imageVector = if (isFavorited) Icons.Filled.Favorite else Icons.Outlined.FavoriteBorder,
                                    contentDescription = if (isFavorited) "Remove ${event.title} from saved" else "Save ${event.title}",
                                    tint = if (isFavorited) Color.Red else Color.White,
                                    modifier = Modifier.size(20.dp)
                                )
                            }
                        }
                    }
                }

                // Date badge at bottom right
                event.parsedDate?.let { date ->
                    DateBadge(
                        date = date,
                        modifier = Modifier
                            .align(Alignment.BottomEnd)
                            .padding(10.dp)
                    )
                }
            }

            // Content section
            Column(modifier = Modifier.padding(14.dp)) {
                // Title
                Text(
                    text = event.title,
                    style = MaterialTheme.typography.titleSmall,
                    fontWeight = FontWeight.Bold,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis
                )

                // Best Of award badge (ANDP-039) — shown when this event leads a category.
                BestOfBadge(entityId = event.id, modifier = Modifier.padding(top = 4.dp))

                Spacer(modifier = Modifier.height(Dimens.SpacingSm))

                // Date/time row
                event.parsedDate?.let { date ->
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        modifier = Modifier.clearAndSetSemantics { }
                    ) {
                        Icon(
                            imageVector = Icons.Filled.AccessTime,
                            contentDescription = null,
                            modifier = Modifier.size(14.dp),
                            tint = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                        Spacer(modifier = Modifier.width(4.dp))
                        Text(
                            text = date.format(DateTimeFormatter.ofPattern("EEE, MMM d · h:mm a", Locale.US)),
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis
                        )
                    }
                    Spacer(modifier = Modifier.height(4.dp))
                }

                // Location row
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    modifier = Modifier.clearAndSetSemantics { }
                ) {
                    Icon(
                        imageVector = Icons.Filled.LocationOn,
                        contentDescription = null,
                        modifier = Modifier.size(14.dp),
                        tint = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                    Spacer(modifier = Modifier.width(4.dp))
                    Text(
                        text = event.displayLocation,
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )
                }

                Spacer(modifier = Modifier.height(Dimens.SpacingSm))

                // Bottom row: price + urgency + featured
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    // Price badge
                    if (event.isFree) {
                        Row(
                            modifier = Modifier
                                .clip(RoundedCornerShape(50))
                                .background(StatusSuccess.copy(alpha = 0.12f))
                                .padding(horizontal = 8.dp, vertical = 3.dp),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(4.dp)
                        ) {
                            Icon(
                                imageVector = Icons.Filled.ConfirmationNumber,
                                contentDescription = null,
                                modifier = Modifier.size(12.dp),
                                tint = StatusSuccess
                            )
                            Text(
                                text = "FREE",
                                style = MaterialTheme.typography.labelSmall,
                                fontWeight = FontWeight.Bold,
                                color = StatusSuccess
                            )
                        }
                    } else if (!event.price.isNullOrEmpty()) {
                        Row(
                            modifier = Modifier
                                .clip(RoundedCornerShape(50))
                                .background(MaterialTheme.colorScheme.primary.copy(alpha = 0.1f))
                                .padding(horizontal = 8.dp, vertical = 3.dp),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(4.dp)
                        ) {
                            Icon(
                                imageVector = Icons.Filled.ConfirmationNumber,
                                contentDescription = null,
                                modifier = Modifier.size(12.dp),
                                tint = MaterialTheme.colorScheme.primary
                            )
                            Text(
                                text = event.price,
                                style = MaterialTheme.typography.labelSmall,
                                fontWeight = FontWeight.Medium,
                                color = MaterialTheme.colorScheme.primary
                            )
                        }
                    } else {
                        Spacer(modifier = Modifier.width(1.dp))
                    }

                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        // Urgency label
                        event.urgencyLabel?.let { urgency ->
                            Row(
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(2.dp)
                            ) {
                                Icon(
                                    imageVector = Icons.Filled.Timer,
                                    contentDescription = null,
                                    modifier = Modifier.size(12.dp),
                                    tint = BrandOrange
                                )
                                Text(
                                    text = urgency,
                                    style = MaterialTheme.typography.labelSmall,
                                    fontWeight = FontWeight.Bold,
                                    color = BrandOrange
                                )
                            }
                        }

                        // Featured badge
                        if (event.isFeatured == true) {
                            Row(
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(2.dp)
                            ) {
                                Icon(
                                    imageVector = Icons.Filled.Star,
                                    contentDescription = null,
                                    modifier = Modifier.size(12.dp),
                                    tint = BrandOrange
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
                }
            }
        }
    }
}

/**
 * Date badge showing day of week, day number, and month.
 * Mirrors iOS DateBadge in EventCardView.swift.
 */
@Composable
fun DateBadge(
    date: OffsetDateTime,
    modifier: Modifier = Modifier
) {
    Column(
        modifier = modifier
            .width(48.dp)
            .glassSurface(
                shape = RoundedCornerShape(10.dp),
                intensity = GlassIntensity.Bar,
                elevation = PremiumTokens.Elevation2,
            )
            .padding(vertical = 6.dp),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Text(
            text = date.format(DateTimeFormatter.ofPattern("EEE", Locale.US)).uppercase(),
            fontSize = 9.sp,
            fontWeight = FontWeight.Bold,
            color = MaterialTheme.colorScheme.primary
        )
        Text(
            text = date.format(DateTimeFormatter.ofPattern("d")),
            fontSize = 18.sp,
            fontWeight = FontWeight.Bold,
            color = MaterialTheme.colorScheme.onSurface
        )
        Text(
            text = date.format(DateTimeFormatter.ofPattern("MMM", Locale.US)).uppercase(),
            fontSize = 9.sp,
            fontWeight = FontWeight.Medium,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
    }
}

@Preview(showBackground = true)
@Composable
private fun EventCardViewPreview() {
    DesMoinesInsiderTheme {
        EventCardView(
            event = Event.preview,
            isFavorited = false,
            onFavoriteClick = {},
            modifier = Modifier.padding(16.dp)
        )
    }
}
