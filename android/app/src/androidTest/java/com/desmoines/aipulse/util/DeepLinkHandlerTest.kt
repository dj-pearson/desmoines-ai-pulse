package com.desmoines.aipulse.util

import android.content.Intent
import android.net.Uri
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.desmoines.aipulse.util.DeepLinkHandler.Destination
import com.desmoines.aipulse.util.DeepLinkHandler.LinkId
import com.desmoines.aipulse.util.DeepLinkHandler.ScreenDestination
import com.desmoines.aipulse.util.DeepLinkHandler.TabDestination
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith

/**
 * Deep-link routing, on a device (AND-AUDIT-014 AC4).
 *
 * ON A DEVICE FOR A SPECIFIC REASON, not for symmetry with the Compose tests.
 * Every branch in DeepLinkHandler is reached through android.net.Uri, and
 * unitTests.isReturnDefaultValues makes Uri.parse return null in a JVM test - so
 * a unit-test version of this file would compile, run, and assert on nulls. That
 * is the vacuous pass AND-AUDIT-014 exists to name, and this is the class where
 * it would have bitten hardest: the handler had NO tests at all, of either kind,
 * and it is the entry point for every shared link, notification tap and app
 * shortcut in the product.
 *
 * The negative cases carry as much weight as the positive ones. handle()
 * returning true for a URL it did not really understand would swallow the auth
 * callback Supabase needs, and returning a destination for a blank id would push
 * a detail screen with nothing to show.
 */
@RunWith(AndroidJUnit4::class)
class DeepLinkHandlerTest {

    private lateinit var handler: DeepLinkHandler

    @Before
    fun setUp() {
        handler = DeepLinkHandler()
    }

    private fun parse(url: String): Destination? {
        assertTrue("handle() rejected $url", handler.handle(Uri.parse(url)))
        return handler.consumeDestination()
    }

    // MARK: - Universal links

    @Test
    fun universalLinkOpensAnEventDetailBySlug() {
        // The web builds every event URL as <title>-<yyyy-mm-dd>, so this is a
        // slug for AND-OVH-022 to resolve, not a row id.
        val destination = parse("https://desmoinesinsider.com/events/touch-a-truck-2026-05-22")
        assertEquals(Destination.Event(LinkId("touch-a-truck-2026-05-22")), destination)
        assertFalse((destination as Destination.Event).id.isUuid)
    }

    @Test
    fun universalLinkCarriesAUuidFlaggedAsOne() {
        val id = "3f2a6c1e-9b7d-4e2a-8c1f-0a9b8c7d6e5f"
        val destination = parse("https://desmoinesinsider.com/events/$id") as Destination.Event
        assertTrue(destination.id.isUuid)
    }

    @Test
    fun universalLinkOpensEachEntityType() {
        assertEquals(Destination.Restaurant(LinkId("zombie-burger")), parse("https://desmoinesinsider.com/restaurants/zombie-burger"))
        assertEquals(Destination.Attraction(LinkId("pappajohn")), parse("https://desmoinesinsider.com/attractions/pappajohn"))
        assertEquals(Destination.Hotel(LinkId("surety")), parse("https://desmoinesinsider.com/stay/surety"))
        assertEquals(Destination.Article(LinkId("best-tacos-2026")), parse("https://desmoinesinsider.com/articles/best-tacos-2026"))
    }

    @Test
    fun eventLandingPagesAreNotEvents() {
        // iOS IOS-DD-PLATFORM-01: /events/today used to become Event("today").
        assertEquals(Destination.Search("today"), parse("https://desmoinesinsider.com/events/today"))
        assertEquals(Destination.Screen(ScreenDestination.WEEKEND), parse("https://desmoinesinsider.com/events/this-weekend"))
        assertEquals(Destination.Search("free events"), parse("https://desmoinesinsider.com/events/free"))
        assertEquals(Destination.Search("kids events"), parse("https://desmoinesinsider.com/events/kids"))
        assertEquals(Destination.Search("events in ankeny"), parse("https://desmoinesinsider.com/events/ankeny"))
        assertEquals(Destination.Tab(TabDestination.HOME), parse("https://desmoinesinsider.com/events/near-me"))
        assertEquals(Destination.Tab(TabDestination.HOME), parse("https://desmoinesinsider.com/events/may-2026"))
    }

    @Test
    fun restaurantLandingPagesLandOnDining() {
        assertEquals(Destination.Tab(TabDestination.DINING), parse("https://desmoinesinsider.com/restaurants/open-now"))
        assertEquals(Destination.Tab(TabDestination.DINING), parse("https://desmoinesinsider.com/restaurants/new"))
    }

    @Test
    fun stayAndArticlesRootsOpenTheirLists() {
        assertEquals(Destination.Screen(ScreenDestination.HOTELS), parse("https://desmoinesinsider.com/stay"))
        assertEquals(Destination.Screen(ScreenDestination.ARTICLES), parse("https://desmoinesinsider.com/articles"))
    }

    @Test
    fun aSearchLinkCarriesItsQuery() {
        assertEquals(Destination.Search("tacos"), parse("https://desmoinesinsider.com/search?q=tacos"))
        assertEquals("tacos", handler.consumeSearchQuery())
        assertNull(handler.consumeSearchQuery())
        assertEquals(Destination.Tab(TabDestination.SEARCH), parse("https://desmoinesinsider.com/search"))
    }

    @Test
    fun aWwwHostIsStillOurDomain() {
        // Exact equality against both hosts: dropping www would silently break
        // every link shared from a browser that kept it.
        assertEquals(
            Destination.Event(LinkId("abc")),
            parse("https://www.desmoinesinsider.com/events/abc"),
        )
    }

    @Test
    fun singleSegmentPathsLandOnATab() {
        assertEquals(Destination.Tab(TabDestination.HOME), parse("https://desmoinesinsider.com/events"))
        assertEquals(Destination.Tab(TabDestination.DINING), parse("https://desmoinesinsider.com/restaurants"))
    }

    @Test
    fun anExtraPathSegmentStillResolvesToTheEntity() {
        // The first two segments decide, so a tracking suffix does not lose
        // the destination.
        assertEquals(
            Destination.Event(LinkId("abc")),
            parse("https://desmoinesinsider.com/events/abc/share"),
        )
    }

    @Test
    fun anotherDomainIsNotOurs() {
        assertFalse(handler.handle(Uri.parse("https://example.com/events/abc")))
        assertNull(handler.consumeDestination())
    }

    @Test
    fun aLookAlikeHostIsNotOurs() {
        // iOS IOS-DD-PLATFORM-10: a substring host check accepted this.
        assertFalse(handler.handle(Uri.parse("https://desmoinesinsider.com.evil.io/events/abc")))
        assertFalse(handler.handle(Uri.parse("https://evildesmoinesinsider.com/events/abc")))
        assertNull(handler.consumeDestination())
    }

    @Test
    fun plainHttpIsNotOurs() {
        assertFalse(handler.handle(Uri.parse("http://desmoinesinsider.com/events/abc")))
    }

    @Test
    fun anUnknownSectionOpensInTheWebView() {
        assertEquals(
            Destination.Web("https://desmoinesinsider.com/pricing/monthly"),
            parse("https://desmoinesinsider.com/pricing/monthly"),
        )
        assertEquals(
            Destination.Web("https://desmoinesinsider.com/guides"),
            parse("https://desmoinesinsider.com/guides"),
        )
    }

    // MARK: - Custom scheme

    @Test
    fun everyCustomSchemeHostTheManifestDeclaresResolves() {
        // These ten hosts are declared in AndroidManifest.xml. The parser and
        // the manifest have to agree in both directions: a host here that the
        // manifest omits never reaches the process, and a host the manifest
        // declares that this drops opens the app and then does nothing.
        assertEquals(Destination.Event(LinkId("e1")), parse("com.desmoines.aipulse://event/e1"))
        assertEquals(Destination.Restaurant(LinkId("r1")), parse("com.desmoines.aipulse://restaurant/r1"))
        assertEquals(Destination.Attraction(LinkId("a1")), parse("com.desmoines.aipulse://attraction/a1"))
        assertEquals(Destination.Hotel(LinkId("h1")), parse("com.desmoines.aipulse://hotel/h1"))
        assertEquals(Destination.Tab(TabDestination.HOME), parse("com.desmoines.aipulse://home"))
        assertEquals(Destination.Tab(TabDestination.DINING), parse("com.desmoines.aipulse://dining"))
        assertEquals(Destination.Tab(TabDestination.SEARCH), parse("com.desmoines.aipulse://search"))
        assertEquals(Destination.Tab(TabDestination.MAP), parse("com.desmoines.aipulse://map"))
        assertEquals(Destination.Tab(TabDestination.SAVED), parse("com.desmoines.aipulse://favorites"))
        assertEquals(Destination.Tab(TabDestination.PROFILE), parse("com.desmoines.aipulse://profile"))
    }

    @Test
    fun aContentHostWithNoIdIsNotHandled() {
        // Destination.Event("") would push a detail screen that can never load.
        assertFalse(handler.handle(Uri.parse("com.desmoines.aipulse://event")))
        assertNull(handler.consumeDestination())
    }

    @Test
    fun aForeignSchemeIsNotHandled() {
        assertFalse(handler.handle(Uri.parse("com.example.other://event/e1")))
    }

    // MARK: - The auth callback, which must NOT be handled

    @Test
    fun theAuthCallbackIsLeftForSupabase() {
        // Returning true here would swallow the OAuth redirect and strand every
        // Google sign-in on the callback screen.
        assertFalse(handler.handle(Uri.parse("com.desmoines.aipulse://auth-callback#access_token=x")))
        assertNull(handler.consumeDestination())
    }

    @Test
    fun anythingContainingAuthCallbackIsLeftAlone() {
        assertFalse(handler.handle(Uri.parse("https://desmoinesinsider.com/events/auth-callback")))
    }

    // MARK: - Notification taps

    @Test
    fun aNotificationTapRoutesToItsContent() {
        val intent = Intent().putExtra("navigate_to", "event_detail").putExtra("event_id", "e9")

        assertTrue(handler.handleIntent(intent))

        assertEquals(Destination.Event(LinkId("e9")), handler.consumeDestination())
    }

    @Test
    fun contentIdIsAcceptedWhereEventIdIsAbsent() {
        val intent = Intent().putExtra("navigate_to", "restaurant_detail").putExtra("content_id", "r9")

        assertTrue(handler.handleIntent(intent))

        assertEquals(Destination.Restaurant(LinkId("r9")), handler.consumeDestination())
    }

    @Test
    fun aHandledNotificationIntentIsDrainedSoARotationDoesNotReplayIt() {
        val intent = Intent().putExtra("navigate_to", "event_detail").putExtra("event_id", "e9")

        assertTrue(handler.handleIntent(intent))
        handler.consumeDestination()

        // The activity is handed the same Intent again after a configuration
        // change; without the removeExtra calls it would navigate a second time.
        assertFalse(handler.handleIntent(intent))
        assertNull(handler.consumeDestination())
    }

    @Test
    fun aNotificationWithNoContentIdIsNotHandled() {
        val intent = Intent().putExtra("navigate_to", "event_detail")
        assertFalse(handler.handleIntent(intent))
    }

    @Test
    fun anIntentCarryingOnlyDataFallsThroughToUrlParsing() {
        val intent = Intent(Intent.ACTION_VIEW, Uri.parse("https://desmoinesinsider.com/restaurants/r2"))

        assertTrue(handler.handleIntent(intent))

        assertEquals(Destination.Restaurant(LinkId("r2")), handler.consumeDestination())
    }

    @Test
    fun anEmptyIntentIsNotHandled() {
        assertFalse(handler.handleIntent(Intent()))
    }

    // MARK: - Pending state

    @Test
    fun consumingClearsThePendingDestination() {
        handler.handle(Uri.parse("com.desmoines.aipulse://event/e1"))

        assertEquals(Destination.Event(LinkId("e1")), handler.consumeDestination())
        assertNull(handler.consumeDestination())
        assertNull(handler.pendingDestination.value)
    }

    @Test
    fun aSecondLinkReplacesAnUnconsumedFirst() {
        handler.handle(Uri.parse("com.desmoines.aipulse://event/e1"))
        handler.handle(Uri.parse("com.desmoines.aipulse://restaurant/r1"))

        assertEquals(Destination.Restaurant(LinkId("r1")), handler.consumeDestination())
    }
}
