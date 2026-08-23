package com.desmoines.aipulse.util

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import java.io.File
import java.security.MessageDigest

/** A captured crash or non-fatal error. Mirrors iOS CrashReportingService record. */
@Serializable
data class CrashRecord(
    val timestamp: Long,
    val fatal: Boolean,
    val type: String,
    val message: String,
    val stackTrace: String,
    val userId: String? = null,
    val context: Map<String, String> = emptyMap(),
)

/**
 * First-party crash + non-fatal error queue. Mirrors iOS CrashReportingService.swift.
 *
 * Installs a global uncaught-exception handler (chaining the previous one) and persists
 * records as JSON files under [crashDir]. Survives process death; [pendingRecords]/
 * [flushPendingRecords] drain the queue; CrashUploader posts them to the existing
 * log-error sink (XPLAT-004). Android has no POSIX signal handler; the VM uncaught handler is the analog.
 *
 * Context-free for plain-JVM tests; the Hilt provider supplies `filesDir/CrashReports`.
 */
class CrashReportingService(
    private val crashDir: File,
    private val json: Json,
    private val maxRecords: Int = DEFAULT_MAX_RECORDS,
    private val clock: () -> Long = { System.currentTimeMillis() },
) {
    @Volatile private var userId: String? = null
    private var previousHandler: Thread.UncaughtExceptionHandler? = null

    /** Install the global uncaught-exception handler. Call once on app startup. */
    fun install() {
        previousHandler = Thread.getDefaultUncaughtExceptionHandler()
        Thread.setDefaultUncaughtExceptionHandler { thread, throwable ->
            runCatching { capture(throwable, fatal = true) }
            previousHandler?.uncaughtException(thread, throwable)
        }
    }

    /** Associate crashes with an anonymized (hashed, 16-char) user id. */
    fun setUser(rawId: String?) {
        userId = rawId?.let { anonymize(it) }
    }

    /** Record a non-fatal error with optional context. */
    fun recordError(throwable: Throwable, context: Map<String, String> = emptyMap()) {
        capture(throwable, fatal = false, context = context)
    }

    /**
     * Unsent records paired with the file backing each one, oldest first.
     *
     * CrashUploader needs the file, not just the record: a record has no id,
     * so there is no other way to delete exactly the one the sink accepted.
     * Draining first and deleting everything would lose whatever failed to
     * upload, which is disproportionately the crashes that happen when the
     * network is worst.
     */
    fun pendingEntries(): List<Pair<File, CrashRecord>> =
        (crashDir.listFiles()?.sortedBy { it.lastModified() } ?: emptyList()).mapNotNull { file ->
            runCatching { json.decodeFromString(CrashRecord.serializer(), file.readText()) }
                .getOrNull()
                ?.let { file to it }
        }

    /** All unsent records, oldest first. */
    fun pendingRecords(): List<CrashRecord> = pendingEntries().map { it.second }

    /** Drain the queue, returning the records that were pending and deleting them. */
    fun flushPendingRecords(): List<CrashRecord> {
        val records = pendingRecords()
        crashDir.listFiles()?.forEach { it.delete() }
        return records
    }

    private fun capture(throwable: Throwable, fatal: Boolean, context: Map<String, String> = emptyMap()) {
        try {
            if (!crashDir.exists()) crashDir.mkdirs()
            val record = CrashRecord(
                timestamp = clock(),
                fatal = fatal,
                type = throwable::class.java.name,
                message = throwable.message ?: "",
                stackTrace = throwable.stackTraceToString(),
                userId = userId,
                context = context,
            )
            val file = File(crashDir, "crash_${clock()}_${counter++}.json")
            file.writeText(json.encodeToString(CrashRecord.serializer(), record))
            file.setLastModified(clock())
            enforceCap()
        } catch (error: Throwable) {
            AppLogger.general.warning("CrashReportingService.capture failed: ${error.message}")
        }
    }

    private fun enforceCap() {
        val files = crashDir.listFiles()?.sortedBy { it.lastModified() } ?: return
        val overflow = files.size - maxRecords
        if (overflow > 0) files.take(overflow).forEach { it.delete() }
    }

    private fun anonymize(value: String): String {
        val digest = MessageDigest.getInstance("SHA-256").digest(value.toByteArray())
        return digest.joinToString("") { "%02x".format(it) }.take(16)
    }

    companion object {
        const val DEFAULT_MAX_RECORDS = 200

        @Volatile
        private var counter = 0
    }
}
