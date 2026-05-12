package com.desmoines.aipulse.data.remote

import android.content.SharedPreferences
import androidx.core.content.edit
import io.github.jan.supabase.SupabaseClient
import io.github.jan.supabase.auth.auth
import io.github.jan.supabase.postgrest.from
import io.github.jan.supabase.postgrest.postgrest
import io.github.jan.supabase.postgrest.query.Order
import io.github.jan.supabase.postgrest.rpc
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import java.time.Instant
import java.util.UUID
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Manages shared swipe sessions for group decision mode.
 * Mirrors iOS SwipeSessionService.swift.
 */
@Singleton
class SwipeSessionService @Inject constructor(
    private val supabaseClient: SupabaseClient?,
    private val prefs: SharedPreferences,
) {

    @Serializable
    data class Session(
        val id: String,
        val code: String,
        val mode: String,
        val status: String,
        @SerialName("expires_at") val expiresAt: String? = null,
        @SerialName("ended_at") val endedAt: String? = null,
    )

    @Serializable
    data class Participant(
        val id: String,
        @SerialName("user_id") val userId: String? = null,
        @SerialName("anon_id") val anonId: String? = null,
        @SerialName("display_name") val displayName: String? = null,
        @SerialName("joined_at") val joinedAt: String? = null,
    )

    @Serializable
    data class Match(
        @SerialName("item_type") val itemType: String,
        @SerialName("item_id") val itemId: String,
        @SerialName("match_count") val matchCount: Int,
    )

    @Serializable
    private data class CodeRow(val code: String)

    @Serializable
    private data class InsertSession(val code: String, val host_user_id: String, val mode: String)

    @Serializable
    private data class AuthedParticipant(val session_id: String, val user_id: String, val display_name: String?)

    @Serializable
    private data class AnonParticipant(val session_id: String, val anon_id: String, val display_name: String?)

    @Serializable
    private data class UpdateEnd(val status: String, val ended_at: String)

    @Serializable
    private data class MatchParams(val p_session_id: String)

    sealed class SessionError(message: String) : Exception(message) {
        data object NotConfigured : SessionError("Group sessions not configured.")
        data object CodeGenerationFailed : SessionError("Couldn't generate a session code.")
        data object InsertFailed : SessionError("Couldn't create the session.")
        data object NotFound : SessionError("That session code doesn't exist or has expired.")
        data object NotAuthenticated : SessionError("Sign in to host a session.")
    }

    private val anonIdKey = "swipe_session.anon_id"

    val deviceAnonId: String
        get() {
            prefs.getString(anonIdKey, null)?.let { return it }
            val new = UUID.randomUUID().toString()
            prefs.edit { putString(anonIdKey, new) }
            return new
        }

    suspend fun startSession(mode: String = "mixed"): Session {
        val client = supabaseClient ?: throw SessionError.NotConfigured
        val userId = client.auth.currentSessionOrNull()?.user?.id
            ?: throw SessionError.NotAuthenticated

        val codeRows = client.postgrest.rpc("generate_swipe_session_code").decodeList<CodeRow>()
        val code = codeRows.firstOrNull()?.code ?: throw SessionError.CodeGenerationFailed

        val inserted = client.from("swipe_sessions").insert(
            InsertSession(code = code, host_user_id = userId, mode = mode),
        ) { select() }.decodeList<Session>()
        val created = inserted.firstOrNull() ?: throw SessionError.InsertFailed

        // Auto-join host
        runCatching { join(created, displayName = "Host") }

        return created
    }

    suspend fun endSession(session: Session) {
        val client = supabaseClient ?: throw SessionError.NotConfigured
        client.from("swipe_sessions").update(
            UpdateEnd(status = "ended", ended_at = Instant.now().toString())
        ) {
            filter { eq("id", session.id) }
        }
    }

    suspend fun lookupSession(byCode: String): Session {
        val client = supabaseClient ?: throw SessionError.NotConfigured
        val normalized = byCode.uppercase()
        val rows = client.from("swipe_sessions").select {
            filter {
                eq("code", normalized)
                eq("status", "active")
            }
            limit(1)
        }.decodeList<Session>()
        return rows.firstOrNull() ?: throw SessionError.NotFound
    }

    suspend fun join(session: Session, displayName: String? = null) {
        val client = supabaseClient ?: throw SessionError.NotConfigured
        val userId = runCatching { client.auth.currentSessionOrNull()?.user?.id }.getOrNull()
        if (userId != null) {
            runCatching {
                client.from("swipe_session_participants").insert(
                    AuthedParticipant(session_id = session.id, user_id = userId, display_name = displayName),
                )
            }
        } else {
            runCatching {
                client.from("swipe_session_participants").insert(
                    AnonParticipant(session_id = session.id, anon_id = deviceAnonId, display_name = displayName ?: "Guest"),
                )
            }
        }
    }

    suspend fun fetchMatches(session: Session): List<Match> {
        val client = supabaseClient ?: throw SessionError.NotConfigured
        return client.postgrest.rpc(
            function = "get_swipe_session_matches",
            parameters = MatchParams(p_session_id = session.id),
        ).decodeList()
    }

    suspend fun fetchParticipants(session: Session): List<Participant> {
        val client = supabaseClient ?: throw SessionError.NotConfigured
        return client.from("swipe_session_participants").select {
            filter { eq("session_id", session.id) }
            order("joined_at", Order.ASCENDING)
        }.decodeList()
    }
}
