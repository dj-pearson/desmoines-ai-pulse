package com.desmoines.aipulse.data.model

import androidx.compose.runtime.Immutable
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import java.time.OffsetDateTime

/** A group swipe session (`swipe_sessions`). Mirrors iOS SwipeSession. */
@Immutable
@Serializable
data class SwipeSession(
    val id: String,
    val code: String,
    @SerialName("host_user_id") val hostUserId: String,
    val mode: String = "mixed",
    val status: String = "active",
    @SerialName("expires_at") val expiresAt: String? = null,
    @SerialName("ended_at") val endedAt: String? = null,
    @SerialName("created_at") val createdAt: String? = null,
) {
    val isEnded: Boolean get() = status == "ended"

    fun isExpired(now: OffsetDateTime = OffsetDateTime.now()): Boolean {
        val exp = expiresAt?.let { runCatching { OffsetDateTime.parse(it) }.getOrNull() } ?: return false
        return now.isAfter(exp)
    }

    /** Active = status active and not past its 4h window. */
    fun isLive(now: OffsetDateTime = OffsetDateTime.now()): Boolean = !isEnded && !isExpired(now)
}

/** A participant in a group session (`swipe_session_participants`). */
@Immutable
@Serializable
data class SessionParticipant(
    val id: String,
    @SerialName("session_id") val sessionId: String,
    @SerialName("user_id") val userId: String? = null,
    @SerialName("anon_id") val anonId: String? = null,
    @SerialName("display_name") val displayName: String? = null,
    @SerialName("joined_at") val joinedAt: String? = null,
) {
    val name: String get() = displayName?.trim()?.takeIf { it.isNotEmpty() } ?: "Guest"
}

/**
 * A mutual match in a session: an item right-swiped by ≥2 participants,
 * from `get_swipe_session_matches`. [name]/[imageUrl] are enriched client-side.
 */
@Immutable
data class SwipeSessionMatch(
    val itemType: String,
    val itemId: String,
    val matchCount: Int,
    val name: String,
    val imageUrl: String?,
) {
    val matchLabel: String get() = if (matchCount == 1) "1 like" else "$matchCount likes"
}

/** The session this device is currently part of (host or joined). In-memory. */
@Immutable
data class ActiveGroupSession(
    val sessionId: String,
    val code: String,
    val mode: String,
    val isHost: Boolean,
)
