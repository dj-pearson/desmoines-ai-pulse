package com.desmoines.aipulse.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowRight
import androidx.compose.material.icons.filled.AcUnit
import androidx.compose.material.icons.filled.AccessTime
import androidx.compose.material.icons.filled.CloudQueue
import androidx.compose.material.icons.filled.MusicNote
import androidx.compose.material.icons.filled.Restaurant
import androidx.compose.material.icons.filled.Thunderstorm
import androidx.compose.material.icons.filled.WbSunny
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.desmoines.aipulse.data.remote.WeatherService
import com.desmoines.aipulse.ui.screens.discover.DiscoverFilterContext
import com.desmoines.aipulse.ui.screens.discover.DiscoverMode
import com.desmoines.aipulse.util.LocationService
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import java.time.LocalTime
import javax.inject.Inject
import kotlin.math.roundToInt

@HiltViewModel
class RightNowViewModel @Inject constructor(
    private val weather: WeatherService,
    private val location: LocationService,
) : ViewModel() {

    data class State(val template: Template? = null, val snapshot: WeatherService.Snapshot? = null)

    private val _state = MutableStateFlow(State())
    val state: StateFlow<State> = _state.asStateFlow()

    fun refresh() {
        viewModelScope.launch {
            if (!location.hasLocationPermission()) return@launch
            val loc = try { location.getCurrentLocation() } catch (_: Exception) { return@launch }
            val snap = weather.refresh(loc.latitude, loc.longitude) ?: return@launch
            val now = LocalTime.now()
            val template = chooseTemplate(snap, now.hour)
            _state.value = State(template = template, snapshot = snap)
        }
    }
}

data class Template(
    val id: String,
    val icon: ImageVector,
    val tint: Color,
    val mode: DiscoverMode,
    val filter: DiscoverFilterContext,
    val headline: (Double) -> String,
)

private fun chooseTemplate(snap: WeatherService.Snapshot, hour: Int): Template {
    val openNow = DiscoverFilterContext(openNow = true)
    val today = DiscoverFilterContext()

    if (snap.temperatureF >= 70 && snap.conditions == WeatherService.Conditions.CLEAR) {
        return Template("patios", Icons.Filled.WbSunny, Color(0xFFFF9500), DiscoverMode.RESTAURANTS, openNow) { t ->
            "It's ${t.roundToInt()}° and sunny — check out the patio scene"
        }
    }
    if (snap.temperatureF <= 50 && (snap.conditions == WeatherService.Conditions.RAIN || snap.conditions == WeatherService.Conditions.SNOW)) {
        return Template("cozy", Icons.Filled.CloudQueue, Color(0xFF007AFF), DiscoverMode.RESTAURANTS, openNow) { t ->
            "Cold and wet (${t.roundToInt()}°) — let's find a cozy spot"
        }
    }
    if (snap.conditions == WeatherService.Conditions.SNOW) {
        return Template("comfort", Icons.Filled.AcUnit, Color(0xFF5AC8FA), DiscoverMode.RESTAURANTS, openNow) { _ ->
            "Snowing — let's find comfort food"
        }
    }
    if (snap.conditions == WeatherService.Conditions.THUNDER) {
        return Template("thunder", Icons.Filled.Thunderstorm, Color(0xFF8E8E93), DiscoverMode.RESTAURANTS, openNow) { _ ->
            "Storms rolling in — spots open near you"
        }
    }
    if (hour in 18..23) {
        return Template("liveMusic", Icons.Filled.MusicNote, Color(0xFFAF52DE), DiscoverMode.EVENTS, today) { _ ->
            "Live music tonight"
        }
    }
    if (hour in 11..14) {
        return Template("lunch", Icons.Filled.Restaurant, Color(0xFF34C759), DiscoverMode.RESTAURANTS, openNow) { _ ->
            "Lunch spots open right now"
        }
    }
    return Template("openNow", Icons.Filled.AccessTime, Color(0xFF007AFF), DiscoverMode.RESTAURANTS, openNow) { _ ->
        "Spots open near you"
    }
}

@Composable
fun RightNowRibbon(
    onTap: (DiscoverFilterContext, DiscoverMode) -> Unit,
    viewModel: RightNowViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsState()

    LaunchedEffect(Unit) { viewModel.refresh() }

    val template = state.template ?: return
    val snap = state.snapshot ?: return

    Card(
        onClick = { onTap(template.filter, template.mode) },
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 6.dp),
        shape = RoundedCornerShape(14.dp),
        colors = CardDefaults.cardColors(containerColor = template.tint.copy(alpha = 0.10f)),
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 14.dp, vertical = 12.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Icon(imageVector = template.icon, contentDescription = null, tint = template.tint)
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = template.headline(snap.temperatureF),
                    style = MaterialTheme.typography.bodyMedium,
                    fontWeight = FontWeight.SemiBold,
                )
                Text(
                    text = "Tap to swipe through them",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            Icon(
                imageVector = Icons.AutoMirrored.Filled.KeyboardArrowRight,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}
