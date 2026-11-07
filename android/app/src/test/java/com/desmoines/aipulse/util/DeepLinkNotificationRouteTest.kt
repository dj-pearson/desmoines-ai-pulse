package com.desmoines.aipulse.util

import com.desmoines.aipulse.util.DeepLinkHandler.Companion.EXTRA_PUSH_ID
import com.desmoines.aipulse.util.DeepLinkHandler.Companion.EXTRA_PUSH_TYPE
import com.desmoines.aipulse.util.DeepLinkHandler.Companion.EXTRA_PUSH_URL
import com.desmoines.aipulse.util.DeepLinkHandler.Companion.NOTIFICATION_EXTRA_KEYS
import com.desmoines.aipulse.util.DeepLinkHandler.Companion.notificationExtrasFromPush
import com.desmoines.aipulse.util.DeepLinkHandler.Companion.notificationRoute
import com.desmoines.aipulse.util.DeepLinkHandler.Destination
import com.desmoines.aipulse.util.DeepLinkHandler.LinkId
import com.desmoines.aipulse.util.DeepLinkHandler.NotificationRoute
import com.desmoines.aipulse.util.DeepLinkHandler.TabDestination
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

/**
 * AND-AUDIT-026. A push tap's routing, on the JVM.
 *
 * iOS routes a push by `url`, then by `type` + `id`
 * (DeepLinkHandler.swift handleNotification). Android read only navigate_to
 * and content_id, so a payload written for iOS opened Android to Home, and
 * no navigate_to value reached a hotel or an article at all. These cases run
 * the FCM data map through the same two functions the service and the
 * activity use, so the payload-to-destination contract is tested end to end
 * short of android.content.Intent.
 */
class DeepLinkNotificationRouteTest {

    private val uuid = "3f2b8c1e-9a4d-4e7b-8c2a-1d5e6f7a8b9c"

    /** FCM data -> intent extras -> route, as a real tap goes. */
    private fun routeForPush(data: Map<String, String>): NotificationRoute? {
        val extras = notificationExtrasFromPush(data)
        return notificationRoute { key -> extras[key] }
    }

    // MARK: - The iOS payload keys

    @Test
    fun `a push with type and id opens that content`() {
        assertEquals(
            NotificationRoute.To(Destination.Event(LinkId(uuid))),
            routeForPush(mapOf("type" to "event", "id" to uuid)),
        )
        assertEquals(
            NotificationRoute.To(Destination.Restaurant(LinkId(uuid))),
            routeForPush(mapOf("type" to "restaurant", "id" to uuid)),
        )
        assertEquals(
            NotificationRoute.To(Destination.Attraction(LinkId(uuid))),
            routeForPush(mapOf("type" to "attraction", "id" to uuid)),
        )
    }

    @Test
    fun `hotels and articles are reachable from a push`() {
        assertEquals(
            NotificationRoute.To(Destination.Hotel(LinkId("h1"))),
            routeForPush(mapOf("type" to "hotel", "id" to "h1")),
        )
        assertEquals(
            NotificationRoute.To(Destination.Article(LinkId("a1"))),
            routeForPush(mapOf("type" to "article", "id" to "a1")),
        )
        assertEquals(
            NotificationRoute.To(Destination.Hotel(LinkId("h1"))),
            routeForPush(mapOf("navigate_to" to "hotel_detail", "content_id" to "h1")),
        )
        assertEquals(
            NotificationRoute.To(Destination.Article(LinkId("a1"))),
            routeForPush(mapOf("navigate_to" to "article_detail", "content_id" to "a1")),
        )
    }

    @Test
    fun `a push with a url is handed on as a link`() {
        val url = "https://desmoinesinsider.com/events/touch-a-truck-2026-05-22"
        assertEquals(NotificationRoute.Link(url), routeForPush(mapOf("url" to url)))
    }

    @Test
    fun `a url wins over type and id, as on iOS`() {
        val url = "https://desmoinesinsider.com/articles/best-patios"
        assertEquals(
            NotificationRoute.Link(url),
            routeForPush(mapOf("url" to url, "type" to "event", "id" to uuid)),
        )
    }

    // MARK: - Android's own keys keep working

    @Test
    fun `navigate_to and content_id still route, and win over the iOS keys`() {
        assertEquals(
            NotificationRoute.To(Destination.Restaurant(LinkId("r9"))),
            routeForPush(
                mapOf(
                    "navigate_to" to "restaurant_detail",
                    "content_id" to "r9",
                    "url" to "https://desmoinesinsider.com/stay",
                ),
            ),
        )
    }

    @Test
    fun `a local reminder's event_id extra still routes`() {
        val extras = mapOf("navigate_to" to "event_detail", "event_id" to "e9")
        assertEquals(
            NotificationRoute.To(Destination.Event(LinkId("e9"))),
            notificationRoute { extras[it] },
        )
    }

    @Test
    fun `an unusable navigate_to falls through to the next key`() {
        assertEquals(
            NotificationRoute.To(Destination.Event(LinkId(uuid))),
            routeForPush(mapOf("navigate_to" to "event_detail", "type" to "event", "id" to uuid)),
        )
        assertEquals(
            NotificationRoute.To(Destination.Tab(TabDestination.SAVED)),
            routeForPush(mapOf("navigate_to" to "favorites")),
        )
    }

    // MARK: - What must not route

    @Test
    fun `an unknown type, a missing id or a hostile id routes nowhere`() {
        assertNull(routeForPush(mapOf("type" to "campaign", "id" to uuid)))
        assertNull(routeForPush(mapOf("type" to "event")))
        assertNull(routeForPush(mapOf("id" to uuid)))
        assertNull(routeForPush(mapOf("type" to "event", "id" to "../profile")))
        assertNull(routeForPush(mapOf("type" to "event", "id" to "a/b")))
    }

    @Test
    fun `blank values are dropped before they reach the intent`() {
        assertEquals(emptyMap<String, String>(), notificationExtrasFromPush(mapOf("url" to "  ", "type" to "")))
        assertNull(routeForPush(mapOf("url" to " ")))
        assertNull(routeForPush(emptyMap()))
    }

    @Test
    fun `push keys are namespaced so a bare type or id extra is never read`() {
        val extras = notificationExtrasFromPush(mapOf("url" to "u", "type" to "event", "id" to "x"))
        assertEquals(setOf(EXTRA_PUSH_URL, EXTRA_PUSH_TYPE, EXTRA_PUSH_ID), extras.keys)
        val bare = mapOf("type" to "event", "id" to uuid, "url" to "https://desmoinesinsider.com/stay")
        assertNull(notificationRoute { bare[it] })
    }

    @Test
    fun `every extra a push can write is one handleIntent drains`() {
        val all = notificationExtrasFromPush(
            mapOf("navigate_to" to "home", "content_id" to "c", "url" to "u", "type" to "t", "id" to "i"),
        )
        val undrained = all.keys - NOTIFICATION_EXTRA_KEYS.toSet()
        assertTrue(undrained.isEmpty(), "undrained: $undrained")
        // event_id is written by NotificationReceiver's local reminders.
        assertTrue("event_id" in NOTIFICATION_EXTRA_KEYS)
    }
}
