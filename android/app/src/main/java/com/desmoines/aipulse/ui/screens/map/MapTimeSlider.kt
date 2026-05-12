package com.desmoines.aipulse.ui.screens.map

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import java.time.DayOfWeek
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.format.DateTimeFormatter
import java.time.temporal.TemporalAdjusters
import kotlin.math.abs

/**
 * Horizontal time slider with snap stops (Now, 6pm, 8pm, 10pm, this Sat, next Sat).
 * Drives [MapViewModel.setMapTime] so events filter to ±2h of the slider time and
 * restaurants filter to those open at that time.
 *
 * Mirrors iOS MapTimeSlider.swift.
 */
@Composable
fun MapTimeSlider(
    mapTime: LocalDateTime?,
    eventCount: Int,
    restaurantCount: Int,
    onSelect: (LocalDateTime?) -> Unit,
    modifier: Modifier = Modifier,
) {
    val stops = remember { computeStops(LocalDateTime.now()) }

    Column(
        modifier = modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 8.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        if (mapTime != null) {
            Surface(
                shape = RoundedCornerShape(16.dp),
                color = MaterialTheme.colorScheme.surfaceVariant,
                tonalElevation = 0.dp,
            ) {
                Text(
                    text = countPillText(mapTime, eventCount, restaurantCount),
                    style = MaterialTheme.typography.labelMedium,
                    fontWeight = FontWeight.SemiBold,
                    modifier = Modifier.padding(horizontal = 10.dp, vertical = 4.dp),
                )
            }
        }
        Surface(
            shape = RoundedCornerShape(18.dp),
            color = MaterialTheme.colorScheme.surface.copy(alpha = 0.95f),
            tonalElevation = 2.dp,
        ) {
            Row(
                modifier = Modifier.padding(horizontal = 10.dp, vertical = 6.dp),
                horizontalArrangement = Arrangement.spacedBy(6.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                stops.forEach { stop ->
                    val active = isActive(stop, mapTime)
                    Box(
                        modifier = Modifier
                            .clip(RoundedCornerShape(50))
                            .background(
                                if (active) MaterialTheme.colorScheme.primary
                                else MaterialTheme.colorScheme.surfaceVariant
                            )
                            .clickable { onSelect(stop.dateTime) }
                            .padding(horizontal = 10.dp, vertical = 6.dp),
                    ) {
                        Text(
                            text = stop.label,
                            style = MaterialTheme.typography.labelSmall,
                            fontWeight = if (active) FontWeight.Bold else FontWeight.Medium,
                            color = if (active) MaterialTheme.colorScheme.onPrimary
                            else MaterialTheme.colorScheme.onSurface,
                        )
                    }
                }
            }
        }
    }
}

private fun isActive(stop: TimeSliderStop, mapTime: LocalDateTime?): Boolean {
    if (stop.dateTime == null) return mapTime == null
    if (mapTime == null) return false
    val a = java.time.Duration.between(stop.dateTime, mapTime).abs().toMinutes()
    return a < 30
}

private fun countPillText(mapTime: LocalDateTime, eventCount: Int, restaurantCount: Int): String {
    val fmt = DateTimeFormatter.ofPattern("h:mm a EEEE")
    return "$eventCount events + $restaurantCount restaurants open at ${mapTime.format(fmt)}"
}

private data class TimeSliderStop(val id: String, val label: String, val dateTime: LocalDateTime?)

private fun computeStops(now: LocalDateTime): List<TimeSliderStop> {
    val out = mutableListOf(TimeSliderStop("now", "Now", null))
    val startOfToday = now.toLocalDate().atStartOfDay()

    listOf(18 to "6pm", 20 to "8pm", 22 to "10pm").forEach { (hour, label) ->
        val target = startOfToday.plusHours(hour.toLong())
        if (target.isAfter(now)) {
            out.add(TimeSliderStop("today-$hour", label, target))
        }
    }

    val today = now.toLocalDate()
    val thisSat: LocalDate = if (today.dayOfWeek == DayOfWeek.SATURDAY) today.plusDays(7)
    else today.with(TemporalAdjusters.next(DayOfWeek.SATURDAY))
    out.add(TimeSliderStop("this-sat", "this Sat", thisSat.atTime(20, 0)))
    out.add(TimeSliderStop("next-sat", "next Sat", thisSat.plusDays(7).atTime(20, 0)))

    return out
}
