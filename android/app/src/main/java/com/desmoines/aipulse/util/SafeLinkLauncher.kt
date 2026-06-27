package com.desmoines.aipulse.util

import android.content.Context
import android.content.Intent
import android.net.Uri

/**
 * Crash-safe launcher for external links and maps (ANDP-063), mirroring the iOS
 * crash-safe Maps audit fix. Every launch validates the target, resolves an
 * Intent, and swallows `ActivityNotFoundException` so a missing handler or a
 * malformed/unsafe URL never crashes the app.
 *
 * Only `http`/`https` web links are launched; everything else (`javascript:`,
 * `file:`, `data:`, `intent:`, `content:`, `mailto:`, …) is dropped. Maps use a
 * fallback chain: Google Maps → any geo handler → browser.
 *
 * Used by article links (ANDP-031), hotel booking (ANDP-034), and ad/sponsored
 * clicks (ANDP-040/042).
 */
object SafeLinkLauncher {

    private val ALLOWED_WEB_SCHEMES = setOf("http", "https")

    /**
     * Pure validation (no `android.net.Uri`, so it's JVM unit-testable): true
     * only for an `http`/`https` URL that has a host.
     */
    fun isSafeWebUrl(url: String?): Boolean {
        val trimmed = url?.trim().orEmpty()
        if (trimmed.isEmpty()) return false
        val scheme = trimmed.substringBefore("://", "").lowercase()
        if (scheme !in ALLOWED_WEB_SCHEMES) return false
        val host = trimmed.substringAfter("://", "")
            .substringBefore("/")
            .substringBefore("?")
            .substringBefore("#")
        return host.isNotBlank()
    }

    /**
     * Opens [url] in a browser if it's a safe web link. Returns false (without
     * launching) for an unsafe/unknown scheme, a malformed URL, or no handler.
     */
    fun openUrl(context: Context, url: String?): Boolean {
        if (!isSafeWebUrl(url)) return false
        val intent = Intent(Intent.ACTION_VIEW, Uri.parse(url!!.trim()))
        return launch(context, intent)
    }

    /**
     * Opens a map for [latitude]/[longitude] via a fallback chain: the Google
     * Maps app, then any `geo:` handler, then the browser. Returns false only if
     * every option fails.
     */
    fun openMap(context: Context, latitude: Double, longitude: Double, label: String? = null): Boolean {
        val q = label?.trim()?.takeIf { it.isNotEmpty() }?.let { "(${Uri.encode(it)})" } ?: ""
        val geoUri = Uri.parse("geo:$latitude,$longitude?q=$latitude,$longitude$q")

        val googleMaps = Intent(Intent.ACTION_VIEW, geoUri).setPackage("com.google.android.apps.maps")
        if (launch(context, googleMaps)) return true

        val anyGeo = Intent(Intent.ACTION_VIEW, geoUri)
        if (launch(context, anyGeo)) return true

        return openUrl(context, "https://www.google.com/maps/search/?api=1&query=$latitude,$longitude")
    }

    private fun launch(context: Context, intent: Intent): Boolean =
        runCatching { context.startActivity(intent); true }.getOrDefault(false)
}
