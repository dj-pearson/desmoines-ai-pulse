package com.desmoines.aipulse.ui.screens.discover

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CalendarMonth
import androidx.compose.material.icons.filled.LocationOn
import androidx.compose.material.icons.filled.Restaurant
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.desmoines.aipulse.data.model.SwipeItem
import com.desmoines.aipulse.data.model.SwipeItemType
import com.desmoines.aipulse.ui.components.CachedAsyncImage

/** Horizontal-drag distance (px) past which a directional intent is committed. */
const val SWIPE_COMMIT_THRESHOLD_PX = 110f

/**
 * A single Discover swipe card. Pure presentation — gestures live in
 * [SwipeCardStack]. [dragOffsetX]/[dragOffsetY] (px) drive the LIKE / NOPE /
 * MORE-LIKE-THIS overlays. Mirrors iOS `SwipeCard`.
 */
@Composable
fun SwipeCard(
    item: SwipeItem,
    modifier: Modifier = Modifier,
    dragOffsetX: Float = 0f,
    dragOffsetY: Float = 0f,
    isTopCard: Boolean = true,
) {
    val likeFraction = if (isTopCard && dragOffsetX > 0) {
        (dragOffsetX / SWIPE_COMMIT_THRESHOLD_PX).coerceIn(0f, 1f)
    } else 0f
    val skipFraction = if (isTopCard && dragOffsetX < 0) {
        (-dragOffsetX / SWIPE_COMMIT_THRESHOLD_PX).coerceIn(0f, 1f)
    } else 0f
    val boostFraction = if (isTopCard && dragOffsetY < 0 && kotlin.math.abs(dragOffsetY) > kotlin.math.abs(dragOffsetX)) {
        (-dragOffsetY / SWIPE_COMMIT_THRESHOLD_PX).coerceIn(0f, 1f)
    } else 0f

    Box(
        modifier = modifier
            .clip(RoundedCornerShape(24.dp))
            .background(MaterialTheme.colorScheme.surfaceVariant),
    ) {
        CachedAsyncImage(
            url = item.imageUrl,
            contentDescription = null,
            modifier = Modifier.fillMaxSize(),
        )

        // Bottom legibility scrim + content.
        Column(
            modifier = Modifier
                .fillMaxSize()
                .background(
                    Brush.verticalGradient(
                        0.45f to Color.Transparent,
                        0.78f to Color.Black.copy(alpha = 0.55f),
                        1f to Color.Black.copy(alpha = 0.88f),
                    ),
                ),
            verticalArrangement = Arrangement.Bottom,
        ) {
            Column(modifier = Modifier.fillMaxWidth().padding(20.dp)) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    modifier = Modifier
                        .clip(RoundedCornerShape(50))
                        .background(Color.White.copy(alpha = 0.18f))
                        .padding(horizontal = 10.dp, vertical = 4.dp),
                ) {
                    Icon(
                        imageVector = if (item.itemType == SwipeItemType.EVENT) {
                            Icons.Filled.CalendarMonth
                        } else {
                            Icons.Filled.Restaurant
                        },
                        contentDescription = null,
                        tint = Color.White,
                        modifier = Modifier.size(14.dp),
                    )
                    Spacer(Modifier.width(6.dp))
                    Text(
                        item.typeLabel,
                        color = Color.White,
                        style = MaterialTheme.typography.labelMedium,
                        fontWeight = FontWeight.SemiBold,
                    )
                }
                Spacer(Modifier.size(8.dp))
                Text(
                    item.title,
                    color = Color.White,
                    style = MaterialTheme.typography.headlineSmall,
                    fontWeight = FontWeight.Bold,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                )
                if (item.subtitle.isNotBlank()) {
                    Spacer(Modifier.size(4.dp))
                    Text(
                        item.subtitle,
                        color = Color.White.copy(alpha = 0.85f),
                        style = MaterialTheme.typography.bodyMedium,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
                if (item.locationText.isNotBlank()) {
                    Spacer(Modifier.size(2.dp))
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(
                            Icons.Filled.LocationOn,
                            contentDescription = null,
                            tint = Color.White.copy(alpha = 0.75f),
                            modifier = Modifier.size(14.dp),
                        )
                        Spacer(Modifier.width(2.dp))
                        Text(
                            item.locationText,
                            color = Color.White.copy(alpha = 0.75f),
                            style = MaterialTheme.typography.bodySmall,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                        )
                    }
                }
            }
        }

        if (isTopCard) {
            SwipeLabel("NOPE", Color(0xFFE53935), Alignment.TopEnd, 14f, skipFraction)
            SwipeLabel("LIKE", Color(0xFF43A047), Alignment.TopStart, -14f, likeFraction)
            SwipeLabel("MORE LIKE THIS", Color(0xFF1E88E5), Alignment.TopCenter, 0f, boostFraction)
        }
    }
}

@Composable
private fun androidx.compose.foundation.layout.BoxScope.SwipeLabel(
    label: String,
    color: Color,
    alignment: Alignment,
    rotationDeg: Float,
    fraction: Float,
) {
    if (fraction <= 0f) return
    Box(
        modifier = Modifier
            .align(alignment)
            .padding(28.dp)
            .alpha(fraction)
            .rotate(rotationDeg)
            .clip(RoundedCornerShape(8.dp))
            .background(Color.White.copy(alpha = 0.85f))
            .padding(horizontal = 16.dp, vertical = 8.dp),
    ) {
        Text(
            label,
            color = color,
            fontWeight = FontWeight.Black,
            fontSize = 26.sp,
        )
    }
}
