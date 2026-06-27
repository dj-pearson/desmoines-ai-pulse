package com.desmoines.aipulse.util

import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import com.desmoines.aipulse.data.repository.AuthRepository
import dagger.hilt.android.qualifiers.ApplicationContext
import io.github.jan.supabase.SupabaseClient
import io.github.jan.supabase.postgrest.from
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.builtins.serializer
import kotlinx.serialization.json.Json
import javax.inject.Inject
import javax.inject.Singleton

private val Context.swipeStore: DataStore<Preferences> by
    preferencesDataStore(name = "discover_swipes")

/**
 * Records swipe-to-discover signals (ANDP-022). Best-effort and fire-and-forget:
 * always logs locally first (so the deck can skip already-swiped items and the
 * For You layer reads history offline), then flushes to `swipe_interactions`
 * when authenticated. Network errors are queued and retried on the next swipe.
 * Mirrors iOS `SwipeInteractionService`.
 */
@Singleton
class SwipeInteractionService @Inject constructor(
    @param:ApplicationContext private val context: Context,
    private val json: Json,
    private val authRepository: AuthRepository,
    private val supabaseClient: SupabaseClient?,
) {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val swipedOrderKey = stringPreferencesKey("swiped_order")
    private val pendingKey = stringPreferencesKey("pending_swipes")
    private val stringListSerializer = ListSerializer(String.serializer())
    private val pendingListSerializer = ListSerializer(PendingSwipe.serializer())

    enum class Action(val value: String) { LIKE("like"), SKIP("skip"), BOOST("boost"), DETAIL("detail") }

    /** Keys (`itemType:itemId`) the user has already swiped on; used to dedupe the deck. */
    val swipedKeys: StateFlow<Set<String>> = context.swipeStore.data
        .map { prefs -> decodeOrder(prefs[swipedOrderKey]).toSet() }
        .stateIn(scope, SharingStarted.Eagerly, emptySet())

    fun hasSwiped(itemType: String, itemId: String): Boolean =
        swipedKeys.value.contains(key(itemType, itemId))

    /**
     * Record a swipe. Always updates the local dedupe set + queue; flushes to the
     * backend when signed in. Safe to call fire-and-forget.
     */
    suspend fun record(
        action: Action,
        itemType: String,
        itemId: String,
        sourceContext: Map<String, List<String>>? = null,
        sessionId: String? = null,
    ) {
        val k = key(itemType, itemId)
        context.swipeStore.edit { prefs ->
            // Bounded, insertion-ordered dedupe set (most-recent-last), capped.
            val current = decodeOrder(prefs[swipedOrderKey])
            val next = appendCapped(current, k, MAX_SWIPED_KEYS)
            if (next !== current) {
                prefs[swipedOrderKey] = json.encodeToString(stringListSerializer, next)
            }
            val pending = decodePending(prefs[pendingKey]) +
                PendingSwipe(itemType = itemType, itemId = itemId, action = action.value, sourceContext = sourceContext, sessionId = sessionId)
            prefs[pendingKey] = json.encodeToString(pendingListSerializer, pending)
        }
        flushPending()
    }

    /** Clear local swipe history (sign-out / privacy controls). */
    suspend fun reset() {
        context.swipeStore.edit { it.remove(swipedOrderKey); it.remove(pendingKey) }
    }

    private suspend fun flushPending() {
        val client = supabaseClient ?: return
        val userId = authRepository.currentUserId ?: return
        val queue = decodePending(context.swipeStore.data.first()[pendingKey])
        if (queue.isEmpty()) return

        val rows = queue.map {
            InsertRow(
                userId = userId,
                itemType = it.itemType,
                itemId = it.itemId,
                action = it.action,
                sourceContext = it.sourceContext,
                sessionId = it.sessionId,
            )
        }
        runCatching {
            client.from("swipe_interactions").insert(rows)
        }.onSuccess {
            // Clear only the rows we flushed; later swipes may have appended more.
            context.swipeStore.edit { prefs ->
                val remaining = decodePending(prefs[pendingKey]).drop(rows.size)
                if (remaining.isEmpty()) prefs.remove(pendingKey)
                else prefs[pendingKey] = json.encodeToString(pendingListSerializer, remaining)
            }
        }.onFailure {
            AppLogger.network.warning("swipe flush failed: ${it.message}")
        }
    }

    private fun decodeOrder(raw: String?): List<String> =
        if (raw.isNullOrBlank()) emptyList()
        else runCatching { json.decodeFromString(stringListSerializer, raw) }.getOrDefault(emptyList())

    private fun decodePending(raw: String?): List<PendingSwipe> =
        if (raw.isNullOrBlank()) emptyList()
        else runCatching { json.decodeFromString(pendingListSerializer, raw) }.getOrDefault(emptyList())

    private fun key(itemType: String, itemId: String) = "$itemType:$itemId"

    @Serializable
    private data class PendingSwipe(
        val itemType: String,
        val itemId: String,
        val action: String,
        val sourceContext: Map<String, List<String>>? = null,
        val sessionId: String? = null,
    )

    @Serializable
    private data class InsertRow(
        @SerialName("user_id") val userId: String,
        @SerialName("item_type") val itemType: String,
        @SerialName("item_id") val itemId: String,
        val action: String,
        @SerialName("source_context") val sourceContext: Map<String, List<String>>? = null,
        @SerialName("session_id") val sessionId: String? = null,
    )

    companion object {
        const val MAX_SWIPED_KEYS = 1000

        /**
         * Append [key] to the most-recent-last [order], deduping (returns [order]
         * unchanged by identity if already present) and capping at [max] by
         * dropping the oldest. Pure — unit-testable without DataStore.
         */
        fun appendCapped(order: List<String>, key: String, max: Int): List<String> {
            if (order.contains(key)) return order
            val next = order + key
            return if (next.size > max) next.drop(next.size - max) else next
        }
    }
}
