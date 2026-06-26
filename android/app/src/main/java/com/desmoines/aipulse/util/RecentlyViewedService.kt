package com.desmoines.aipulse.util

import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import com.desmoines.aipulse.data.model.RecentItem
import com.desmoines.aipulse.data.model.RecentItemType
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.json.Json
import javax.inject.Inject
import javax.inject.Singleton

private val Context.recentlyViewedStore: DataStore<Preferences> by
    preferencesDataStore(name = "recently_viewed")

/**
 * Tracks the last [MAX_ITEMS] viewed listings (any content type) on-device.
 * Mirrors iOS RecentlyViewedService.swift. Consumed by the Dashboard rail and
 * Search suggestions.
 */
@Singleton
class RecentlyViewedService @Inject constructor(
    @param:ApplicationContext private val context: Context,
    private val json: Json,
) {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val itemsKey = stringPreferencesKey("recent_items")
    private val listSerializer = ListSerializer(RecentItem.serializer())

    /** Most-recent-first list of viewed items. */
    val recent: StateFlow<List<RecentItem>> = context.recentlyViewedStore.data
        .map { prefs -> decode(prefs[itemsKey]) }
        .stateIn(scope, SharingStarted.Eagerly, emptyList())

    /** Record a detail-view open, moving it to the front and capping the list. */
    suspend fun record(type: RecentItemType, id: String, title: String, imageUrl: String? = null) {
        val item = RecentItem(type, id, title, imageUrl)
        context.recentlyViewedStore.edit { prefs ->
            val next = reduce(decode(prefs[itemsKey]), item)
            prefs[itemsKey] = json.encodeToString(listSerializer, next)
        }
    }

    /** Clear all recently-viewed history. */
    suspend fun clear() {
        context.recentlyViewedStore.edit { it.remove(itemsKey) }
    }

    private fun decode(raw: String?): List<RecentItem> =
        if (raw.isNullOrBlank()) emptyList()
        else runCatching { json.decodeFromString(listSerializer, raw) }.getOrDefault(emptyList())

    companion object {
        const val MAX_ITEMS = 12

        /**
         * Pure list reducer: prepend [item], drop any earlier entry with the same
         * (type, id), and cap at [MAX_ITEMS]. Unit-testable without DataStore.
         */
        fun reduce(current: List<RecentItem>, item: RecentItem): List<RecentItem> {
            val deduped = current.filterNot { it.type == item.type && it.id == item.id }
            return (listOf(item) + deduped).take(MAX_ITEMS)
        }
    }
}
