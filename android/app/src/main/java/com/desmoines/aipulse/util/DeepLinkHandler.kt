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
 * Mirrors iOS DeepLinkHandler.swift.
 *
 * Supported URL patterns:
 * - `desmoinesinsider.com/events/:id` -> Event detail
 * - `desmoinesinsider.com/restaurants/:id` -> Restaurant detail
 * - `desmoinesinsider.com/attractions/:id` -> Attraction detail
 * - `com.desmoines.aipulse://event/:id` -> Event detail (custom scheme)
 * - `com.desmoines.aipulse://restaurant/:id` -> Restaurant detail (custom scheme)
 * - `com.desmoines.aipulse://attraction/:id` -> Attraction detail (custom scheme)
 * - `com.desmoines.aipulse://home` -> Home tab
 * - `com.desmoines.aipulse://search` -> Search tab
 * - `com.desmoines.aipulse://favorites` -> Saved tab
 * - `com.desmoines.aipulse://profile` -> Profile tab
 * - `com.desmoines.aipulse://auth-callback` -> Auth callback (handled by Supabase)
 *
 * Also handles notification tap intents with navigate_to + event_id/content_id extras.
 */
@Singleton
class DeepLinkHandler @Inject constructor() {

    sealed class Destination {
        data class Event(val id: String) : Destination()
        data class Restaurant(val id: String) : Destination()
        data class Attraction(val id: String) : Destination()
        data class Tab(val tab: TabDestination) : Destination()
    }

    enum class TabDestination {
        HOME, DINING, SEARCH, MAP, SAVED, PROFILE
    }

    private val _pendingDestination = MutableStateFlow<Destination?>(null)
    val pendingDestination: StateFlow<Destination?> = _pendingDestination.asStateFlow()

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
            _pendingDestination.value = destination
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
        val contentId = intent.getStringExtra("event_id")
            ?: intent.getStringExtra("content_id")

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
                _pendingDestination.value = destination
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

    // --- Parse helpers ---

    private fun parseUniversalLink(url: Uri): Destination? {
        val host = url.host ?: return null
        if (!host.contains("desmoinesinsider.com")) return null

        val pathSegments = url.pathSegments
        if (pathSegments.isNullOrEmpty()) return null

        // Single-segment paths: /events -> Home tab, /restaurants -> Dining tab
        if (pathSegments.size == 1) {
            return when (pathSegments[0]) {
                "events" -> Destination.Tab(TabDestination.HOME)
                "restaurants" -> Destination.Tab(TabDestination.DINING)
                else -> null
            }
        }

        // Two-segment paths: /events/:id, /restaurants/:id, /attractions/:id
        if (pathSegments.size >= 2) {
            val type = pathSegments[0]
            val id = pathSegments[1]
            if (id.isBlank()) return null

            return when (type) {
                "events" -> Destination.Event(id)
                "restaurants" -> Destination.Restaurant(id)
                "attractions" -> Destination.Attraction(id)
                else -> null
            }
        }

        return null
    }

    private fun parseCustomScheme(url: Uri): Destination? {
        val scheme = url.scheme ?: return null
        if (scheme != Config.APP_BUNDLE_ID) return null

        val host = url.host ?: return null
        val pathSegments = url.pathSegments
        val id = pathSegments?.firstOrNull() ?: ""

        return when {
            host == "event" && id.isNotEmpty() -> Destination.Event(id)
            host == "restaurant" && id.isNotEmpty() -> Destination.Restaurant(id)
            host == "attraction" && id.isNotEmpty() -> Destination.Attraction(id)
            host == "home" -> Destination.Tab(TabDestination.HOME)
            host == "search" -> Destination.Tab(TabDestination.SEARCH)
            host == "favorites" -> Destination.Tab(TabDestination.SAVED)
            host == "profile" -> Destination.Tab(TabDestination.PROFILE)
            host == "dining" -> Destination.Tab(TabDestination.DINING)
            host == "map" -> Destination.Tab(TabDestination.MAP)
            else -> null
        }
    }
}
