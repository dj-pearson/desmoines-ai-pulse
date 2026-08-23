package com.desmoines.aipulse.data.repository

import com.desmoines.aipulse.data.model.LatLng
import com.desmoines.aipulse.util.AppLogger
import io.github.jan.supabase.SupabaseClient
import io.github.jan.supabase.functions.functions
import io.ktor.client.statement.bodyAsText
import kotlinx.serialization.KSerializer
import kotlinx.serialization.Serializable
import kotlinx.serialization.descriptors.PrimitiveKind
import kotlinx.serialization.descriptors.PrimitiveSerialDescriptor
import kotlinx.serialization.descriptors.SerialDescriptor
import kotlinx.serialization.encoding.Decoder
import kotlinx.serialization.encoding.Encoder
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonDecoder
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.addJsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.intOrNull
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

/**
 * Remaining Ask Pulse messages for today.
 *
 * The server sends EITHER an Int or the literal string "unlimited" for the same
 * field, depending on tier (XPLAT-009). That is why this needs a custom
 * serializer rather than a field: a decoder that handles one shape throws for
 * exactly one tier, and it would be the paying one.
 */
@Serializable(with = RemainingValueSerializer::class)
sealed interface RemainingValue {
    data object Unlimited : RemainingValue
    data class Count(val value: Int) : RemainingValue

    /** What the UI shows. Mirrors iOS RemainingValue.displayString verbatim. */
    val displayString: String
        get() = when (this) {
            is Unlimited -> "unlimited"
            is Count -> "$value left today"
        }
}

object RemainingValueSerializer : KSerializer<RemainingValue> {
    override val descriptor: SerialDescriptor =
        PrimitiveSerialDescriptor("RemainingValue", PrimitiveKind.STRING)

    override fun deserialize(decoder: Decoder): RemainingValue {
        val element = (decoder as JsonDecoder).decodeJsonElement()
        val primitive = element as? JsonPrimitive ?: return RemainingValue.Count(0)
        primitive.intOrNull?.let { return RemainingValue.Count(it) }
        // Anything non-numeric that is not "unlimited" is unrecognised, and
        // reporting a made-up number would be worse than reporting none - so it
        // falls to zero, which the UI renders as "0 left today".
        return if (primitive.content == "unlimited") RemainingValue.Unlimited else RemainingValue.Count(0)
    }

    override fun serialize(encoder: Encoder, value: RemainingValue) {
        when (value) {
            is RemainingValue.Unlimited -> encoder.encodeString("unlimited")
            is RemainingValue.Count -> encoder.encodeInt(value.value)
        }
    }
}

/** Quota block from discover-chat. */
@Serializable
data class AskPulseUsage(
    val remaining: RemainingValue,
    val tier: String = "",
)

/**
 * Parsed discover-chat response.
 *
 * `usage` used to be dropped on the floor under a comment saying unknown keys
 * are ignored, so Android users learned about the daily limit by hitting it -
 * the 429 was the entire UI for it (XPLAT-009 AC3). It is optional because an
 * older function version may not send it.
 */
@Serializable
data class DiscoverChatResponse(
    val picks: List<DiscoverPick> = emptyList(),
    val followUpSuggestions: List<String> = emptyList(),
    val usage: AskPulseUsage? = null,
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
