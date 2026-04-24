package com.desmoines.aipulse.util

import android.content.Context
import android.net.Uri
import com.desmoines.aipulse.data.model.Event
import com.desmoines.aipulse.data.model.Restaurant
import com.google.firebase.appindexing.FirebaseAppIndex
import com.google.firebase.appindexing.Indexable
import com.google.firebase.appindexing.builders.Indexables
import dagger.hilt.android.qualifiers.ApplicationContext
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Indexes app content (events, restaurants) into Firebase App Indexing
 * for on-device search discovery via Google app and Android system search.
 *
 * Mirrors iOS SpotlightService.swift.
 */
@Singleton
class AppSearchService @Inject constructor(
    @param:ApplicationContext private val context: Context,
) {

    private val appIndex: FirebaseAppIndex by lazy {
        FirebaseAppIndex.getInstance(context)
    }

    /**
     * Index a list of events for on-device search.
     * Creates Indexable objects with title, description, keywords, URL, and image.
     */
    fun indexEvents(events: List<Event>) {
        if (events.isEmpty()) return

        val indexables = events.map { event ->
            val keywords = listOfNotNull(
                event.category ?: "event",
                event.venue,
                event.city ?: "Des Moines"
            ).filter { it.isNotEmpty() }

            val url = "https://desmoinesinsider.com/events/${event.id}"

            Indexables.digitalDocumentBuilder()
                .setName(event.title)
                .setDescription(event.displayDescription ?: "")
                .setUrl(url)
                .apply {
                    event.imageUrl?.let { setImage(it) }
                    setKeywords(*keywords.toTypedArray())
                }
                .setMetadata(
                    Indexable.Metadata.Builder()
                        .setWorksOffline(true)
                )
                .build()
        }.toTypedArray()

        appIndex.update(*indexables)
    }

    /**
     * Index a list of restaurants for on-device search.
     * Creates Indexable objects with name, cuisine, price range, location, URL.
     */
    fun indexRestaurants(restaurants: List<Restaurant>) {
        if (restaurants.isEmpty()) return

        val indexables = restaurants.map { restaurant ->
            val keywords = listOfNotNull(
                restaurant.cuisine ?: "restaurant",
                restaurant.city ?: "Des Moines",
                restaurant.priceRange
            ).filter { it.isNotEmpty() }

            val url = "https://desmoinesinsider.com/restaurants/${restaurant.id}"

            Indexables.digitalDocumentBuilder()
                .setName(restaurant.name)
                .setDescription(restaurant.description ?: "")
                .setUrl(url)
                .apply {
                    restaurant.imageUrl?.let { setImage(it) }
                    setKeywords(*keywords.toTypedArray())
                }
                .setMetadata(
                    Indexable.Metadata.Builder()
                        .setWorksOffline(true)
                )
                .build()
        }.toTypedArray()

        appIndex.update(*indexables)
    }

    /**
     * Remove all indexed items from Firebase App Index.
     */
    fun removeAllItems() {
        appIndex.removeAll()
    }
}
