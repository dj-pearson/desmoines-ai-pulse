package com.desmoines.aipulse.ui.components.bestof

import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.EmojiEvents
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp

/**
 * App-wide map of Best Of winners (entity id → "Best {Category}"), provided once
 * near the app root from [com.desmoines.aipulse.data.repository.BestOfWinnersStore]
 * and read by [BestOfBadge] on cards. Defaults to empty so previews/tests are safe.
 */
val LocalBestOfAwards = staticCompositionLocalOf { emptyMap<String, String>() }

/**
 * A small "🏆 Best {Category}" award badge shown on a restaurant/attraction/event
 * card when that entity currently leads a voting category. Renders nothing when
 * the entity hasn't won anything. Mirrors iOS Best Of winner badges.
 */
@Composable
fun BestOfBadge(entityId: String?, modifier: Modifier = Modifier) {
    val label = entityId?.let { LocalBestOfAwards.current[it] } ?: return
    Surface(
        modifier = modifier,
        shape = MaterialTheme.shapes.small,
        color = MaterialTheme.colorScheme.tertiaryContainer,
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 8.dp, vertical = 3.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Icon(
                Icons.Filled.EmojiEvents,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.onTertiaryContainer,
                modifier = Modifier.size(12.dp),
            )
            Spacer(Modifier.width(4.dp))
            Text(
                text = label,
                style = MaterialTheme.typography.labelSmall,
                fontWeight = FontWeight.SemiBold,
                color = MaterialTheme.colorScheme.onTertiaryContainer,
            )
        }
    }
}
