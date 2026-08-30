package com.desmoines.aipulse.data.model

import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Forest
import androidx.compose.material.icons.filled.MusicNote
import androidx.compose.material.icons.filled.SportsBasketball
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector

/**
 * A curated content hub (ANDP-027). Music / Sports / Outdoors each map to a
 * config that drives one generic ContentHubScreen — mixing relevant events,
 * themed attractions, and featured dining. Mirrors iOS ContentHub.
 */
enum class ContentHub(
    val id: String,
    val title: String,
    val blurb: String,
    val icon: ImageVector,
    val gradient: List<Color>,
    /** Event category/title terms (OR-matched, case-insensitive). */
    val eventTerms: List<String>,
    val eventsSectionTitle: String,
    /** Attraction types for the "places" rail (empty → no rail). */
    val attractionTypes: List<AttractionType>,
    val attractionsSectionTitle: String,
    val diningSectionTitle: String,
) {
    MUSIC(
        id = "music",
        title = "Live Music",
        blurb = "Your guide to the Des Moines music scene — tonight's shows, venue guides, and upcoming concerts all in one place.",
        icon = Icons.Filled.MusicNote,
        gradient = listOf(Color(0xFF8C5CF5), Color(0xFFA854F7)),
        eventTerms = listOf("Music", "Concert", "Live Music"),
        eventsSectionTitle = "Upcoming shows",
        attractionTypes = listOf(AttractionType.ENTERTAINMENT),
        attractionsSectionTitle = "Venues & entertainment",
        diningSectionTitle = "Dinner before the show",
    ),
    SPORTS(
        id = "sports",
        title = "Sports",
        blurb = "Des Moines is one of the best minor-league sports markets in America. From Iowa Cubs baseball to Iowa Wild hockey, find your next gameday.",
        icon = Icons.Filled.SportsBasketball,
        gradient = listOf(Color(0xFF10B883), Color(0xFF159178)),
        eventTerms = listOf("Sport", "Game", "Baseball", "Hockey", "Basketball", "Football", "Soccer"),
        eventsSectionTitle = "Upcoming games",
        attractionTypes = listOf(AttractionType.SPORTS),
        attractionsSectionTitle = "Venues & arenas",
        diningSectionTitle = "Gameday eats",
    ),
    OUTDOORS(
        id = "outdoors",
        title = "Trails & Outdoors",
        blurb = "Explore the metro's incredible parks and 800+ miles of trails — from the High Trestle Trail Bridge to peaceful urban loops.",
        icon = Icons.Filled.Forest,
        gradient = listOf(Color(0xFF21C55E), Color(0xFF17A34A)),
        eventTerms = listOf("Outdoor", "Festival", "Nature", "Park", "Hike", "Trail", "Market"),
        eventsSectionTitle = "Outdoor events",
        attractionTypes = listOf(AttractionType.PARK, AttractionType.GARDEN, AttractionType.ZOO),
        attractionsSectionTitle = "Parks & nature",
        diningSectionTitle = "Patios & local bites",
    );

    /** Whether [event] belongs to this hub by category or title term match. */
    fun matchesEvent(event: Event): Boolean = eventTerms.any { term ->
        event.category?.contains(term, ignoreCase = true) == true ||
            event.title.contains(term, ignoreCase = true)
    }

    /** Whether [attraction] belongs to this hub's places rail. */
    fun matchesAttraction(attraction: Attraction): Boolean =
        attractionTypes.contains(attraction.attractionType)

    companion object {
        fun byId(id: String): ContentHub? = entries.firstOrNull { it.id == id }
    }
}
