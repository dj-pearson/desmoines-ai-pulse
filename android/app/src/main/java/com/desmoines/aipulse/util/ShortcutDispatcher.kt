package com.desmoines.aipulse.util

import android.content.Intent
import android.net.Uri
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Bridges App Shortcut / Assistant deep links (ANDP-015) into the Compose layer.
 * Mirrors iOS `PulseIntentDispatcher`: intents post a [Pending] payload here and
 * the relevant screen (Ask Pulse / Search) applies the parameters once it's shown.
 *
 * Handled URIs (scheme `com.desmoines.aipulse`):
 * - `://ask-pulse?q=<query>`              -> open Ask Pulse, pre-fill + auto-send
 * - `://find-restaurants?cuisine=&area=&openNow=` -> restaurant search pre-filled
 * - `://find-events?category=&datePreset=`        -> event search pre-filled
 */
@Singleton
class ShortcutDispatcher @Inject constructor() {

    sealed interface Pending {
        data class AskPulse(val query: String) : Pending
        data class FindRestaurants(
            val cuisine: String?,
            val area: String?,
            val openNow: Boolean,
        ) : Pending
        data class FindEvents(
            val category: String?,
            val datePreset: String?,
        ) : Pending
    }

    private val _pending = MutableStateFlow<Pending?>(null)
    val pending: StateFlow<Pending?> = _pending.asStateFlow()

    /**
     * Parse a launch/new intent's data URI into a [Pending]. Returns true if it
     * was one of our shortcut links (caller should then clear the intent data so
     * it isn't re-handled on configuration change).
     */
    fun handleIntent(intent: Intent): Boolean {
        val uri = intent.data ?: return false
        val parsed = parse(uri) ?: return false
        _pending.value = parsed
        return true
    }

    fun consume(): Pending? {
        val value = _pending.value
        _pending.value = null
        return value
    }

    private fun parse(uri: Uri): Pending? {
        if (uri.scheme != Config.APP_BUNDLE_ID) return null
        return when (uri.host) {
            "ask-pulse" -> {
                val query = uri.getQueryParameter("q")?.trim().orEmpty()
                Pending.AskPulse(query = query)
            }
            "find-restaurants" -> Pending.FindRestaurants(
                cuisine = uri.getQueryParameter("cuisine")?.trim()?.ifBlank { null },
                area = uri.getQueryParameter("area")?.trim()?.ifBlank { null },
                openNow = uri.getQueryParameter("openNow")?.toBooleanStrictOrNull() ?: false,
            )
            "find-events" -> Pending.FindEvents(
                category = uri.getQueryParameter("category")?.trim()?.ifBlank { null },
                datePreset = uri.getQueryParameter("datePreset")?.trim()?.ifBlank { null },
            )
            else -> null
        }
    }
}
