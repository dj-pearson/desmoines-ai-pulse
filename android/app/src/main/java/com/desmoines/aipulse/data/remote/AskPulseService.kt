package com.desmoines.aipulse.data.remote

import io.github.jan.supabase.SupabaseClient
import io.github.jan.supabase.functions.functions
import io.ktor.client.statement.bodyAsText
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.intOrNull
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Client for the discover-chat (Ask Pulse) edge function.
 * Mirrors iOS AskPulseService.swift.
 */
@Singleton
class AskPulseService @Inject constructor(
    private val supabaseClient: SupabaseClient?,
    private val json: Json,
) {

    @Serializable
    data class RequestMessage(val role: String, val content: String)

    @Serializable
    data class LocationPayload(val latitude: Double, val longitude: Double)

    @Serializable
    data class Payload(
        val messages: List<RequestMessage>,
        val userLocation: LocationPayload? = null,
    )

    @Serializable
    data class Pick(
        val itemType: String,
        val itemId: String,
        val reason: String,
    )

    @Serializable
    data class Usage(
        val remaining: JsonElement? = null,
        val tier: String? = null,
    ) {
        val remainingDisplay: String
            get() = when (val r = remaining) {
                null -> ""
                is JsonPrimitive -> r.intOrNull?.let { "$it left today" }
                    ?: r.contentOrNull?.let { if (it == "unlimited") "unlimited" else it }
                    ?: ""
                else -> ""
            }
    }

    @Serializable
    data class Response(
        val picks: List<Pick> = emptyList(),
        val followUpSuggestions: List<String> = emptyList(),
        val usage: Usage? = null,
    )

    sealed class AskPulseError(message: String) : Exception(message) {
        data object NotConfigured : AskPulseError("Ask Pulse is not configured.")
        data object QuotaExceeded : AskPulseError("You've hit today's Ask Pulse limit. Upgrade for more.")
    }

    suspend fun ask(
        history: List<RequestMessage>,
        userLat: Double? = null,
        userLon: Double? = null,
    ): Response {
        val client = supabaseClient ?: throw AskPulseError.NotConfigured
        val payload = Payload(
            messages = history,
            userLocation = if (userLat != null && userLon != null) LocationPayload(userLat, userLon) else null,
        )
        val response = client.functions("discover-chat", body = payload)
        val text = response.bodyAsText()
        if (response.status.value == 429) throw AskPulseError.QuotaExceeded
        if (response.status.value !in 200..299) {
            throw RuntimeException("discover-chat HTTP ${response.status.value}: $text")
        }
        return json.decodeFromString(Response.serializer(), text)
    }
}
