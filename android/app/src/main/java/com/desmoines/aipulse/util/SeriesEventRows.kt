package com.desmoines.aipulse.util

import com.desmoines.aipulse.data.model.Event
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.SerializationException
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject

/**
 * AND-AUDIT-042, slice 3a: turns the series read's response body into
 * [SeriesEventRow]s.
 *
 * Each element is one `events` object; it is decoded twice, once as an
 * [Event] and once as the three switches [EventSeriesSchedule] decides on,
 * so Event stays the shape every other screen decodes.
 *
 * Lossy on purpose, as iOS LossySeriesRows is: a series spans years of rows
 * written by several scrapers, and one old row with a null title must not
 * blank the whole page. A row that does not decode is dropped. A body that is
 * not a JSON array is an error, because that is not a list of rows at all.
 */
object SeriesEventRows {

    @Serializable
    private data class Flags(
        @SerialName("is_hidden") val isHidden: Boolean? = null,
        @SerialName("hidden_at") val hiddenAt: String? = null,
        @SerialName("archived_at") val archivedAt: String? = null,
    )

    private val json = Json {
        ignoreUnknownKeys = true
        coerceInputValues = true
        isLenient = true
    }

    /** @throws SerializationException when [body] is not a JSON array. */
    fun decode(body: String): List<SeriesEventRow> {
        val array = json.parseToJsonElement(body) as? JsonArray
            ?: throw SerializationException("Expected a JSON array of events rows")
        return array.mapNotNull { element ->
            if (element !is JsonObject) return@mapNotNull null
            try {
                val event = json.decodeFromJsonElement(Event.serializer(), element)
                val flags = json.decodeFromJsonElement(Flags.serializer(), element)
                SeriesEventRow(event, flags.isHidden, flags.hiddenAt, flags.archivedAt)
            } catch (e: IllegalArgumentException) {
                // SerializationException is one; a missing required field or
                // a wrong type lands here.
                null
            }
        }
    }
}
