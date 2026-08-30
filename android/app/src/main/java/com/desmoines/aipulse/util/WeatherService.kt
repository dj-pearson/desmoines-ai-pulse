package com.desmoines.aipulse.util

import android.content.SharedPreferences
import androidx.compose.runtime.Immutable
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import okhttp3.OkHttpClient
import okhttp3.Request
import java.util.concurrent.TimeUnit
import javax.inject.Inject
import javax.inject.Singleton
import kotlin.math.abs
import kotlin.math.roundToInt

/** Coarse current-condition bucket. Mirrors iOS WeatherService.Condition. */
@Serializable
enum class WeatherCondition { CLEAR, CLOUDY, RAIN, SNOW, FOG, THUNDER, UNKNOWN }

/** A cached weather reading. */
@Immutable
@Serializable
data class WeatherSnapshot(
    val temperatureF: Double,
    val condition: WeatherCondition,
    val fetchedAt: Long,
    val lat: Double,
    val lon: Double,
)

/**
 * Current conditions from Open-Meteo (keyless public API). Mirrors iOS WeatherService.swift.
 *
 * Privacy: coordinates are rounded to ~1 km before the request. Results are cached
 * 30 min; cached values are served when offline. Feeds the optional "Right Now" ribbon.
 */
@Singleton
class WeatherService(
    private val prefs: SharedPreferences,
    private val json: Json,
    private val clock: () -> Long,
) {
    // Hilt uses this 2-arg constructor; the 3-arg primary is for tests (injectable clock).
    @Inject
    constructor(prefs: SharedPreferences, json: Json) :
        this(prefs, json, { System.currentTimeMillis() })

    private val httpClient: OkHttpClient by lazy {
        OkHttpClient.Builder()
            .connectTimeout(TIMEOUT_SECONDS, TimeUnit.SECONDS)
            .readTimeout(TIMEOUT_SECONDS, TimeUnit.SECONDS)
            .build()
    }

    @Serializable
    private data class OpenMeteoResponse(val current: Current? = null) {
        @Serializable
        data class Current(
            val temperature_2m: Double? = null,
            val weather_code: Int? = null,
        )
    }

    /** Current conditions for [lat]/[lon], using cache when fresh or offline. */
    suspend fun current(lat: Double, lon: Double): WeatherSnapshot? {
        val rLat = roundCoord(lat)
        val rLon = roundCoord(lon)
        val cached = loadCache()
        if (cached != null && !shouldRefetch(cached, rLat, rLon, clock())) {
            return cached
        }
        val fresh = fetch(rLat, rLon)
        return when {
            fresh != null -> fresh.also { saveCache(it) }
            else -> cached // offline / failure → stale cache (may be null)
        }
    }

    private suspend fun fetch(lat: Double, lon: Double): WeatherSnapshot? = withContext(Dispatchers.IO) {
        try {
            val url = "https://api.open-meteo.com/v1/forecast" +
                "?latitude=$lat&longitude=$lon" +
                "&current=temperature_2m,weather_code&temperature_unit=fahrenheit"
            val request = Request.Builder().url(url).build()
            httpClient.newCall(request).execute().use { response ->
                if (!response.isSuccessful) return@withContext null
                val body = response.body?.string() ?: return@withContext null
                val parsed = json.decodeFromString(OpenMeteoResponse.serializer(), body)
                val temp = parsed.current?.temperature_2m ?: return@withContext null
                val code = parsed.current.weather_code ?: 0
                WeatherSnapshot(temp, bucketFor(code), clock(), lat, lon)
            }
        } catch (error: Throwable) {
            AppLogger.network.warning("WeatherService.fetch failed: ${error.message}")
            null
        }
    }

    private fun loadCache(): WeatherSnapshot? {
        val raw = prefs.getString(CACHE_KEY, null) ?: return null
        return runCatching { json.decodeFromString(WeatherSnapshot.serializer(), raw) }.getOrNull()
    }

    private fun saveCache(snapshot: WeatherSnapshot) {
        prefs.edit().putString(CACHE_KEY, json.encodeToString(WeatherSnapshot.serializer(), snapshot)).apply()
    }

    companion object {
        const val CACHE_KEY = "weather_snapshot"
        const val CACHE_TTL_MILLIS = 30L * 60_000L // 30 min
        const val TIMEOUT_SECONDS = 6L
        const val MIN_MOVE_DEGREES = 0.05

        /** Round a coordinate to ~1 km (2 decimal places). */
        fun roundCoord(value: Double): Double = (value * 100).roundToInt() / 100.0

        /** Map a WMO weather code to a coarse [WeatherCondition]. */
        fun bucketFor(code: Int): WeatherCondition = when (code) {
            0 -> WeatherCondition.CLEAR
            1, 2, 3 -> WeatherCondition.CLOUDY
            45, 48 -> WeatherCondition.FOG
            51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82 -> WeatherCondition.RAIN
            71, 73, 75, 77, 85, 86 -> WeatherCondition.SNOW
            95, 96, 99 -> WeatherCondition.THUNDER
            else -> WeatherCondition.UNKNOWN
        }

        /** True when the cache is stale or the device moved appreciably. */
        fun shouldRefetch(prev: WeatherSnapshot, lat: Double, lon: Double, now: Long): Boolean {
            val stale = now - prev.fetchedAt >= CACHE_TTL_MILLIS
            val moved = abs(prev.lat - lat) >= MIN_MOVE_DEGREES || abs(prev.lon - lon) >= MIN_MOVE_DEGREES
            return stale || moved
        }
    }
}
