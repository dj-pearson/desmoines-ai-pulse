package com.desmoines.aipulse.util

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.KSerializer
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import java.io.File
import java.security.MessageDigest

/**
 * File-backed LRU cache for API query results. Mirrors iOS QueryCache.swift.
 *
 * - Each entry is a JSON envelope file under [cacheDir], named by a hash of the key.
 * - Entries carry a per-key TTL (default [Config.CACHE_EXPIRATION_MINUTES]).
 * - `get(allowStale = true)` returns an expired value (used for offline cold-start).
 * - A disk budget ([maxBytes], default 50 MB) is enforced by LRU eviction on write,
 *   using file mtime as the recency signal (reads touch the file).
 * - [prune] drops entries older than a hard limit; call it once on app launch.
 *
 * Kept free of Android Context so it is unit-testable on the plain JVM — the Hilt
 * provider supplies `context.cacheDir`. [clock] is injectable for deterministic tests.
 */
class QueryCache(
    private val cacheDir: File,
    private val json: Json,
    private val maxBytes: Long = DEFAULT_MAX_BYTES,
    private val clock: () -> Long = { System.currentTimeMillis() },
) {

    @Serializable
    private data class Envelope(
        val storedAt: Long,
        val ttlMillis: Long,
        val payload: String,
    )

    /** Store [value] under [key] with a TTL of [ttlMinutes]. */
    suspend fun <T> set(
        key: String,
        value: T,
        serializer: KSerializer<T>,
        ttlMinutes: Int = Config.CACHE_EXPIRATION_MINUTES,
    ) = withContext(Dispatchers.IO) {
        try {
            ensureDir()
            val envelope = Envelope(
                storedAt = clock(),
                ttlMillis = ttlMinutes.toLong() * 60_000L,
                payload = json.encodeToString(serializer, value),
            )
            val file = fileFor(key)
            file.writeText(json.encodeToString(Envelope.serializer(), envelope))
            file.setLastModified(clock())
            enforceBudget()
        } catch (error: Throwable) {
            AppLogger.cache.warning("QueryCache.set failed for '$key': ${error.message}")
        }
    }

    /**
     * Return the value for [key], or null on a miss.
     * When [allowStale] is true an expired value is still returned (offline fallback);
     * callers typically pass `allowStale = !isConnected`.
     */
    suspend fun <T> get(
        key: String,
        serializer: KSerializer<T>,
        allowStale: Boolean = false,
    ): T? = withContext(Dispatchers.IO) {
        val file = fileFor(key)
        if (!file.exists()) return@withContext null
        try {
            val envelope = json.decodeFromString(Envelope.serializer(), file.readText())
            val age = clock() - envelope.storedAt
            val expired = age > envelope.ttlMillis
            if (expired && !allowStale) return@withContext null
            file.setLastModified(clock()) // touch for LRU recency
            json.decodeFromString(serializer, envelope.payload)
        } catch (error: Throwable) {
            // Corrupt or unreadable entry — drop it, never crash the caller.
            AppLogger.cache.warning("QueryCache.get failed for '$key': ${error.message}")
            file.delete()
            null
        }
    }

    /** Delete entries older than [hardLimitHours]. Call on app launch. */
    suspend fun prune(hardLimitHours: Int = DEFAULT_HARD_LIMIT_HOURS) = withContext(Dispatchers.IO) {
        val cutoff = clock() - hardLimitHours.toLong() * 3_600_000L
        cacheDir.listFiles()?.forEach { file ->
            if (file.lastModified() < cutoff) file.delete()
        }
        Unit
    }

    /** Remove every cached entry (e.g. on sign-out). */
    suspend fun clear() = withContext(Dispatchers.IO) {
        cacheDir.listFiles()?.forEach { it.delete() }
        Unit
    }

    private fun ensureDir() {
        if (!cacheDir.exists()) cacheDir.mkdirs()
    }

    private fun enforceBudget() {
        val files = cacheDir.listFiles()?.toMutableList() ?: return
        var total = files.sumOf { it.length() }
        if (total <= maxBytes) return
        // Evict least-recently-used (oldest mtime) first until under budget.
        files.sortBy { it.lastModified() }
        val iterator = files.iterator()
        while (total > maxBytes && iterator.hasNext()) {
            val file = iterator.next()
            val size = file.length()
            if (file.delete()) total -= size
        }
    }

    private fun fileFor(key: String): File = File(cacheDir, hash(key))

    private fun hash(key: String): String {
        val digest = MessageDigest.getInstance("SHA-256").digest(key.toByteArray())
        return digest.joinToString("") { "%02x".format(it) }
    }

    companion object {
        const val DEFAULT_MAX_BYTES = 50L * 1024 * 1024 // 50 MB
        const val DEFAULT_HARD_LIMIT_HOURS = 24
    }
}
