package com.desmoines.aipulse.data.remote

import android.content.SharedPreferences
import android.util.Log
import androidx.core.content.edit
import io.github.jan.supabase.SupabaseClient
import io.github.jan.supabase.auth.auth
import io.github.jan.supabase.postgrest.from
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.serialization.Serializable
import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.builtins.serializer
import kotlinx.serialization.json.Json
import javax.inject.Inject
import javax.inject.Singleton

private const val TAG = "SwipeInteractionService"
private const val PREF_SWIPED_KEYS = "discover.swipedItems.v1"
private const val PREF_PENDING_KEYS = "discover.pendingSwipes.v1"

/**
 * Records swipe-to-discover signals from the Discover screen.
 * Mirrors iOS SwipeInteractionService.swift — same Supabase table, same actions.
 */
@Singleton
class SwipeInteractionService @Inject constructor(
    private val supabaseClient: SupabaseClient?,
    private val prefs: SharedPreferences,
    private val json: Json,
) {

    enum class Action(val value: String) { LIKE("like"), SKIP("skip"), BOOST("boost"), DETAIL("detail") }
    enum class ItemType(val value: String) { EVENT("event"), RESTAURANT("restaurant"), ATTRACTION("attraction") }

    @Serializable
    private data class PendingSwipe(
        val itemType: String,
        val itemId: String,
        val action: String,
        val sourceContext: Map<String, List<String>>? = null,
        val createdAt: String,
    )

    @Serializable
    private data class InsertRow(
        val user_id: String,
        val item_type: String,
        val item_id: String,
        val action: String,
        val source_context: Map<String, List<String>>? = null,
    )

    private val mutex = Mutex()
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    private val _swipedItemKeys = MutableStateFlow(loadLocal())
    val swipedItemKeys: StateFlow<Set<String>> = _swipedItemKeys.asStateFlow()

    fun hasSwiped(itemType: ItemType, itemId: String): Boolean =
        _swipedItemKeys.value.contains(key(itemType, itemId))

    suspend fun record(
        action: Action,
        itemType: ItemType,
        itemId: String,
        sourceContext: Map<String, List<String>>? = null,
    ) {
        val k = key(itemType, itemId)
        mutex.withLock {
            _swipedItemKeys.value = _swipedItemKeys.value + k
            saveLocal(_swipedItemKeys.value)

            val row = PendingSwipe(
                itemType = itemType.value,
                itemId = itemId,
                action = action.value,
                sourceContext = sourceContext,
                createdAt = java.time.Instant.now().toString(),
            )
            val queue = loadPending().toMutableList().apply { add(row) }
            savePending(queue)
        }
        scope.launch { flushPending() }
    }

    fun reset() {
        prefs.edit { remove(PREF_SWIPED_KEYS); remove(PREF_PENDING_KEYS) }
        _swipedItemKeys.value = emptySet()
    }

    private suspend fun flushPending() {
        val client = supabaseClient ?: return
        val userId = try {
            client.auth.currentSessionOrNull()?.user?.id
        } catch (_: Exception) {
            null
        } ?: return

        val queue = mutex.withLock { loadPending() }
        if (queue.isEmpty()) return

        val rows = queue.map {
            InsertRow(
                user_id = userId,
                item_type = it.itemType,
                item_id = it.itemId,
                action = it.action,
                source_context = it.sourceContext,
            )
        }
        try {
            client.from("swipe_interactions").insert(rows)
            mutex.withLock { savePending(emptyList()) }
        } catch (e: Exception) {
            Log.w(TAG, "flushPending failed; will retry on next swipe: ${e.message}")
        }
    }

    private fun key(itemType: ItemType, itemId: String) = "${itemType.value}:$itemId"

    private fun loadLocal(): Set<String> {
        val raw = prefs.getString(PREF_SWIPED_KEYS, null) ?: return emptySet()
        return try {
            json.decodeFromString(ListSerializer(String.serializer()), raw).toSet()
        } catch (_: Exception) {
            emptySet()
        }
    }

    private fun saveLocal(set: Set<String>) {
        val raw = json.encodeToString(ListSerializer(String.serializer()), set.toList())
        prefs.edit { putString(PREF_SWIPED_KEYS, raw) }
    }

    private fun loadPending(): List<PendingSwipe> {
        val raw = prefs.getString(PREF_PENDING_KEYS, null) ?: return emptyList()
        return try {
            json.decodeFromString(ListSerializer(PendingSwipe.serializer()), raw)
        } catch (_: Exception) {
            emptyList()
        }
    }

    private fun savePending(queue: List<PendingSwipe>) {
        val raw = json.encodeToString(ListSerializer(PendingSwipe.serializer()), queue)
        prefs.edit { putString(PREF_PENDING_KEYS, raw) }
    }
}
