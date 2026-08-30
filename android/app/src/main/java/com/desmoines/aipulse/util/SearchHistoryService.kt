package com.desmoines.aipulse.util

import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.builtins.serializer
import kotlinx.serialization.json.Json
import javax.inject.Inject
import javax.inject.Singleton

private val Context.searchHistoryStore: DataStore<Preferences> by
    preferencesDataStore(name = "search_history")

/**
 * Tracks the last [MAX_ITEMS] search queries on-device.
 * Mirrors iOS SearchHistoryService.swift. Surfaced in the empty-search state.
 */
@Singleton
class SearchHistoryService @Inject constructor(
    @param:ApplicationContext private val context: Context,
    private val json: Json,
) {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val queriesKey = stringPreferencesKey("recent_queries")
    private val listSerializer = ListSerializer(String.serializer())

    /** Most-recent-first list of queries. */
    val history: StateFlow<List<String>> = context.searchHistoryStore.data
        .map { prefs -> decode(prefs[queriesKey]) }
        .stateIn(scope, SharingStarted.Eagerly, emptyList())

    /** Record a submitted query (no-op for blank input). */
    suspend fun record(query: String) {
        if (query.isBlank()) return
        context.searchHistoryStore.edit { prefs ->
            val next = reduce(decode(prefs[queriesKey]), query)
            prefs[queriesKey] = json.encodeToString(listSerializer, next)
        }
    }

    /** Clear all search history. */
    suspend fun clearAll() {
        context.searchHistoryStore.edit { it.remove(queriesKey) }
    }

    private fun decode(raw: String?): List<String> =
        if (raw.isNullOrBlank()) emptyList()
        else runCatching { json.decodeFromString(listSerializer, raw) }.getOrDefault(emptyList())

    companion object {
        const val MAX_ITEMS = 10

        /**
         * Pure reducer: trim [query], move it to the front (case-insensitive dedupe),
         * cap at [MAX_ITEMS]. Returns [current] unchanged for blank input.
         * Unit-testable without DataStore.
         */
        fun reduce(current: List<String>, query: String): List<String> {
            val trimmed = query.trim()
            if (trimmed.isEmpty()) return current
            val deduped = current.filterNot { it.equals(trimmed, ignoreCase = true) }
            return (listOf(trimmed) + deduped).take(MAX_ITEMS)
        }
    }
}
