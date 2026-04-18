package com.desmoines.aipulse.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Brush
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CalendarToday
import androidx.compose.material.icons.filled.CardGiftcard
import androidx.compose.material.icons.filled.Eco
import androidx.compose.material.icons.filled.FamilyRestroom
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material.icons.filled.MusicNote
import androidx.compose.material.icons.filled.Nightlife
import androidx.compose.material.icons.filled.Palette
import androidx.compose.material.icons.filled.Restaurant
import androidx.compose.material.icons.filled.School
import androidx.compose.material.icons.filled.SportsTennis
import androidx.compose.material.icons.filled.Work
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.desmoines.aipulse.data.model.EventCategory
import com.desmoines.aipulse.ui.theme.DesMoinesInsiderTheme

/**
 * Badge size variants matching iOS CategoryBadge BadgeSize enum.
 */
enum class BadgeSize {
    SMALL,
    REGULAR
}

/**
 * Pill-shaped category badge with icon and label.
 * Mirrors iOS CategoryBadge.swift.
 */
@Composable
fun CategoryBadge(
    category: EventCategory,
    size: BadgeSize = BadgeSize.REGULAR,
    modifier: Modifier = Modifier
) {
    val icon = category.icon
    val iconSize = when (size) {
        BadgeSize.SMALL -> 12.dp
        BadgeSize.REGULAR -> 14.dp
    }
    val fontSize = when (size) {
        BadgeSize.SMALL -> 10.sp
        BadgeSize.REGULAR -> 12.sp
    }
    val horizontalPadding = when (size) {
        BadgeSize.SMALL -> 6.dp
        BadgeSize.REGULAR -> 10.dp
    }
    val verticalPadding = when (size) {
        BadgeSize.SMALL -> 3.dp
        BadgeSize.REGULAR -> 5.dp
    }

    Row(
        modifier = modifier
            .shadow(
                elevation = 4.dp,
                shape = CircleShape,
                ambientColor = category.color.copy(alpha = 0.4f),
                spotColor = category.color.copy(alpha = 0.5f),
            )
            .clip(CircleShape)
            .background(
                Brush.linearGradient(
                    colors = listOf(
                        category.color.copy(alpha = 0.95f),
                        category.color.copy(alpha = 0.7f),
                    )
                )
            )
            .border(0.5.dp, Color.White.copy(alpha = 0.25f), CircleShape)
            .padding(horizontal = horizontalPadding + 2.dp, vertical = verticalPadding + 1.dp)
            .semantics { contentDescription = category.displayName },
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(4.dp)
    ) {
        Icon(
            imageVector = icon,
            contentDescription = null,
            modifier = Modifier.size(iconSize),
            tint = Color.White
        )
        Text(
            text = category.displayName,
            color = Color.White,
            fontSize = fontSize,
            fontWeight = FontWeight.SemiBold,
            maxLines = 1
        )
    }
}

/**
 * Maps EventCategory to its corresponding Material Icon.
 */
val EventCategory.icon: ImageVector
    get() = when (this) {
        EventCategory.GENERAL -> Icons.Filled.CalendarToday
        EventCategory.MUSIC -> Icons.Filled.MusicNote
        EventCategory.FOOD -> Icons.Filled.Restaurant
        EventCategory.ART -> Icons.Filled.Palette
        EventCategory.OUTDOOR -> Icons.Filled.Eco
        EventCategory.FAMILY -> Icons.Filled.FamilyRestroom
        EventCategory.SPORTS -> Icons.Filled.SportsTennis
        EventCategory.NIGHTLIFE -> Icons.Filled.Nightlife
        EventCategory.BUSINESS -> Icons.Filled.Work
        EventCategory.EDUCATION -> Icons.Filled.School
        EventCategory.CHARITY -> Icons.Filled.Favorite
        EventCategory.HOLIDAY -> Icons.Filled.CardGiftcard
    }

@Preview(showBackground = true)
@Composable
private fun CategoryBadgePreview() {
    DesMoinesInsiderTheme {
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            CategoryBadge(category = EventCategory.MUSIC)
            CategoryBadge(category = EventCategory.FOOD, size = BadgeSize.SMALL)
        }
    }
}
