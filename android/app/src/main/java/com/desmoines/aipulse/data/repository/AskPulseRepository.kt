package com.desmoines.aipulse.data.repository

import com.desmoines.aipulse.data.model.LatLng
import com.desmoines.aipulse.util.AppLogger
import io.github.jan.supabase.SupabaseClient
import io.github.jan.supabase.functions.functions
import io.ktor.client.statement.bodyAsText
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.addJsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import kotlinx.serialization.json.putJsonArray
import kotlinx.serialization.json.putJsonObject
import javax.inject.Inject
import javax.inject.Singleton

/** A single chat turn sent to / echoed by the discover-chat function. */
@Serializable
data class DiscoverChatMessage(
    val role: String, // "user" | "assistant"
    val content: String,
)

/** One AI recommendation returned by discover-chat. */
@Serializable
data class DiscoverPick(
    val itemType: String, // "event" | "restaurant" | "attraction"
    val itemId: String,
    val reason: String = "",
)

/** Parsed discover-chat response. Unknown keys (e.g. usage) are ignored. */
@Serializable
data class DiscoverChatResponse(
    val picks: List<DiscoverPick> = emptyList(),
    val followUpSuggestions: List<String> = emptyList(),
)

/** Raised when the server returns HTTP 429 (daily Ask Pulse quota exhausted). */
class QuotaExceededException(message: String = "Daily Ask Pulse limit reached") : Exception(message)

/**
 * Backs the Ask Pulse conversational discovery surface. Mirrors iOS AskPulseService.swift.
 * Calls the shared `discover-chat` edge function.
 */
interface AskPulseRepository {
    suspend fun discover(
        messages: List<DiscoverChatMessage>,
        location: LatLng? = null,
    ): Result<DiscoverChatResponse>
}

@Singleton
class AskPulseRepositoryImpl @Inject constructor(
    private val supabaseClient: SupabaseClient?,
    private val json: Json,
) : AskPulseRepository {

    override suspend fun discover(
        messages: List<DiscoverChatMessage>,
        location: LatLng?,
    ): Result<DiscoverChatResponse> {
        val client = supabaseClient
            ?: return Result.failure(IllegalStateException("Supabase client is not configured."))
        return try {
            // Build the request body with buildJsonObject (proven, unambiguous — matches BillingService).
            val payload = buildJsonObject {
                putJsonArray("messages") {
                    messages.forEach { message ->
                        addJsonObject {
                            put("role", message.role)
                            put("content", message.content)
                        }
                    }
                }
                location?.let {
                    putJsonObject("userLocation") {
                        put("latitude", it.latitude)
                        put("longitude", it.longitude)
                    }
                }
            }
            val response = client.functions("discover-chat", body = payload)
            val status = response.status.value
            when {
                status == 429 -> Result.failure(QuotaExceededException())
                status !in 200..299 -> Result.failure(IllegalStateException("discover-chat failed ($status)"))
                else -> {
                    val body = response.bodyAsText()
                    Result.success(json.decodeFromString(DiscoverChatResponse.serializer(), body))
                }
            }
        } catch (error: Exception) {
            AppLogger.network.warning("discover-chat failed: ${error.message}")
            if (isQuotaError(error)) Result.failure(QuotaExceededException()) else Result.failure(error)
        }
    }

    /** Some Supabase/Ktor configs throw on non-2xx — detect 429 from the message. */
    private fun isQuotaError(error: Throwable): Boolean {
        val message = (error.message ?: "").lowercase()
        return "429" in message || "limit reached" in message || "too many" in message
    }
}
