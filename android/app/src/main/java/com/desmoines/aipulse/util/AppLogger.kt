package com.desmoines.aipulse.util

import android.util.Log

/**
 * Structured logging utility matching iOS AppLogger.swift.
 * Logs are filtered by tag format: "DMI/{category}".
 *
 * Usage:
 *   AppLogger.auth.info("User signed in")
 *   AppLogger.network.error("Request failed", throwable)
 *   AppLogger.cache.debug("Cache hit for key: $key")
 *
 * In release builds, debug() and info() calls are stripped by ProGuard
 * (see proguard-rules.pro), so only warning/error logs remain.
 */
object AppLogger {

    val auth = CategoryLogger("auth")
    val network = CategoryLogger("network")
    val cache = CategoryLogger("cache")
    val billing = CategoryLogger("billing")
    val ui = CategoryLogger("ui")
    val nav = CategoryLogger("nav")
    val general = CategoryLogger("general")

    class CategoryLogger(category: String) {
        private val tag = "DMI/$category"

        fun debug(message: String) {
            Log.d(tag, message)
        }

        fun info(message: String) {
            Log.i(tag, message)
        }

        fun warning(message: String) {
            Log.w(tag, message)
        }

        fun error(message: String, throwable: Throwable? = null) {
            if (throwable != null) {
                Log.e(tag, message, throwable)
            } else {
                Log.e(tag, message)
            }
        }
    }
}
