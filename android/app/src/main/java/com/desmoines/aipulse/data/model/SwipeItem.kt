package com.desmoines.aipulse.data.model

import androidx.compose.runtime.Immutable

/** Whether a [SwipeItem] wraps an event or a restaurant. */
enum class SwipeItemType { EVENT, RESTAURANT }

/**
 * Type-erased deck item for the Discover swipe stack. Lets a single SwipeCard
 * render either an Event or a Restaurant without knowing about either model.
 * Mirrors iOS `SwipeItem`. Display fields are pre-derived so the card stays
 * pure presentation. [rawId] + [itemType] identify the underlying row for
 * navigation and (later) swipe persistence.
 */
@Immutable
data class SwipeItem(
    val id: String,
    val rawId: String,
    val itemType: SwipeItemType,
    val title: String,
    val subtitle: String,
    val locationText: String,
    val typeLabel: String,
    val imageUrl: String?,
    /** Event category display name — drives "more like this" boost narrowing. */
    val eventCategory: String? = null,
    /** Restaurant cuisine — drives "more like this" boost narrowing. */
    val cuisine: String? = null,
) {
    companion object {
        fun from(event: Event): SwipeItem = SwipeItem(
            id = "event-${event.id}",
            rawId = event.id,
            itemType = SwipeItemType.EVENT,
            title = event.title,
            subtitle = event.urgencyLabel ?: prettyCategory(event.category) ?: "Event",
            locationText = event.displayLocation,
            typeLabel = prettyCategory(event.category) ?: "Event",
            imageUrl = event.imageUrl,
            eventCategory = EventCategory.from(event.category).displayName,
        )

        fun from(restaurant: Restaurant): SwipeItem = SwipeItem(
            id = "restaurant-${restaurant.id}",
            rawId = restaurant.id,
            itemType = SwipeItemType.RESTAURANT,
            title = restaurant.name,
            subtitle = listOfNotNull(
                restaurant.cuisine?.takeIf { it.isNotBlank() },
                restaurant.priceRange?.takeIf { it.isNotBlank() },
            ).joinToString(" · ").ifEmpty { "Restaurant" },
            locationText = restaurant.city.orEmpty(),
            typeLabel = restaurant.cuisine?.takeIf { it.isNotBlank() } ?: "Restaurant",
            imageUrl = restaurant.imageUrl,
            cuisine = restaurant.cuisine?.takeIf { it.isNotBlank() },
        )

        private fun prettyCategory(category: String?): String? =
            category?.takeIf { it.isNotBlank() }
                ?.replaceFirstChar { if (it.isLowerCase()) it.titlecase() else it.toString() }
    }
}
