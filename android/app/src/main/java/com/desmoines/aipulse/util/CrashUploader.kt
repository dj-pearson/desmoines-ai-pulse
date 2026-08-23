package com.desmoines.aipulse.util

import com.desmoines.aipulse.BuildConfig
import io.github.jan.supabase.SupabaseClient
import io.github.jan.supabase.functions.functions
import io.ktor.http.isSuccess
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Uploads persisted crash records to the backend (XPLAT-004 AC1).
 *
 * CrashReportingService has captured crashes to disk since the file was written
 * and its own docstring says a future `crash-report` edge function will upload
 * them. None was built, so every crash the app has ever recorded stayed on the
 * device that crashed. This is that path, and it is the Kotlin twin of
 * ios/DesMoinesInsider/Services/CrashUploader.swift - deliberately, so the two
 * surfaces land in the same table with the same shape.
 *
 * WHY log-error RATHER THAN A NEW crash-report FUNCTION. log-error is already
 * verify_jwt = false (a crash reporter has no session to offer), rate-limits per
 * IP, scrubs PII before storage, returns no data, and feeds the error-triage
 * agent that clusters error_events into dev tasks. Web has posted to it since
 * src/lib/errorHandler.ts. A second, mobile-only sink would duplicate all four
 * and put mobile crashes in a table nothing triages.
 *
 * WHAT IS LOST, STATED PLAINLY. error_events has no stack column, and the
 * cluster signature is a hash of component + action + message, so pasting a full
 * stack trace into the message would give every crash a unique signature and
 * defeat the clustering that is the reason for choosing this sink. One frame is
 * carried, reduced to a stable symbol - see [topSymbol]. Full stacks stay on the
 * device, readable through pendingRecords().
 *
 * FAILURE IS SILENT AND RECORDS SURVIVE IT. Nothing here throws to the caller
 * and a record's file is deleted only after the post succeeds. A failed upload
 * leaves it for the next launch; draining first would lose exactly the crashes
 * that happen when the network is worst.
 */
@Singleton
class CrashUploader @Inject constructor(
    private val client: SupabaseClient?,
    private val crashReportingService: CrashReportingService,
) {

    /**
     * Post every pending record, deleting each only after the sink accepts it.
     * Safe to call on every launch; a no-op when unconfigured or empty.
     */
    suspend fun uploadPending() {
        val supabase = client ?: return
        val entries = crashReportingService.pendingEntries()
        if (entries.isEmpty()) return

        var uploaded = 0
        for ((file, record) in entries.take(MAX_PER_LAUNCH)) {
            // The status is checked rather than relying on the call throwing:
            // deleting a record on a 500 would lose the crash for good.
            val ok = runCatching {
                // The function name is written out rather than passed as
                // FUNCTION_NAME so the cross-platform contract scanner in
                // _tests/client-contract.test.ts can see this call. It
                // matches `functions("literal"`, so a constant hides the
                // call from the guard that exists to catch exactly this.
                supabase.functions("log-error", body = payload(record)).status.isSuccess()
            }.getOrDefault(false)
            if (!ok) {
                // One failure almost always means the network is down, not that
                // this record is bad. Stop rather than burn the rest against it.
                break
            }
            file.delete()
            uploaded++
        }

        if (uploaded > 0) {
            AppLogger.general.info(
                "Uploaded $uploaded crash record(s); ${entries.size - uploaded} remaining.",
            )
        }
    }

    companion object {
        /**
         * Most records posted per launch. The sink allows 60 requests/minute per
         * IP and a device coming back from a crash loop can hold far more than
         * that; the remainder is not dropped, it waits for the next launch.
         */
        const val MAX_PER_LAUNCH = 20

        /** Longest message log-error stores. */
        private const val MAX_MESSAGE = 2000

        /**
         * The JSON body posted for one record.
         *
         * Field mapping is constrained by what log-error accepts: `source` is
         * validated against `client | edge` so mobile is `client`, and `userId`
         * is validated as a 36-character UUID, so the record's 16-character
         * hashed id would be silently discarded and is deliberately not sent.
         */
        fun payload(record: CrashRecord): JsonObject {
            val symbol = topSymbol(record.stackTrace)
            val head = if (record.message.isBlank()) record.type else "${record.type}: ${record.message}"
            val message = if (symbol != null) "$head @ $symbol" else head

            return buildJsonObject {
                put("message", message.take(MAX_MESSAGE))
                put("component", "android-crash")
                put("action", if (record.fatal) "fatal" else "nonFatal")
                put("route", "android/${BuildConfig.VERSION_NAME}")
                put("severity", if (record.fatal) "critical" else "error")
                put("source", "client")
            }
        }

        /**
         * Reduce the first application frame of a stack trace to a stable symbol.
         *
         * A frame reads `at com.desmoines.aipulse.ui.Foo.bar(Foo.kt:42)`. The
         * source position moves with any edit above it, so keeping it would make
         * every occurrence of one crash a different cluster. Only the qualified
         * method name survives.
         *
         * Frames from the framework and the standard library are skipped: the
         * top of a crash stack is usually inside them and is identical across
         * unrelated crashes, which says nothing about which of our code failed.
         * If no application frame is found, nothing is appended rather than
         * something misleading.
         */
        fun topSymbol(stackTrace: String): String? {
            for (raw in stackTrace.lineSequence()) {
                val line = raw.trim()
                if (!line.startsWith("at ")) continue
                val frame = line.removePrefix("at ").trim()
                if (!frame.startsWith(APP_PACKAGE)) continue
                val symbol = frame.substringBefore('(').trim()
                if (symbol.isEmpty()) return null
                return symbol.take(200)
            }
            return null
        }

        private const val APP_PACKAGE = "com.desmoines.aipulse"
    }
}
