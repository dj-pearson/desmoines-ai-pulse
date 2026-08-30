package com.desmoines.aipulse.ui.screens.discover

import androidx.compose.runtime.Immutable
import com.desmoines.aipulse.data.model.DateFilterPreset

/** Discover deck scope. Mirrors iOS DiscoverMode. */
enum class DiscoverMode(val title: String) {
    MIXED("Tonight"),
    EVENTS("Events"),
    RESTAURANTS("Dining"),
}

/**
 * Optional filter context narrowing the Discover deck. Empty by default (full
 * catalog). A "more like this" boost narrows it (event→category, restaurant→
 * cuisine); a typed pre-filter from search/Ask Pulse can lock the mode toggle.
 * Mirrors iOS DiscoverFilterContext.
 */
@Immutable
data class DiscoverFilterContext(
    val cuisines: List<String> = emptyList(),
    val locations: List<String> = emptyList(),
    val priceRanges: List<String> = emptyList(),
    val minRating: Double = 0.0,
    val openNow: Boolean = false,
    val eventCategory: String? = null,
    val datePreset: DateFilterPreset? = null,
    val freeOnly: Boolean = false,
) {
    val isEmpty: Boolean
        get() = cuisines.isEmpty() && locations.isEmpty() && priceRanges.isEmpty() &&
            minRating == 0.0 && !openNow && eventCategory == null && datePreset == null && !freeOnly

    /** JSON-friendly snapshot stored alongside each swipe (source_context). */
    fun toSourceContext(): Map<String, List<String>>? {
        val ctx = buildMap<String, List<String>> {
            if (cuisines.isNotEmpty()) put("cuisines", cuisines)
            if (locations.isNotEmpty()) put("locations", locations)
            if (priceRanges.isNotEmpty()) put("priceRanges", priceRanges)
            eventCategory?.let { put("category", listOf(it)) }
            datePreset?.let { put("datePreset", listOf(it.name)) }
            if (openNow) put("openNow", listOf("true"))
            if (freeOnly) put("freeOnly", listOf("true"))
            if (minRating > 0) put("minRating", listOf(minRating.toString()))
        }
        return ctx.ifEmpty { null }
    }

    /** Human-readable chips for the filter tag strip. */
    fun tags(): List<String> = buildList {
        eventCategory?.let { add(it) }
        addAll(cuisines)
        addAll(locations)
        addAll(priceRanges)
        datePreset?.let { add(it.displayName) }
        if (openNow) add("Open now")
        if (freeOnly) add("Free")
        if (minRating > 0) add("${minRating}★+")
    }
}
