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
 *
 * AND-AUDIT-023: error() also reaches [errorSink] when one is installed, so a
 * caught-and-logged error is reported rather than only written to logcat on a
 * device nobody is holding. warning() deliberately does NOT - warnings are the
 * app describing something it handled, and reporting all 42 of them would bury
 * the ones that matter.
 */
object AppLogger {

    val auth = CategoryLogger("auth")
    val network = CategoryLogger("network")
    val cache = CategoryLogger("cache")
    val billing = CategoryLogger("billing")
    val ui = CategoryLogger("ui")
    val nav = CategoryLogger("nav")
    val general = CategoryLogger("general")

    /**
     * Where error() reports to, installed once at startup by the Application.
     *
     * A settable sink rather than an injected dependency because AppLogger is an
     * object called from places that have no graph - companion objects, Room
     * callbacks, BroadcastReceivers. Null until the Application installs it, so
     * anything logged before onCreate is logged and not reported, which is the
     * right way round.
     */
    @Volatile
    private var errorSink: ErrorSink? = null

    fun interface ErrorSink {
        fun report(category: String, message: String, throwable: Throwable?)
    }

    fun installErrorSink(sink: ErrorSink?) {
        errorSink = sink
    }

    class CategoryLogger(private val category: String) {
        private val tag = "DMI/$category"

        fun debug(message: String) {
            Log.d(tag, message)
        }

        fun info(message: String) {
            Log.i(tag, message)
        }

        fun warning(message: String, throwable: Throwable? = null) {
            if (throwable != null) {
                Log.w(tag, message, throwable)
            } else {
                Log.w(tag, message)
            }
        }

        fun error(message: String, throwable: Throwable? = null) {
            if (throwable != null) {
                Log.e(tag, message, throwable)
            } else {
                Log.e(tag, message)
            }
            // Reporting must never be able to break the caller. A logging call
            // that threw because the crash reporter was unhappy would turn an
            // error someone handled into a crash they did not.
            errorSink?.let { sink ->
                runCatching { sink.report(category, message, throwable) }
            }
        }
    }
}

/**
 * Stands in for the missing exception when error() is called without one.
 *
 * CrashRecord.type is the throwable's class name, so without this every
 * message-only error would be filed as a bare RuntimeException and be
 * indistinguishable from any other. Same reasoning as
 * SecureStorageFallbackException in AND-AUDIT-008.
 */
class LoggedError(message: String) : RuntimeException(message)
