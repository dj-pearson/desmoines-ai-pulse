package com.desmoines.aipulse.util

import com.desmoines.aipulse.util.DeepLinkHandler.Destination
import com.desmoines.aipulse.util.DeepLinkHandler.TabDestination
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

/**
 * /restaurants/open-now carries a filter the Dining view model applies after
 * MainScreen has navigated, so the handler holds it until then. These pin the
 * hand-off: published once, read once, and never set by a plain Dining link.
 */
class DeepLinkPendingFilterTest {

    @Test
    fun `an open-now link holds the filter until it is consumed once`() {
        val handler = DeepLinkHandler()
        handler.publish(Destination.RestaurantsOpenNow)

        assertEquals(Destination.RestaurantsOpenNow, handler.pendingDestination.value)
        assertTrue(handler.pendingRestaurantsOpenNow.value)
        assertTrue(handler.consumeRestaurantsOpenNow())
        assertFalse(handler.consumeRestaurantsOpenNow())
        assertFalse(handler.pendingRestaurantsOpenNow.value)
    }

    @Test
    fun `a plain Dining link does not turn Open now on`() {
        val handler = DeepLinkHandler()
        handler.publish(Destination.Tab(TabDestination.DINING))

        assertFalse(handler.pendingRestaurantsOpenNow.value)
        assertFalse(handler.consumeRestaurantsOpenNow())
    }

    @Test
    fun `consuming the destination leaves the filter for the view model`() {
        val handler = DeepLinkHandler()
        handler.publish(Destination.RestaurantsOpenNow)

        assertEquals(Destination.RestaurantsOpenNow, handler.consumeDestination())
        assertTrue(handler.pendingRestaurantsOpenNow.value)
    }

    // /events/kids hands its filter to SearchViewModel the same way (AND-AUDIT-041).

    @Test
    fun `a kids link holds the filter until it is consumed once`() {
        val handler = DeepLinkHandler()
        handler.publish(Destination.KidsEvents)

        assertEquals(Destination.KidsEvents, handler.pendingDestination.value)
        assertTrue(handler.pendingKidsEvents.value)
        assertTrue(handler.consumeKidsEvents())
        assertFalse(handler.consumeKidsEvents())
    }

    @Test
    fun `a kids link sets no search text, and a search link no kids filter`() {
        val handler = DeepLinkHandler()
        handler.publish(Destination.KidsEvents)
        assertNull(handler.pendingSearchQuery.value)
        assertFalse(handler.pendingRestaurantsOpenNow.value)

        val other = DeepLinkHandler()
        other.publish(Destination.Search("kids events"))
        assertFalse(other.pendingKidsEvents.value)
    }
}
