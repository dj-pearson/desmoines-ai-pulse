package com.desmoines.aipulse.data.remote

import android.content.SharedPreferences
import androidx.core.content.edit
import io.ktor.client.HttpClient
import io.ktor.client.engine.okhttp.OkHttp
import io.ktor.client.plugins.HttpTimeout
import io.ktor.client.request.get
import io.ktor.client.statement.bodyAsText
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import javax.inject.Inject
import javax.inject.Singleton
import kotlin.math.abs

/**
 * Tiny client for the Open-Meteo current-conditions API. Mirrors iOS
 * WeatherService.swift — same buckets, same 30-minute cache, same dedup.
 * Powers the "Right Now" ribbon on Home (IOS-DISCOVER-2026-005).
 */
@Singleton
class WeatherService @Inject constructor(
    private val prefs: SharedPreferences,
    private val json: Json,
) {

    enum class Conditions(val raw: String, val humanLabel: String) {
        CLEAR("clear", "sunny"),
        CLOUDY("cloudy", "cloudy"),
        RAIN("rain", "rainy"),
        SNOW("snow", "snowy"),
        FOG("fog", "foggy"),
        THUNDER("thunder", "stormy"),
        UNKNOWN("unknown", "");

        companion object {
            fun from(raw: String?): Conditions = entries.firstOrNull { it.raw == raw } ?: UNKNOWN
        }
    }

    @Serializable
    data class Snapshot(
        val temperatureF: Double,
        val conditionsRaw: String,
        val fetchedAt: Long,
        val latitude: Double,
        val longitude: Double,
    ) {
        val conditions: Conditions get() = Conditions.from(conditionsRaw)
        val isStale: Boolean get() = System.currentTimeMillis() - fetchedAt > 30 * 60 * 1000
    }

    private val httpClient by lazy {
        HttpClient(OkHttp) {
            install(HttpTimeout) { requestTimeoutMillis = 6000 }
        }
    }

    private val cacheKey = "weather.snapshot.v1"

    fun cached(): Snapshot? {
        val raw = prefs.getString(cacheKey, null) ?: return null
        return try {
            json.decodeFromString(Snapshot.serializer(), raw)
        } catch (_: Exception) {
            null
        }
    }

    suspend fun refresh(latitude: Double, longitude: Double): Snapshot? = withContext(Dispatchers.IO) {
        val existing = cached()
        if (existing != null && !existing.isStale &&
            abs(existing.latitude - latitude) < 0.05 &&
            abs(existing.longitude - longitude) < 0.05
        ) {
            return@withContext existing
        }

        try {
            val url = "https://api.open-meteo.com/v1/forecast" +
                "?latitude=$latitude&longitude=$longitude" +
                "&current=temperature_2m,weather_code&temperature_unit=fahrenheit"
            val response = httpClient.get(url)
            if (response.status.value !in 200..299) return@withContext existing
            val body = response.bodyAsText()
            val payload = json.decodeFromString(Payload.serializer(), body)
            val snap = Snapshot(
                temperatureF = payload.current.temperature_2m,
                conditionsRaw = bucket(payload.current.weather_code).raw,
                fetchedAt = System.currentTimeMillis(),
                latitude = latitude,
                longitude = longitude,
            )
            prefs.edit { putString(cacheKey, json.encodeToString(Snapshot.serializer(), snap)) }
            snap
        } catch (_: Exception) {
            existing
        }
    }

    @Serializable
    private data class Payload(val current: Current) {
        @Serializable
        data class Current(val temperature_2m: Double, val weather_code: Int)
    }

    private fun bucket(code: Int): Conditions = when (code) {
        0 -> Conditions.CLEAR
        1, 2, 3 -> Conditions.CLOUDY
        45, 48 -> Conditions.FOG
        51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82 -> Conditions.RAIN
        71, 73, 75, 77, 85, 86 -> Conditions.SNOW
        95, 96, 99 -> Conditions.THUNDER
        else -> Conditions.UNKNOWN
    }
}
