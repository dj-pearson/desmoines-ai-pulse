package com.desmoines.aipulse.util

import android.content.Intent
import android.net.Uri
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
 * - `/restaurants/:slug-or-id` -> Restaurant detail; `/restaurants/open-now`,
 *   `/new`, `/dietary` -> Dining tab
 * - `/attractions/:slug-or-id` -> Attraction detail
 * - `/stay/:slug` -> Hotel detail, `/stay` -> Hotels list
 * - `/articles/:slug` -> Article detail, `/articles` -> Articles list
 * - `/search?q=` -> Search with the query, `/search` -> Search tab
 * - any other path on our host -> the in-app WebView of that URL
 *
 * Custom scheme:
 * - `com.desmoines.aipulse://event/:id` (also restaurant, attraction, hotel)
 * - `com.desmoines.aipulse://home` (also search, favorites, profile, dining, map)
 * - `com.desmoines.aipulse://auth-callback` -> Auth callback (MainActivity.handleAuthCallback, AND-OVH-005)
 *
 * Also handles notification tap intents with navigate_to + event_id/content_id extras.
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
        data class Tab(val tab: TabDestination) : Destination()
        data class Screen(val screen: ScreenDestination) : Destination()
        data class Search(val query: String) : Destination()
        data class Web(val url: String) : Destination()
    }

    enum class TabDestination {
        HOME, DINING, SEARCH, MAP, SAVED, PROFILE
    }

    /** Non-tab list screens a web landing page maps to. */
    enum class ScreenDestination {
        WEEKEND, HOTELS, ARTICLES
    }

    private val _pendingDestination = MutableStateFlow<Destination?>(null)
    val pendingDestination: StateFlow<Destination?> = _pendingDestination.asStateFlow()

    // A /search?q= link's text, held until SearchViewModel exists to apply it.
    // Separate from pendingDestination because MainScreen consumes that one to
    // navigate, before the Search screen's view model is created.
    private val _pendingSearchQuery = MutableStateFlow<String?>(null)
    val pendingSearchQuery: StateFlow<String?> = _pendingSearchQuery.asStateFlow()

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
     * Checks for navigate_to + event_id/content_id extras from NotificationReceiver/PushNotificationService.
     */
    fun handleIntent(intent: Intent): Boolean {
        // Check for notification tap extras
        val navigateTo = intent.getStringExtra("navigate_to")
        val contentId = (intent.getStringExtra("event_id") ?: intent.getStringExtra("content_id"))
            ?.let(::appLinkId)

        if (navigateTo != null) {
            val destination = when (navigateTo) {
                "event_detail" -> contentId?.let { Destination.Event(it) }
                "restaurant_detail" -> contentId?.let { Destination.Restaurant(it) }
                "attraction_detail" -> contentId?.let { Destination.Attraction(it) }
                "home" -> Destination.Tab(TabDestination.HOME)
                "search" -> Destination.Tab(TabDestination.SEARCH)
                "favorites" -> Destination.Tab(TabDestination.SAVED)
                "profile" -> Destination.Tab(TabDestination.PROFILE)
                else -> null
            }
            if (destination != null) {
                publish(destination)
                // Clear intent extras to prevent re-handling on config change
                intent.removeExtra("navigate_to")
                intent.removeExtra("event_id")
                intent.removeExtra("content_id")
                return true
            }
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

    private fun publish(destination: Destination) {
        if (destination is Destination.Search) _pendingSearchQuery.value = destination.query
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
            setOf("events", "restaurants", "attractions", "stay", "articles", "search")

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
                    // /attractions has no native list screen.
                    else -> Destination.Web(url)
                }
            }

            val segment = segments[1]
            return when (first) {
                "events" -> eventDestination(segment, url)
                "restaurants" ->
                    if (segment in RESTAURANT_LANDING_SEGMENTS) {
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
                else -> Destination.Web(url)
            }
        }
    }
}
