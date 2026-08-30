package com.desmoines.aipulse.data.remote

import com.desmoines.aipulse.data.model.SessionParticipant
import com.desmoines.aipulse.data.model.SwipeSession
import com.desmoines.aipulse.data.model.SwipeSessionMatch
import io.github.jan.supabase.SupabaseClient
import io.github.jan.supabase.postgrest.from
import io.github.jan.supabase.postgrest.postgrest
import io.github.jan.supabase.postgrest.query.Columns
import io.github.jan.supabase.postgrest.query.Order
import io.github.jan.supabase.postgrest.rpc
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import javax.inject.Inject
import javax.inject.Singleton

/** Hosts / joins group swipe sessions and resolves mutual matches. Mirrors iOS SwipeSessionService. */
@Singleton
class GroupSessionRemoteDataSource @Inject constructor(
    private val supabaseClient: SupabaseClient?,
) {
    private fun db(): SupabaseClient =
        supabaseClient ?: throw IllegalStateException("Supabase client is not configured.")

    @Serializable
    private data class SessionInsert(
        val code: String,
        @SerialName("host_user_id") val hostUserId: String,
        val mode: String,
    )

    /**
     * Creates a session hosted by [hostUserId] with a fresh DSM-XXXX code.
     * Generated client-side; the table's UNIQUE(code) guards collisions, so a
     * failed insert is retried with a new code before giving up.
     */
    suspend fun createSession(hostUserId: String, mode: String): SwipeSession {
        var lastError: Throwable? = null
        repeat(MAX_CODE_ATTEMPTS) {
            val code = randomCode()
            val inserted = runCatching {
                db().from("swipe_sessions").insert(SessionInsert(code, hostUserId, mode))
            }
            if (inserted.isSuccess) {
                return fetchByCode(code) ?: throw IllegalStateException("Session created but could not be loaded.")
            }
            lastError = inserted.exceptionOrNull()
        }
        throw lastError ?: IllegalStateException("Couldn't create a session.")
    }

    private fun randomCode(): String {
        val suffix = (1..4).map { CODE_CHARS.random() }.joinToString("")
        return "DSM-$suffix"
    }

    /** Looks up a session by its shareable code (any case), or null. */
    suspend fun fetchByCode(code: String): SwipeSession? =
        db().from("swipe_sessions").select {
            filter { eq("code", code.trim().uppercase()) }
            limit(1L)
        }.decodeSingleOrNull<SwipeSession>()

    suspend fun fetchSession(sessionId: String): SwipeSession? =
        db().from("swipe_sessions").select {
            filter { eq("id", sessionId) }
            limit(1L)
        }.decodeSingleOrNull<SwipeSession>()

    @Serializable
    private data class ParticipantInsert(
        @SerialName("session_id") val sessionId: String,
        @SerialName("user_id") val userId: String,
        @SerialName("display_name") val displayName: String?,
    )

    /** Adds a participant; idempotent per (session, user) via the unique index. */
    suspend fun addParticipant(sessionId: String, userId: String, displayName: String?) {
        runCatching {
            db().from("swipe_session_participants").insert(
                ParticipantInsert(sessionId = sessionId, userId = userId, displayName = displayName),
            )
        }
        // A duplicate (already joined) is fine — swallow the unique-violation.
    }

    suspend fun fetchParticipants(sessionId: String): List<SessionParticipant> =
        db().from("swipe_session_participants").select {
            filter { eq("session_id", sessionId) }
            order("joined_at", Order.ASCENDING)
        }.decodeList<SessionParticipant>()

    @Serializable
    private data class StatusUpdate(val status: String, @SerialName("ended_at") val endedAt: String? = null)

    /** Ends a session (host only, enforced by RLS). */
    suspend fun endSession(sessionId: String) {
        db().from("swipe_sessions").update(StatusUpdate(status = "ended")) {
            filter { eq("id", sessionId) }
        }
    }

    @Serializable
    private data class MatchParams(@SerialName("p_session_id") val sessionId: String)

    @Serializable
    private data class MatchRow(
        @SerialName("item_type") val itemType: String,
        @SerialName("item_id") val itemId: String,
        @SerialName("match_count") val matchCount: Long,
    )

    @Serializable
    private data class EntityRow(
        val id: String,
        val name: String? = null,
        val title: String? = null,
        @SerialName("image_url") val imageUrl: String? = null,
    )

    /** Mutual matches (items ≥2 participants liked), name/image-enriched fail-soft. */
    suspend fun fetchMatches(sessionId: String): List<SwipeSessionMatch> {
        val rows = db().postgrest.rpc("get_swipe_session_matches", MatchParams(sessionId = sessionId))
            .decodeList<MatchRow>()
        if (rows.isEmpty()) return emptyList()

        val byType = rows.groupBy({ it.itemType }, { it.itemId })
        val enrich = mutableMapOf<String, EntityRow>()
        byType.forEach { (type, ids) ->
            runCatching { fetchEntities(type, ids) }.getOrNull()?.forEach { enrich[it.id] = it }
        }

        return rows.map { r ->
            val e = enrich[r.itemId]
            SwipeSessionMatch(
                itemType = r.itemType,
                itemId = r.itemId,
                matchCount = r.matchCount.toInt(),
                name = e?.name ?: e?.title ?: "Unknown",
                imageUrl = e?.imageUrl,
            )
        }
    }

    private suspend fun fetchEntities(itemType: String, ids: List<String>): List<EntityRow> {
        if (ids.isEmpty()) return emptyList()
        val (table, nameCol) = when (itemType) {
            "restaurant" -> "restaurants" to "name"
            "attraction" -> "attractions" to "name"
            "event" -> "events" to "title"
            else -> return emptyList()
        }
        return db().from(table).select(Columns.list("id", nameCol, "image_url")) {
            filter { isIn("id", ids) }
        }.decodeList<EntityRow>()
    }

    private companion object {
        const val CODE_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
        const val MAX_CODE_ATTEMPTS = 4
    }
}
