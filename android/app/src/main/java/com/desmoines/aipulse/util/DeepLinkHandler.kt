package com.desmoines.aipulse.util

import android.content.Intent
import android.net.Uri
import com.desmoines.aipulse.data.model.Neighborhood as NeighborhoodGuide
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Parses deep links and universal links into app navigation destinations.
 * Mirrors iOS DeepLinkHandler.swift (parseUniversalLink, eventDestination).
 *
 * Supported URL patterns (https on desmoinesinsider.com or www. only):
 * - `/events/:slug-or-id` -> Event detail; `/events/today`, `/events/free` and
 *   the other web landing pages (src/App.tsx) -> the matching tab or list
 * - `/restaurants/:slug-or-id` -> Restaurant detail; `/restaurants/open-now`
 *   -> Dining tab with Open now on; `/new`, `/dietary` -> Dining tab
 * - `/attractions/:slug-or-id` -> Attraction detail
 * - `/stay/:slug` -> Hotel detail, `/stay` -> Hotels list
 * - `/articles/:slug` -> Article detail, `/articles` -> Articles list
 * - `/neighborhoods/:slug` -> that neighborhood guide, or the Neighborhoods
 *   hub for a slug the app has no guide for; `/neighborhoods` -> the hub
 * - `/search?q=` -> Search with the query, `/search` -> Search tab
 * - any other path on our host -> the in-app WebView of that URL
 *
 * Custom scheme:
 * - `com.desmoines.aipulse://event/:id` (also restaurant, attraction, hotel)
 * - `com.desmoines.aipulse://home` (also search, favorites, profile, dining, map)
 * - `com.desmoines.aipulse://auth-callback` -> Auth callback (MainActivity.handleAuthCallback, AND-OVH-005)
 *
 * Also handles notification taps: navigate_to + event_id/content_id extras,
 * and a push's `url` or `type` + `id` (see [notificationRoute]).
 */
@Singleton
class DeepLinkHandler @Inject constructor() {

    /**
     * The id a link carries. Web URLs carry slugs, notifications and the
     * custom scheme usually carry UUIDs; AND-OVH-022 resolves the slug case.
     */
    data class LinkId(val value: String) {
        val isUuid: Boolean get() = UUID_PATTERN.matches(value)
    }

    sealed class Destination {
        data class Event(val id: LinkId) : Destination()
        data class Restaurant(val id: LinkId) : Destination()
        data class Attraction(val id: LinkId) : Destination()
        data class Hotel(val id: LinkId) : Destination()
        data class Article(val id: LinkId) : Destination()
        /** One guide, by a slug [NeighborhoodGuide.bySlug] knows (AND-AUDIT-025). */
        data class Neighborhood(val slug: String) : Destination()
        data class Tab(val tab: TabDestination) : Destination()
        data class Screen(val screen: ScreenDestination) : Destination()
        data class Search(val query: String) : Destination()
        data class Web(val url: String) : Destination()

        /**
         * The Dining tab with its Open now filter on: /restaurants/open-now
         * (iOS restaurantLandingDestination). The flag waits in
         * [pendingRestaurantsOpenNow] until RestaurantsViewModel applies it.
         */
        data object RestaurantsOpenNow : Destination()
    }

    enum class TabDestination {
        HOME, DINING, SEARCH, MAP, SAVED, PROFILE
    }

    /** Non-tab list screens a web landing page maps to. */
    enum class ScreenDestination {
        WEEKEND, HOTELS, ARTICLES, NEIGHBORHOODS
    }

    /** Where a notification tap goes, before any navigation happens. */
    sealed interface NotificationRoute {
        data class To(val destination: Destination) : NotificationRoute

        /** A link; [handle] still applies its host and scheme checks. */
        data class Link(val url: String) : NotificationRoute
    }

    private val _pendingDestination = MutableStateFlow<Destination?>(null)
    val pendingDestination: StateFlow<Destination?> = _pendingDestination.asStateFlow()

    // A /search?q= link's text, held until SearchViewModel exists to apply it.
    // Separate from pendingDestination because MainScreen consumes that one to
    // navigate, before the Search screen's view model is created.
    private val _pendingSearchQuery = MutableStateFlow<String?>(null)
    val pendingSearchQuery: StateFlow<String?> = _pendingSearchQuery.asStateFlow()

    // An /restaurants/open-now link, held for RestaurantsViewModel for the same
    // reason: the Dining view model may not exist when MainScreen navigates.
    private val _pendingRestaurantsOpenNow = MutableStateFlow(false)
    val pendingRestaurantsOpenNow: StateFlow<Boolean> = _pendingRestaurantsOpenNow.asStateFlow()

    /**
     * Attempts to parse a URL into a navigation destination.
     * Returns true if the URL was handled, false if it should be passed to Supabase (e.g., auth callbacks).
     */
    fun handle(url: Uri): Boolean {
        // Skip auth callbacks - let Supabase handle those
        if (url.toString().contains("auth-callback")) {
            return false
        }

        val destination = parseUniversalLink(url) ?: parseCustomScheme(url)
        if (destination != null) {
            publish(destination)
            return true
        }

        return false
    }

    /**
     * Handles intents from notification taps and other internal deep links.
     * Notification extras (see [notificationRoute]) win over the intent's data
     * URI; PushNotificationService and NotificationReceiver both write them.
     */
    fun handleIntent(intent: Intent): Boolean {
        val route = notificationRoute { key -> intent.getStringExtra(key) }
        if (route != null) {
            val handled = when (route) {
                is NotificationRoute.To -> {
                    publish(route.destination)
                    true
                }
                // Same host and scheme checks as a tapped link, so a push
                // cannot open anything a link could not.
                is NotificationRoute.Link -> handle(Uri.parse(route.url))
            }
            // Drain the extras so a configuration change, which hands the
            // activity this same Intent again, does not navigate twice.
            NOTIFICATION_EXTRA_KEYS.forEach(intent::removeExtra)
            if (handled) return true
        }

        // Check for deep link URI in intent data
        val uri = intent.data
        if (uri != null) {
            return handle(uri)
        }

        return false
    }

    /**
     * Consumes and returns the pending destination, clearing it.
     */
    fun consumeDestination(): Destination? {
        val destination = _pendingDestination.value
        _pendingDestination.value = null
        return destination
    }

    /** Consumes and returns a /search link's query, clearing it. */
    fun consumeSearchQuery(): String? {
        val query = _pendingSearchQuery.value
        _pendingSearchQuery.value = null
        return query
    }

    /** Consumes an /restaurants/open-now link's filter: true once, then false. */
    fun consumeRestaurantsOpenNow(): Boolean {
        val pending = _pendingRestaurantsOpenNow.value
        _pendingRestaurantsOpenNow.value = false
        return pending
    }

    /** Internal, not private, so JVM tests can publish without an android.net.Uri. */
    internal fun publish(destination: Destination) {
        if (destination is Destination.Search) _pendingSearchQuery.value = destination.query
        if (destination is Destination.RestaurantsOpenNow) _pendingRestaurantsOpenNow.value = true
        _pendingDestination.value = destination
    }

    // --- Parse helpers ---

    private fun parseUniversalLink(url: Uri): Destination? {
        if (!isFirstPartyWebUrl(url.scheme, url.host)) return null
        return webDestination(
            segments = url.pathSegments.orEmpty(),
            searchQuery = runCatching { url.getQueryParameter("q") }.getOrNull(),
            url = url.toString(),
        )
    }

    private fun parseCustomScheme(url: Uri): Destination? {
        val scheme = url.scheme ?: return null
        if (scheme != Config.APP_BUNDLE_ID) return null

        val host = url.host ?: return null
        val pathSegments = url.pathSegments
        val id = pathSegments?.firstOrNull()?.let(::appLinkId)

        return when {
            host == "event" && id != null -> Destination.Event(id)
            host == "restaurant" && id != null -> Destination.Restaurant(id)
            host == "attraction" && id != null -> Destination.Attraction(id)
            host == "hotel" && id != null -> Destination.Hotel(id)
            host == "home" -> Destination.Tab(TabDestination.HOME)
            host == "search" -> Destination.Tab(TabDestination.SEARCH)
            host == "favorites" -> Destination.Tab(TabDestination.SAVED)
            host == "profile" -> Destination.Tab(TabDestination.PROFILE)
            host == "dining" -> Destination.Tab(TabDestination.DINING)
            host == "map" -> Destination.Tab(TabDestination.MAP)
            else -> null
        }
    }

    /**
     * String-only parsing, kept off android.net.Uri so the JVM unit tests can
     * reach it (unitTests.isReturnDefaultValues makes Uri.parse return null).
     */
    companion object {
        /** Hosts the manifest's App Links filter declares. Compared by equality. */
        val FIRST_PARTY_HOSTS: Set<String> = setOf("desmoinesinsider.com", "www.desmoinesinsider.com")

        /**
         * First path segments the manifest claims with pathPrefix. Anything
         * else on our host never reaches the app, so there is no point
         * parsing it; DeepLinkManifestParityTest holds the two lists equal.
         */
        val CLAIMED_WEB_SECTIONS: Set<String> =
            setOf("events", "restaurants", "attractions", "stay", "articles", "search", "neighborhoods")

        /**
         * Intent extras a notification tap carries. The push_* three are the
         * FCM data keys url, type and id renamed by [notificationExtrasFromPush],
         * so a bare "type" or "id" extra from some other intent is never read
         * as a push.
         */
        const val EXTRA_PUSH_URL = "push_url"
        const val EXTRA_PUSH_TYPE = "push_type"
        const val EXTRA_PUSH_ID = "push_id"
        val NOTIFICATION_EXTRA_KEYS: List<String> =
            listOf("navigate_to", "event_id", "content_id", EXTRA_PUSH_URL, EXTRA_PUSH_TYPE, EXTRA_PUSH_ID)

        /** Longest search text a link may carry (iOS maxLinkQueryLength). */
        const val MAX_LINK_QUERY_LENGTH = 120

        private val UUID_PATTERN =
            Regex("^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$")
        private val SLUG_PATTERN = Regex("^[a-z0-9]+(?:-[a-z0-9]+)*$")
        private val APP_ID_PATTERN = Regex("^[A-Za-z0-9_-]{1,160}$")
        private val MONTH_PAGE_PATTERN = Regex(
            "^(january|february|march|april|may|june|july|august|september|october|november|december)-\\d{4}$",
        )

        /** /events/<segment> pages on the web that are not events (src/App.tsx). */
        val EVENT_LANDING_SEGMENTS: Set<String> = setOf(
            "today", "tonight", "this-weekend", "near-me", "free", "kids", "date-night",
            "west-des-moines", "ankeny", "urbandale", "johnston", "altoona",
            "clive", "windsor-heights", "waukee", "series",
        )

        private val EVENT_SUBURB_SEGMENTS: Set<String> = setOf(
            "west-des-moines", "ankeny", "urbandale", "johnston", "altoona",
            "clive", "windsor-heights", "waukee",
        )

        /** /restaurants/<segment> landing pages on the web. */
        val RESTAURANT_LANDING_SEGMENTS: Set<String> = setOf("open-now", "new", "dietary")

        /**
         * https on desmoinesinsider.com or www. only, by equality. The substring
         * match this replaced accepted desmoinesinsider.com.evil.io, and any
         * scheme (iOS IOS-DD-PLATFORM-10).
         */
        fun isFirstPartyWebUrl(scheme: String?, host: String?): Boolean {
            if (!scheme.equals("https", ignoreCase = true)) return false
            return host?.lowercase() in FIRST_PARTY_HOSTS
        }

        /** A UUID or a lowercase slug of at most [maxLength] characters. */
        fun webLinkId(raw: String, maxLength: Int = 120): LinkId? {
            if (UUID_PATTERN.matches(raw)) return LinkId(raw)
            if (raw.length > maxLength || !SLUG_PATTERN.matches(raw)) return null
            return LinkId(raw)
        }

        /**
         * An id from a notification or the custom scheme. Looser than a web
         * segment (ids in tests and older payloads are not always UUIDs), but
         * nothing that would break the nav route it is interpolated into.
         */
        fun appLinkId(raw: String): LinkId? = raw.takeIf { APP_ID_PATTERN.matches(it) }?.let(::LinkId)

        fun isMonthPage(segment: String): Boolean = MONTH_PAGE_PATTERN.matches(segment)

        /**
         * /neighborhoods/<slug> (AND-AUDIT-025, iOS IOS-AUDIT-FEAT-038). Every
         * slug the web builds (src/lib/neighborhoods.ts) is in Neighborhood.all,
         * so a shared guide opens that guide. A slug the app has no guide for
         * lands on the hub, never on nothing. Exact match against the curated
         * list is the validation, so nothing unchecked reaches the nav route.
         */
        fun neighborhoodDestination(segment: String): Destination =
            NeighborhoodGuide.bySlug(segment)?.let { Destination.Neighborhood(it.slug) }
                ?: Destination.Screen(ScreenDestination.NEIGHBORHOODS)

        /**
         * The intent extras for a tapped push, from its FCM data payload.
         * Reads the keys iOS reads (DeepLinkHandler.swift handleNotification:
         * `url`, then `type` + `id`) as well as Android's own navigate_to and
         * content_id, so one payload routes on both apps (AND-AUDIT-026).
         */
        fun notificationExtrasFromPush(data: Map<String, String>): Map<String, String> = buildMap {
            fun copy(from: String, to: String) {
                data[from]?.takeIf { it.isNotBlank() }?.let { put(to, it) }
            }
            copy("navigate_to", "navigate_to")
            copy("content_id", "content_id")
            copy("url", EXTRA_PUSH_URL)
            copy("type", EXTRA_PUSH_TYPE)
            copy("id", EXTRA_PUSH_ID)
        }

        /**
         * Precedence: navigate_to (local reminders and older pushes), then a
         * `url`, then a `type` + `id` pair. That is the iOS order after its
         * eventId key, which Android's reminders spell as navigate_to. An
         * unusable navigate_to falls through to the next key; a url does not,
         * as on iOS.
         */
        fun notificationRoute(extra: (String) -> String?): NotificationRoute? {
            extra("navigate_to")?.let { navigateTo ->
                val id = (extra("event_id") ?: extra("content_id"))?.let(::appLinkId)
                navigateToDestination(navigateTo, id)?.let { return NotificationRoute.To(it) }
            }
            extra(EXTRA_PUSH_URL)?.trim()?.takeIf { it.isNotEmpty() }?.let {
                return NotificationRoute.Link(it)
            }
            val type = extra(EXTRA_PUSH_TYPE)
            val rawId = extra(EXTRA_PUSH_ID)
            if (type != null && rawId != null) {
                typedDestination(type, rawId)?.let { return NotificationRoute.To(it) }
            }
            return null
        }

        /** A navigate_to value with its content id, or null when unusable. */
        fun navigateToDestination(navigateTo: String, id: LinkId?): Destination? = when (navigateTo) {
            "event_detail" -> id?.let { Destination.Event(it) }
            "restaurant_detail" -> id?.let { Destination.Restaurant(it) }
            "attraction_detail" -> id?.let { Destination.Attraction(it) }
            "hotel_detail" -> id?.let { Destination.Hotel(it) }
            "article_detail" -> id?.let { Destination.Article(it) }
            "home" -> Destination.Tab(TabDestination.HOME)
            "search" -> Destination.Tab(TabDestination.SEARCH)
            "favorites" -> Destination.Tab(TabDestination.SAVED)
            "profile" -> Destination.Tab(TabDestination.PROFILE)
            else -> null
        }

        /** A push `type` + `id` pair (iOS routeTyped), or null when unusable. */
        fun typedDestination(type: String, rawId: String): Destination? {
            val id = appLinkId(rawId) ?: return null
            return when (type) {
                "event" -> Destination.Event(id)
                "restaurant" -> Destination.Restaurant(id)
                "attraction" -> Destination.Attraction(id)
                "hotel" -> Destination.Hotel(id)
                "article" -> Destination.Article(id)
                else -> null
            }
        }

        /** The trimmed, capped `q` of a /search link, or null when empty. */
        fun searchQuery(raw: String?): String? =
            raw?.trim()?.take(MAX_LINK_QUERY_LENGTH)?.trim()?.takeIf { it.isNotEmpty() }

        /**
         * /events/<segment>: a landing page, an event slug or id, or Home. The
         * web builds every event URL as <title>-<yyyy-mm-dd>, so a UUID-only
         * check would send all of them to Home (iOS eventDestination).
         */
        fun eventDestination(segment: String, url: String): Destination {
            when (segment) {
                "this-weekend" -> return Destination.Screen(ScreenDestination.WEEKEND)
                "today" -> return Destination.Search("today")
                "tonight" -> return Destination.Search("tonight")
                "free" -> return Destination.Search("free events")
                "kids" -> return Destination.Search("kids events")
                // The Map tab is the app's nearby-events surface (iOS .tab(.map)).
                "near-me" -> return Destination.Tab(TabDestination.MAP)
                // /events/series/:slug has no native screen.
                "series" -> return Destination.Web(url)
            }
            if (segment in EVENT_SUBURB_SEGMENTS) {
                return Destination.Search("events in " + segment.replace('-', ' '))
            }
            if (segment in EVENT_LANDING_SEGMENTS || isMonthPage(segment)) {
                return Destination.Tab(TabDestination.HOME)
            }
            return webLinkId(segment, maxLength = 160)?.let { Destination.Event(it) }
                ?: Destination.Tab(TabDestination.HOME)
        }

        /**
         * Maps the path of a first-party https URL. Never null: a path the app
         * has no screen for opens in the in-app WebView.
         */
        fun webDestination(segments: List<String>, searchQuery: String?, url: String): Destination {
            val first = segments.firstOrNull() ?: return Destination.Tab(TabDestination.HOME)

            // /search, /search?q=, /search/advanced
            if (first == "search") {
                return searchQuery(searchQuery)?.let { Destination.Search(it) }
                    ?: Destination.Tab(TabDestination.SEARCH)
            }

            if (segments.size == 1) {
                return when (first) {
                    "events" -> Destination.Tab(TabDestination.HOME)
                    "restaurants" -> Destination.Tab(TabDestination.DINING)
                    "stay" -> Destination.Screen(ScreenDestination.HOTELS)
                    "articles" -> Destination.Screen(ScreenDestination.ARTICLES)
                    "neighborhoods" -> Destination.Screen(ScreenDestination.NEIGHBORHOODS)
                    // /attractions has no native list screen.
                    else -> Destination.Web(url)
                }
            }

            val segment = segments[1]
            return when (first) {
                "events" -> eventDestination(segment, url)
                "restaurants" ->
                    if (segment == "open-now") {
                        // A shared "open now" page used to open every restaurant.
                        Destination.RestaurantsOpenNow
                    } else if (segment in RESTAURANT_LANDING_SEGMENTS) {
                        // No new-openings or dietary filter on Android yet.
                        Destination.Tab(TabDestination.DINING)
                    } else {
                        webLinkId(segment)?.let { Destination.Restaurant(it) }
                            ?: Destination.Tab(TabDestination.DINING)
                    }
                "attractions" ->
                    webLinkId(segment)?.let { Destination.Attraction(it) }
                        ?: Destination.Tab(TabDestination.HOME)
                "stay" ->
                    // /stay/near/:slug lists hotels near a venue; no native screen.
                    if (segment == "near") {
                        Destination.Web(url)
                    } else {
                        webLinkId(segment)?.let { Destination.Hotel(it) }
                            ?: Destination.Screen(ScreenDestination.HOTELS)
                    }
                "articles" ->
                    webLinkId(segment)?.let { Destination.Article(it) }
                        ?: Destination.Screen(ScreenDestination.ARTICLES)
                "neighborhoods" -> neighborhoodDestination(segment)
                else -> Destination.Web(url)
            }
        }
    }
}
