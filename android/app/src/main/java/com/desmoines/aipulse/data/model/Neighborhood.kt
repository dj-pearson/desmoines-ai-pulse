package com.desmoines.aipulse.data.model

import androidx.compose.runtime.Immutable

/**
 * A Des Moines neighborhood / suburb for the Neighborhoods hub (ANDP-026).
 * Content (dining, attractions, events) is matched at runtime by area name,
 * with optional device-location "nearby" sorting. Mirrors iOS Neighborhood.
 */
@Immutable
data class Neighborhood(
    val slug: String,
    val name: String,
    val blurb: String,
    val highlights: List<String>,
) {
    /** Names/tokens used to match a listing's city/location/venue to this area. */
    private val matchTerms: List<String> get() = listOf(name)

    /** Whether a free-text location string belongs to this neighborhood. */
    fun matches(location: String?): Boolean {
        if (location.isNullOrEmpty()) return false
        val lower = location.lowercase()
        return matchTerms.any { lower.contains(it.lowercase()) }
    }

    companion object {
        val all: List<Neighborhood> = listOf(
            Neighborhood(
                slug = "east-village", name = "East Village",
                blurb = "Walkable downtown district packed with independent shops, patios, and nightlife.",
                highlights = listOf("Independent boutiques", "Craft cocktail bars", "Farmers' Market"),
            ),
            Neighborhood(
                slug = "west-des-moines", name = "West Des Moines",
                blurb = "Historic Valley Junction plus modern shopping and dining at Jordan Creek.",
                highlights = listOf("Valley Junction", "Jordan Creek Town Center", "Raccoon River Park"),
            ),
            Neighborhood(
                slug = "ankeny", name = "Ankeny",
                blurb = "Fast-growing northern suburb with parks, trails, and a lively dining scene.",
                highlights = listOf("The District", "High Trestle Trail", "Prairie Ridge"),
            ),
            Neighborhood(
                slug = "urbandale", name = "Urbandale",
                blurb = "Family-friendly suburb home to Living History Farms and Walker Johnston Park.",
                highlights = listOf("Living History Farms", "Walker Johnston Park", "Olde Town"),
            ),
            Neighborhood(
                slug = "johnston", name = "Johnston",
                blurb = "Lakeside living near Saylorville with green spaces and growing eateries.",
                highlights = listOf("Saylorville Lake", "Terra Park", "Crown Point"),
            ),
            Neighborhood(
                slug = "clive", name = "Clive",
                blurb = "Greenbelt trails and quiet recreation in the heart of the metro.",
                highlights = listOf("Greenbelt Trail", "Campbell Recreation Area", "Clive Aquatic Center"),
            ),
            Neighborhood(
                slug = "waukee", name = "Waukee",
                blurb = "One of Iowa's fastest-growing cities with new parks and dining.",
                highlights = listOf("Kettlestone", "Sugar Creek", "Triumph Park"),
            ),
            Neighborhood(
                slug = "altoona", name = "Altoona",
                blurb = "Home to Adventureland and Prairie Meadows on the metro's east side.",
                highlights = listOf("Adventureland", "Prairie Meadows", "Lakewood"),
            ),
        )

        fun bySlug(slug: String): Neighborhood? = all.firstOrNull { it.slug == slug }
    }
}
