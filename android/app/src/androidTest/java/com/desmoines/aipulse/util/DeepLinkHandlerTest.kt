package com.desmoines.aipulse.util

import android.content.Intent
import android.net.Uri
import androidx.test.ext.junit.runners.AndroidJUnit4
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

    private fun parse(url: String): DeepLinkHandler.Destination? {
        assertTrue("handle() rejected $url", handler.handle(Uri.parse(url)))
        return handler.consumeDestination()
    }

    // MARK: - Universal links

    @Test
    fun universalLinkOpensAnEventDetail() {
        assertEquals(
            DeepLinkHandler.Destination.Event("touch-a-truck-2026-05-22"),
            parse("https://desmoinesinsider.com/events/touch-a-truck-2026-05-22"),
        )
    }

    @Test
    fun universalLinkOpensEachEntityType() {
        assertEquals(DeepLinkHandler.Destination.Restaurant("zombie-burger"), parse("https://desmoinesinsider.com/restaurants/zombie-burger"))
        assertEquals(DeepLinkHandler.Destination.Attraction("pappajohn"), parse("https://desmoinesinsider.com/attractions/pappajohn"))
        assertEquals(DeepLinkHandler.Destination.Hotel("surety"), parse("https://desmoinesinsider.com/hotels/surety"))
    }

    @Test
    fun aWwwHostIsStillOurDomain() {
        // The check is host.contains(), so this passes - asserted because a
        // future tightening to an equality check would silently break every
        // link shared from a browser that kept the www.
        assertEquals(
            DeepLinkHandler.Destination.Event("abc"),
            parse("https://www.desmoinesinsider.com/events/abc"),
        )
    }

    @Test
    fun singleSegmentPathsLandOnATab() {
        assertEquals(DeepLinkHandler.Destination.Tab(DeepLinkHandler.TabDestination.HOME), parse("https://desmoinesinsider.com/events"))
        assertEquals(DeepLinkHandler.Destination.Tab(DeepLinkHandler.TabDestination.DINING), parse("https://desmoinesinsider.com/restaurants"))
    }

    @Test
    fun anExtraPathSegmentStillResolvesToTheEntity() {
        // pathSegments.size >= 2 takes the first two, so a tracking suffix does
        // not lose the destination.
        assertEquals(
            DeepLinkHandler.Destination.Event("abc"),
            parse("https://desmoinesinsider.com/events/abc/share"),
        )
    }

    @Test
    fun anotherDomainIsNotOurs() {
        assertFalse(handler.handle(Uri.parse("https://example.com/events/abc")))
        assertNull(handler.consumeDestination())
    }

    @Test
    fun anUnknownSectionIsNotHandled() {
        assertFalse(handler.handle(Uri.parse("https://desmoinesinsider.com/pricing/monthly")))
        assertFalse(handler.handle(Uri.parse("https://desmoinesinsider.com/guides")))
    }

    // MARK: - Custom scheme

    @Test
    fun everyCustomSchemeHostTheManifestDeclaresResolves() {
        // These ten hosts are declared in AndroidManifest.xml. The parser and
        // the manifest have to agree in both directions: a host here that the
        // manifest omits never reaches the process, and a host the manifest
        // declares that this drops opens the app and then does nothing.
        assertEquals(DeepLinkHandler.Destination.Event("e1"), parse("com.desmoines.aipulse://event/e1"))
        assertEquals(DeepLinkHandler.Destination.Restaurant("r1"), parse("com.desmoines.aipulse://restaurant/r1"))
        assertEquals(DeepLinkHandler.Destination.Attraction("a1"), parse("com.desmoines.aipulse://attraction/a1"))
        assertEquals(DeepLinkHandler.Destination.Hotel("h1"), parse("com.desmoines.aipulse://hotel/h1"))
        assertEquals(DeepLinkHandler.Destination.Tab(DeepLinkHandler.TabDestination.HOME), parse("com.desmoines.aipulse://home"))
        assertEquals(DeepLinkHandler.Destination.Tab(DeepLinkHandler.TabDestination.DINING), parse("com.desmoines.aipulse://dining"))
        assertEquals(DeepLinkHandler.Destination.Tab(DeepLinkHandler.TabDestination.SEARCH), parse("com.desmoines.aipulse://search"))
        assertEquals(DeepLinkHandler.Destination.Tab(DeepLinkHandler.TabDestination.MAP), parse("com.desmoines.aipulse://map"))
        assertEquals(DeepLinkHandler.Destination.Tab(DeepLinkHandler.TabDestination.SAVED), parse("com.desmoines.aipulse://favorites"))
        assertEquals(DeepLinkHandler.Destination.Tab(DeepLinkHandler.TabDestination.PROFILE), parse("com.desmoines.aipulse://profile"))
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

        assertEquals(DeepLinkHandler.Destination.Event("e9"), handler.consumeDestination())
    }

    @Test
    fun contentIdIsAcceptedWhereEventIdIsAbsent() {
        val intent = Intent().putExtra("navigate_to", "restaurant_detail").putExtra("content_id", "r9")

        assertTrue(handler.handleIntent(intent))

        assertEquals(DeepLinkHandler.Destination.Restaurant("r9"), handler.consumeDestination())
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

        assertEquals(DeepLinkHandler.Destination.Restaurant("r2"), handler.consumeDestination())
    }

    @Test
    fun anEmptyIntentIsNotHandled() {
        assertFalse(handler.handleIntent(Intent()))
    }

    // MARK: - Pending state

    @Test
    fun consumingClearsThePendingDestination() {
        handler.handle(Uri.parse("com.desmoines.aipulse://event/e1"))

        assertEquals(DeepLinkHandler.Destination.Event("e1"), handler.consumeDestination())
        assertNull(handler.consumeDestination())
        assertNull(handler.pendingDestination.value)
    }

    @Test
    fun aSecondLinkReplacesAnUnconsumedFirst() {
        handler.handle(Uri.parse("com.desmoines.aipulse://event/e1"))
        handler.handle(Uri.parse("com.desmoines.aipulse://restaurant/r1"))

        assertEquals(DeepLinkHandler.Destination.Restaurant("r1"), handler.consumeDestination())
    }
}
