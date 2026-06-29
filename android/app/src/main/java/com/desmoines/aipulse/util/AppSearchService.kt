package com.desmoines.aipulse.util

import android.content.Context
import com.desmoines.aipulse.data.model.Attraction
import com.desmoines.aipulse.data.model.Event
import com.desmoines.aipulse.data.model.Hotel
import com.desmoines.aipulse.data.model.Restaurant
import com.google.firebase.appindexing.FirebaseAppIndex
import com.google.firebase.appindexing.Indexable
import com.google.firebase.appindexing.builders.Indexables
import dagger.hilt.android.qualifiers.ApplicationContext
import javax.inject.Inject
import javax.inject.Singleton

/** Canonical web origin for deep-linkable content URLs (matches DeepLinkHandler). */
private const val WEB_ORIGIN = "https://desmoinesinsider.com"

/**
 * A content row's on-device search representation, independent of the Firebase
 * SDK so the name/description/url/keyword mapping is unit-testable. (ANDP-070)
 */
data class IndexSpec(
    val name: String,
    val description: String,
    val url: String,
    val imageUrl: String?,
    val keywords: List<String>,
)

fun Event.toIndexSpec(): IndexSpec = IndexSpec(
    name = title,
    description = displayDescription ?: "",
    url = "$WEB_ORIGIN/events/$id",
    imageUrl = imageUrl,
    keywords = listOfNotNull(category ?: "event", venue, city ?: "Des Moines").filter { it.isNotBlank() },
)

fun Restaurant.toIndexSpec(): IndexSpec = IndexSpec(
    name = name,
    description = description ?: "",
    url = "$WEB_ORIGIN/restaurants/$id",
    imageUrl = imageUrl,
    keywords = listOfNotNull(cuisine ?: "restaurant", city ?: "Des Moines", priceRange).filter { it.isNotBlank() },
)

fun Attraction.toIndexSpec(): IndexSpec = IndexSpec(
    name = name,
    description = description ?: "",
    url = "$WEB_ORIGIN/attractions/$id",
    imageUrl = imageUrl,
    keywords = listOfNotNull(type.ifBlank { "attraction" }, location, "Des Moines").filter { it.isNotBlank() },
)

fun Hotel.toIndexSpec(): IndexSpec = IndexSpec(
    name = name,
    description = description ?: "",
    url = "$WEB_ORIGIN/hotels/$id",
    imageUrl = imageUrl,
    keywords = listOfNotNull("hotel", area, city ?: "Des Moines", priceRange).filter { it.isNotBlank() },
)

/**
 * Indexes app content (events, restaurants, attractions, hotels) into Firebase
 * App Indexing for on-device search discovery via the Google app and Android
 * system search. Each indexed item carries a deep-linkable web URL that
 * DeepLinkHandler routes to the right detail screen.
 *
 * Indexing is user-toggleable ([isIndexingEnabled] / [setIndexingEnabled]);
 * turning it off purges everything already indexed. Mirrors iOS SpotlightService.
 */
@Singleton
class AppSearchService @Inject constructor(
    @param:ApplicationContext private val context: Context,
    private val secureStorage: SecureStorage,
) {

    private val appIndex: FirebaseAppIndex by lazy {
        FirebaseAppIndex.getInstance(context)
    }

    /** On-device indexing is opt-out — enabled unless the user disabled it in Settings. */
    fun isIndexingEnabled(): Boolean = secureStorage.loadBoolean(KEY_INDEXING_ENABLED, defaultValue = true)

    /**
     * Toggle on-device indexing. Disabling immediately purges everything already
     * indexed so stale results can't linger in system search.
     */
    fun setIndexingEnabled(enabled: Boolean) {
        secureStorage.saveBoolean(KEY_INDEXING_ENABLED, enabled)
        if (!enabled) removeAllItems()
    }

    fun indexEvents(events: List<Event>) = index(events.map { it.toIndexSpec() })

    fun indexRestaurants(restaurants: List<Restaurant>) = index(restaurants.map { it.toIndexSpec() })

    fun indexAttractions(attractions: List<Attraction>) = index(attractions.map { it.toIndexSpec() })

    fun indexHotels(hotels: List<Hotel>) = index(hotels.map { it.toIndexSpec() })

    private fun index(specs: List<IndexSpec>) {
        if (specs.isEmpty() || !isIndexingEnabled()) return

        val indexables = specs.map { spec ->
            Indexables.digitalDocumentBuilder()
                .setName(spec.name)
                .setDescription(spec.description)
                .setUrl(spec.url)
                .apply {
                    spec.imageUrl?.let { setImage(it) }
                    if (spec.keywords.isNotEmpty()) setKeywords(*spec.keywords.toTypedArray())
                }
                .setMetadata(Indexable.Metadata.Builder().setWorksOffline(true))
                .build()
        }.toTypedArray()

        appIndex.update(*indexables)
    }

    /** Remove all indexed items from Firebase App Index. */
    fun removeAllItems() {
        appIndex.removeAll()
    }

    private companion object {
        const val KEY_INDEXING_ENABLED = "app_search_indexing_enabled"
    }
}
