package com.desmoines.aipulse.ui.components

import androidx.lifecycle.compose.collectAsStateWithLifecycle
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
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CloudOff
import androidx.compose.material.icons.filled.CloudDone
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.desmoines.aipulse.R
import com.desmoines.aipulse.ui.theme.GlassIntensity
import com.desmoines.aipulse.ui.theme.PremiumTokens
import com.desmoines.aipulse.ui.theme.glassSurface
import com.desmoines.aipulse.util.NetworkMonitor

/**
 * Offline/reconnected banner matching iOS NetworkMonitor banner behavior.
 * Orange banner when offline, green banner for 5 seconds after reconnecting.
 * Displayed at top of MainScreen below status bar.
 */
@Composable
fun OfflineBanner(networkMonitor: NetworkMonitor) {
    val isConnected by networkMonitor.isConnected.collectAsStateWithLifecycle()
    val showReconnected by networkMonitor.showReconnected.collectAsStateWithLifecycle()

    val showOffline = !isConnected
    val showOnline = showReconnected

    // Offline banner
    AnimatedVisibility(
        visible = showOffline,
        enter = expandVertically(expandFrom = Alignment.Top) + fadeIn(),
        exit = shrinkVertically(shrinkTowards = Alignment.Top) + fadeOut()
    ) {
        BannerContent(
            text = stringResource(R.string.offline_no_connection),
            icon = Icons.Filled.CloudOff,
            backgroundColor = Color(0xFFE65100), // Orange
            contentColor = Color.White
        )
    }

    // Reconnected banner
    AnimatedVisibility(
        visible = showOnline && !showOffline,
        enter = expandVertically(expandFrom = Alignment.Top) + fadeIn(),
        exit = shrinkVertically(shrinkTowards = Alignment.Top) + fadeOut()
    ) {
        BannerContent(
            text = stringResource(R.string.offline_back_online),
            icon = Icons.Filled.CloudDone,
            backgroundColor = Color(0xFF2E7D32), // Green
            contentColor = Color.White
        )
    }
}

@Composable
private fun BannerContent(
    text: String,
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    backgroundColor: Color,
    contentColor: Color
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .glassSurface(
                shape = androidx.compose.foundation.shape.RoundedCornerShape(0.dp),
                intensity = GlassIntensity.Bar,
                elevation = PremiumTokens.Elevation4,
            )
            .background(backgroundColor.copy(alpha = 0.85f))
            .padding(horizontal = 16.dp, vertical = 10.dp)
            .semantics { liveRegion = LiveRegionMode.Polite },
        horizontalArrangement = Arrangement.Center,
        verticalAlignment = Alignment.CenterVertically
    ) {
        Icon(
            imageVector = icon,
            contentDescription = null,
            tint = contentColor,
            modifier = Modifier.padding(end = 8.dp)
        )
        Text(
            text = text,
            color = contentColor,
            fontSize = 14.sp,
            fontWeight = FontWeight.SemiBold
        )
    }
}
