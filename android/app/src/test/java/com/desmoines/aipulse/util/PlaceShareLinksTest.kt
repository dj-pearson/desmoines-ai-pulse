package com.desmoines.aipulse.util

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Test

/**
 * AND-AUDIT-034. Restaurant, attraction and hotel shares ended "Found on Des
 * Moines Insider" with no link. Each now carries the page the web router
 * resolves for it: /restaurants/<slug or id>, /attractions/<slug>, /stay/<slug>.
 */
class PlaceShareLinksTest {

    private val uuid = "3f2c9a10-1b2c-4d5e-8f90-123456789abc"

    @Test
    fun `a restaurant links by slug, as iOS shareURL`() {
        assertEquals(
            "https://desmoinesinsider.com/restaurants/zombie-burger",
            PlaceShareLinks.restaurantUrl("zombie-burger", uuid),
        )
    }

    @Test
    fun `a restaurant with no slug links by id, which the web looks up as a UUID`() {
        assertEquals("https://desmoinesinsider.com/restaurants/$uuid", PlaceShareLinks.restaurantUrl(null, uuid))
        assertEquals("https://desmoinesinsider.com/restaurants/$uuid", PlaceShareLinks.restaurantUrl("  ", uuid))
    }

    @Test
    fun `an attraction links by its slug column`() {
        assertEquals(
            "https://desmoinesinsider.com/attractions/science-center-of-iowa-2",
            PlaceShareLinks.attractionUrl("science-center-of-iowa-2", "Science Center of Iowa"),
        )
    }

    @Test
    fun `an attraction with no slug falls back to the web's createSlug of its name, never its id`() {
        assertEquals(
            "https://desmoinesinsider.com/attractions/science-center-of-iowa-blank-imax",
            PlaceShareLinks.attractionUrl(null, "Science Center of Iowa & Blank IMAX"),
        )
    }

    @Test
    fun `an attraction whose name slugs to nothing gets no link`() {
        assertNull(PlaceShareLinks.attractionUrl(null, "!!!"))
        assertNull(PlaceShareLinks.attractionUrl("", null))
    }

    @Test
    fun `a hotel links to its stay page by slug, and gets no link without one`() {
        assertEquals("https://desmoinesinsider.com/stay/hotel-fort-des-moines", PlaceShareLinks.hotelUrl("hotel-fort-des-moines"))
        assertNull(PlaceShareLinks.hotelUrl(null))
        assertNull(PlaceShareLinks.hotelUrl(""))
    }

    @Test
    fun `a key that is not url-safe is encoded, spaces as percent-20`() {
        assertEquals("https://desmoinesinsider.com/stay/a%20b%2Fc", PlaceShareLinks.hotelUrl("a b/c"))
    }

    @Test
    fun `the footer carries the link in the event share's shape, and stays bare without one`() {
        assertEquals(
            "Found on Des Moines Insider: https://desmoinesinsider.com/stay/x",
            PlaceShareLinks.footer("https://desmoinesinsider.com/stay/x"),
        )
        assertEquals("Found on Des Moines Insider", PlaceShareLinks.footer(null))
    }
}
