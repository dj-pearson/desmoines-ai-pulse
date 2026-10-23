package com.desmoines.aipulse.util

import com.desmoines.aipulse.util.DeepLinkHandler.Companion.isFirstPartyWebUrl
import com.desmoines.aipulse.util.DeepLinkHandler.Companion.webDestination
import com.desmoines.aipulse.util.DeepLinkHandler.Destination
import com.desmoines.aipulse.util.DeepLinkHandler.LinkId
import com.desmoines.aipulse.util.DeepLinkHandler.ScreenDestination
import com.desmoines.aipulse.util.DeepLinkHandler.TabDestination
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.junit.jupiter.params.ParameterizedTest
import org.junit.jupiter.params.provider.ValueSource

/**
 * The string half of the deep-link parser (AND-OVH-021), on the JVM.
 *
 * DeepLinkHandlerTest covers the same routes through android.net.Uri on a
 * device, which only the CI emulator runs. These run in every
 * testDebugUnitTest, so a regression in the path table is caught locally.
 * The cases are the iOS DeepLinkHandler.swift ones (parseUniversalLink,
 * eventDestination).
 */
class DeepLinkWebDestinationTest {

    private fun web(path: String, q: String? = null): Destination {
        val segments = path.split('/').filter { it.isNotEmpty() }
        return webDestination(segments, q, "https://desmoinesinsider.com$path")
    }

    // MARK: - Host

    @Test
    fun `only https on our two hosts is first party`() {
        assertTrue(isFirstPartyWebUrl("https", "desmoinesinsider.com"))
        assertTrue(isFirstPartyWebUrl("https", "www.desmoinesinsider.com"))
        assertTrue(isFirstPartyWebUrl("HTTPS", "WWW.DesMoinesInsider.com"))
    }

    @Test
    fun `a look-alike host or plain http is not first party`() {
        assertFalse(isFirstPartyWebUrl("https", "desmoinesinsider.com.evil.io"))
        assertFalse(isFirstPartyWebUrl("https", "evildesmoinesinsider.com"))
        assertFalse(isFirstPartyWebUrl("https", "api.desmoinesinsider.com"))
        assertFalse(isFirstPartyWebUrl("http", "desmoinesinsider.com"))
        assertFalse(isFirstPartyWebUrl("https", null))
        assertFalse(isFirstPartyWebUrl(null, "desmoinesinsider.com"))
    }

    // MARK: - Events

    @Test
    fun `an event slug is a slug, not an id`() {
        val destination = web("/events/touch-a-truck-2026-05-22")
        assertEquals(Destination.Event(LinkId("touch-a-truck-2026-05-22")), destination)
        assertFalse((destination as Destination.Event).id.isUuid)
    }

    @Test
    fun `an event UUID is flagged as one`() {
        val id = "3f2a6c1e-9b7d-4e2a-8c1f-0a9b8c7d6e5f"
        val destination = web("/events/$id") as Destination.Event
        assertEquals(id, destination.id.value)
        assertTrue(destination.id.isUuid)
    }

    @Test
    fun `event landing pages go to the matching list, never to a detail`() {
        assertEquals(Destination.Screen(ScreenDestination.WEEKEND), web("/events/this-weekend"))
        assertEquals(Destination.Search("today"), web("/events/today"))
        assertEquals(Destination.Search("tonight"), web("/events/tonight"))
        assertEquals(Destination.Search("free events"), web("/events/free"))
        assertEquals(Destination.Search("kids events"), web("/events/kids"))
        assertEquals(Destination.Search("events in west des moines"), web("/events/west-des-moines"))
        assertEquals(Destination.Search("events in ankeny"), web("/events/ankeny"))
        assertEquals(Destination.Tab(TabDestination.HOME), web("/events/near-me"))
        assertEquals(Destination.Tab(TabDestination.HOME), web("/events/date-night"))
        assertEquals(Destination.Tab(TabDestination.HOME), web("/events/may-2026"))
    }

    @ParameterizedTest
    @ValueSource(
        strings = [
            "today", "tonight", "this-weekend", "near-me", "free", "kids", "date-night",
            "west-des-moines", "ankeny", "urbandale", "johnston", "altoona", "clive",
            "windsor-heights", "waukee", "series", "october-2026",
        ],
    )
    fun `no events landing segment becomes an Event`(segment: String) {
        assertFalse(web("/events/$segment") is Destination.Event)
    }

    @Test
    fun `an event series page opens on the web`() {
        assertEquals(
            Destination.Web("https://desmoinesinsider.com/events/series/jazz-in-july"),
            web("/events/series/jazz-in-july"),
        )
    }

    @Test
    fun `a malformed event segment lands on Home`() {
        assertEquals(Destination.Tab(TabDestination.HOME), web("/events/Not_A_Slug"))
    }

    // MARK: - Restaurants, attractions

    @Test
    fun `restaurant landing pages go to Dining, a slug to the detail`() {
        assertEquals(Destination.Tab(TabDestination.DINING), web("/restaurants/open-now"))
        assertEquals(Destination.Tab(TabDestination.DINING), web("/restaurants/new"))
        assertEquals(Destination.Tab(TabDestination.DINING), web("/restaurants/dietary/vegan"))
        assertEquals(Destination.Restaurant(LinkId("zombie-burger")), web("/restaurants/zombie-burger"))
    }

    @Test
    fun `an attraction slug opens the detail, the list opens on the web`() {
        assertEquals(Destination.Attraction(LinkId("pappajohn")), web("/attractions/pappajohn"))
        assertEquals(Destination.Web("https://desmoinesinsider.com/attractions"), web("/attractions"))
    }

    // MARK: - Stay, articles, search

    @Test
    fun `stay links open hotels`() {
        assertEquals(Destination.Hotel(LinkId("surety-hotel")), web("/stay/surety-hotel"))
        assertEquals(Destination.Screen(ScreenDestination.HOTELS), web("/stay"))
        assertEquals(
            Destination.Web("https://desmoinesinsider.com/stay/near/wells-fargo-arena"),
            web("/stay/near/wells-fargo-arena"),
        )
    }

    @Test
    fun `article links open articles`() {
        assertEquals(Destination.Article(LinkId("best-tacos-2026")), web("/articles/best-tacos-2026"))
        assertEquals(Destination.Screen(ScreenDestination.ARTICLES), web("/articles"))
    }

    @Test
    fun `a search link carries its trimmed, capped query`() {
        assertEquals(Destination.Search("tacos"), web("/search", q = "  tacos "))
        assertEquals(Destination.Search("x".repeat(120)), web("/search", q = "x".repeat(300)))
        assertEquals(Destination.Tab(TabDestination.SEARCH), web("/search", q = "   "))
        assertEquals(Destination.Tab(TabDestination.SEARCH), web("/search"))
        assertEquals(Destination.Tab(TabDestination.SEARCH), web("/search/advanced"))
    }

    // MARK: - Fallbacks

    @Test
    fun `an unknown path opens in the in-app WebView`() {
        assertEquals(
            Destination.Web("https://desmoinesinsider.com/pricing/monthly"),
            web("/pricing/monthly"),
        )
        assertEquals(Destination.Web("https://desmoinesinsider.com/guides"), web("/guides"))
    }

    @Test
    fun `the root lands on Home and section roots on their tab`() {
        assertEquals(Destination.Tab(TabDestination.HOME), web("/"))
        assertEquals(Destination.Tab(TabDestination.HOME), web("/events"))
        assertEquals(Destination.Tab(TabDestination.DINING), web("/restaurants"))
    }

    @Test
    fun `an app id rejects anything that would break a nav route`() {
        assertEquals(LinkId("e1"), DeepLinkHandler.appLinkId("e1"))
        assertEquals(null, DeepLinkHandler.appLinkId("a/b"))
        assertEquals(null, DeepLinkHandler.appLinkId(""))
    }
}
