package com.desmoines.aipulse.util

import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringSetPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import javax.inject.Inject
import javax.inject.Singleton

private val Context.articleFavoritesStore: DataStore<Preferences> by
    preferencesDataStore(name = "article_favorites")

/**
 * On-device article bookmarks (ANDP-031). Android has no article-favorites
 * table yet, so saves persist locally (mirrors iOS's local fallback). Replace
 * with a server-backed table in a later release if needed.
 */
@Singleton
class ArticleFavoritesStore @Inject constructor(
    @param:ApplicationContext private val context: Context,
) {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val key = stringSetPreferencesKey("saved_article_ids")

    val ids: StateFlow<Set<String>> = context.articleFavoritesStore.data
        .map { it[key] ?: emptySet() }
        .stateIn(scope, SharingStarted.Eagerly, emptySet())

    fun isSaved(id: String): Boolean = ids.value.contains(id)

    /** Toggle [id]; returns the new saved state. */
    suspend fun toggle(id: String): Boolean {
        var saved = false
        context.articleFavoritesStore.edit { prefs ->
            val current = prefs[key] ?: emptySet()
            saved = !current.contains(id)
            prefs[key] = if (saved) current + id else current - id
        }
        return saved
    }
}
