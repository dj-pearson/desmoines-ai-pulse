package com.desmoines.aipulse.ui.components

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.expandVertically
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.shrinkVertically
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Schedule
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.desmoines.aipulse.ui.theme.GlassIntensity
import com.desmoines.aipulse.ui.theme.PremiumTokens
import com.desmoines.aipulse.ui.theme.glassSurface

/**
 * Warns an admin that their session is about to time out (AND-AUDIT-006).
 *
 * SessionTimeoutService publishes a WARNING state five minutes ahead of expiry
 * along with the minutes left, and nothing was showing it. Staying is the
 * action here: tapping "Keep me signed in" records activity, which resets the
 * idle timer and dismisses this.
 *
 * Deliberately shaped like [OfflineBanner] -- same glass bar, same live region,
 * same place in the layout -- because it is the same kind of message and the
 * user should not have to learn a second one.
 */
@Composable
fun SessionTimeoutBanner(
    minutesRemaining: Int?,
    onStaySignedIn: () -> Unit,
) {
    AnimatedVisibility(
        visible = minutesRemaining != null,
        enter = expandVertically(expandFrom = Alignment.Top) + fadeIn(),
        exit = shrinkVertically(shrinkTowards = Alignment.Top) + fadeOut(),
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .glassSurface(
                    shape = RoundedCornerShape(0.dp),
                    intensity = GlassIntensity.Bar,
                    elevation = PremiumTokens.Elevation4,
                )
                .background(Color(0xFF8A5200).copy(alpha = 0.85f))
                .padding(start = 16.dp, end = 8.dp, top = 6.dp, bottom = 6.dp)
                .semantics { liveRegion = LiveRegionMode.Polite },
            horizontalArrangement = Arrangement.Center,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Icon(
                imageVector = Icons.Filled.Schedule,
                contentDescription = null,
                tint = Color.White,
                modifier = Modifier.padding(end = 8.dp),
            )
            Text(
                // minutesRemaining is coerced to at least 1 by the service, so
                // this never reads "0 minutes".
                text = if (minutesRemaining == 1) {
                    "Admin session ends in 1 minute"
                } else {
                    "Admin session ends in $minutesRemaining minutes"
                },
                color = Color.White,
                fontSize = 14.sp,
                fontWeight = FontWeight.SemiBold,
            )
            TextButton(onClick = onStaySignedIn) {
                Text(
                    text = "Keep me signed in",
                    color = Color.White,
                    fontSize = 14.sp,
                    fontWeight = FontWeight.SemiBold,
                )
            }
        }
    }
}
