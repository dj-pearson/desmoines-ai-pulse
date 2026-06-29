package com.desmoines.aipulse.util

import com.desmoines.aipulse.data.model.Attraction
import com.desmoines.aipulse.data.model.Event
import com.desmoines.aipulse.data.model.Hotel
import com.desmoines.aipulse.data.model.Restaurant
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

/**
 * ANDP-070: the on-device search representation must carry a deep-linkable URL,
 * a name, and useful keywords for every content type. URLs must match the paths
 * DeepLinkHandler routes (/events, /restaurants, /attractions, /hotels).
 */
class AppSearchSpecTest {

    @Test
    fun `event spec deep-links to the event detail path`() {
        val spec = Event(id = "e1", title = "Jazz in July", date = "").toIndexSpec()
        assertEquals("Jazz in July", spec.name)
        assertEquals("https://desmoinesinsider.com/events/e1", spec.url)
    }

    @Test
    fun `restaurant spec deep-links to the restaurant detail path`() {
        val spec = Restaurant(id = "r1", name = "El Bait Shop").toIndexSpec()
        assertEquals("https://desmoinesinsider.com/restaurants/r1", spec.url)
        // Falls back to a generic keyword when cuisine is absent.
        assertTrue(spec.keywords.contains("restaurant"))
    }

    @Test
    fun `attraction spec deep-links to the attraction detail path with type keyword`() {
        val spec = Attraction(id = "a1", name = "Pappajohn Sculpture Park", type = "Park").toIndexSpec()
        assertEquals("https://desmoinesinsider.com/attractions/a1", spec.url)
        assertTrue(spec.keywords.contains("Park"))
        assertTrue(spec.keywords.contains("Des Moines"))
    }

    @Test
    fun `hotel spec deep-links to the hotel detail path`() {
        val spec = Hotel(id = "h1", name = "Hotel Fort Des Moines", area = "Downtown").toIndexSpec()
        assertEquals("https://desmoinesinsider.com/hotels/h1", spec.url)
        assertTrue(spec.keywords.contains("hotel"))
        assertTrue(spec.keywords.contains("Downtown"))
    }

    @Test
    fun `missing description maps to empty, never null`() {
        val spec = Restaurant(id = "r2", name = "No Desc").toIndexSpec()
        assertEquals("", spec.description)
    }
}
