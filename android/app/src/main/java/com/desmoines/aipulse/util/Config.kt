package com.desmoines.aipulse.util

/**
 * Central configuration for the Des Moines Insider Android app.
 * Mirrors iOS Config.swift — all values must match.
 */
object Config {

    // App
    const val APP_NAME = "Des Moines Insider"
    const val APP_BUNDLE_ID = "com.desmoines.aipulse"
    const val SITE_URL = "https://desmoinesinsider.com"
    const val SUPPORT_EMAIL = "support@desmoinesinsider.com"

    // Des Moines, Iowa center coordinates
    const val DEFAULT_LATITUDE = 41.5868
    const val DEFAULT_LONGITUDE = -93.625
    const val DEFAULT_SEARCH_RADIUS_MILES = 30.0

    // Pagination
    const val DEFAULT_PAGE_SIZE = 30
    const val MAX_PAGE_SIZE = 100

    // Cache
    const val CACHE_EXPIRATION_MINUTES = 5

    // Feature Flags
    const val ENABLE_AI_FEATURES = true
    const val ENABLE_PUSH_NOTIFICATIONS = false

    // Auth
    const val AUTH_REDIRECT_SCHEME = "$APP_BUNDLE_ID://auth-callback"
    const val MAX_AUTH_ATTEMPTS = 5
    const val AUTH_LOCKOUT_SECONDS = 60
    const val AUTH_WINDOW_MINUTES = 5

    // Google Sign-In web client ID (from local.properties via BuildConfig)
    val GOOGLE_WEB_CLIENT_ID: String
        get() = com.desmoines.aipulse.BuildConfig.GOOGLE_WEB_CLIENT_ID

    // Search
    const val SEARCH_DEBOUNCE_MS = 300L

    // Client Info header
    const val CLIENT_INFO_HEADER = "desmoines-insider-android"
}
