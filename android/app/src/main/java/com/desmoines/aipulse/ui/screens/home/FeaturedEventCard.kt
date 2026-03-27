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
import androidx.compose.material.icons.filled.CalendarToday
import androidx.compose.material.icons.filled.ConfirmationNumber
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
import com.desmoines.aipulse.data.model.Event
import com.desmoines.aipulse.ui.components.CachedAsyncImage
import com.desmoines.aipulse.ui.components.CategoryBadge
import com.desmoines.aipulse.ui.components.icon
import com.desmoines.aipulse.ui.theme.DesMoinesInsiderTheme
import com.desmoines.aipulse.ui.theme.Dimens
import com.desmoines.aipulse.ui.theme.StatusSuccess
import java.time.format.DateTimeFormatter
import java.util.Locale

/**
 * Featured event card for the horizontal carousel on the Home screen.
 * 260dp width, image with category badge overlay, title, date, free badge.
 * Mirrors iOS FeaturedEventCard (inline in HomeView.swift).
 */
@Composable
fun FeaturedEventCard(
    event: Event,
    modifier: Modifier = Modifier
) {
    val category = event.eventCategory

    Column(
        modifier = modifier
            .width(Dimens.FeaturedCardWidth)
            .semantics {
                contentDescription = event.featuredCardAccessibilityLabel
            },
    ) {
        // Image with category badge overlay
        Box(
            modifier = Modifier
                .width(Dimens.FeaturedCardWidth)
                .height(150.dp)
                .clip(RoundedCornerShape(Dimens.CardCornerRadius))
        ) {
            if (event.imageUrl != null) {
                CachedAsyncImage(
                    url = event.imageUrl,
                    contentDescription = null,
                    modifier = Modifier
                        .width(Dimens.FeaturedCardWidth)
                        .height(150.dp)
                )
            } else {
                Box(
                    modifier = Modifier
                        .width(Dimens.FeaturedCardWidth)
                        .height(150.dp)
                        .background(
                            Brush.verticalGradient(
                                colors = listOf(category.color, category.color.copy(alpha = 0.7f))
                            )
                        ),
                    contentAlignment = Alignment.Center
                ) {
                    Icon(
                        imageVector = category.icon,
                        contentDescription = null,
                        modifier = Modifier.size(36.dp),
                        tint = Color.White.copy(alpha = 0.6f)
                    )
                }
            }

            // Category badge at bottom left
            CategoryBadge(
                category = category,
                modifier = Modifier
                    .align(Alignment.BottomStart)
                    .padding(8.dp)
            )
        }

        Spacer(modifier = Modifier.height(Dimens.SpacingSm))

        // Title
        Text(
            text = event.title,
            style = MaterialTheme.typography.bodyMedium,
            fontWeight = FontWeight.SemiBold,
            maxLines = 2,
            overflow = TextOverflow.Ellipsis
        )

        Spacer(modifier = Modifier.height(4.dp))

        // Date & Free badge row
        Row(
            modifier = Modifier.width(Dimens.FeaturedCardWidth),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            event.parsedDate?.let { date ->
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(4.dp)
                ) {
                    Icon(
                        imageVector = Icons.Filled.CalendarToday,
                        contentDescription = null,
                        modifier = Modifier.size(12.dp),
                        tint = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                    Text(
                        text = date.format(DateTimeFormatter.ofPattern("MMM d", Locale.US)),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            } ?: Spacer(modifier = Modifier.width(1.dp))

            if (event.isFree) {
                Row(
                    modifier = Modifier
                        .clip(RoundedCornerShape(50))
                        .background(StatusSuccess.copy(alpha = 0.15f))
                        .padding(horizontal = 6.dp, vertical = 2.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(2.dp)
                ) {
                    Icon(
                        imageVector = Icons.Filled.ConfirmationNumber,
                        contentDescription = null,
                        modifier = Modifier.size(10.dp),
                        tint = StatusSuccess
                    )
                    Text(
                        text = "FREE",
                        style = MaterialTheme.typography.labelSmall,
                        fontWeight = FontWeight.Bold,
                        color = StatusSuccess
                    )
                }
            }
        }
    }
}

@Preview(showBackground = true)
@Composable
private fun FeaturedEventCardPreview() {
    DesMoinesInsiderTheme {
        FeaturedEventCard(
            event = Event.preview,
            modifier = Modifier.padding(16.dp)
        )
    }
}
