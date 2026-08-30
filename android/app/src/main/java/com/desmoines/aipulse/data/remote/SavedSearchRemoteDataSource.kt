package com.desmoines.aipulse.data.remote

import com.desmoines.aipulse.data.model.SavedSearch
import com.desmoines.aipulse.data.model.SavedSearchFilters
import io.github.jan.supabase.SupabaseClient
import io.github.jan.supabase.postgrest.from
import io.github.jan.supabase.postgrest.query.Order
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import javax.inject.Inject
import javax.inject.Singleton

/**
 * CRUD for `saved_searches` (RLS: own rows only). Mirrors iOS SavedSearchService.
 * The alert flag + search type are mirrored into the top-level columns the
 * nightly `saved-search-alerts` job scans.
 */
@Singleton
class SavedSearchRemoteDataSource @Inject constructor(
    private val supabaseClient: SupabaseClient?,
) {
    private fun db(): SupabaseClient =
        supabaseClient ?: throw IllegalStateException("Supabase client is not configured.")

    suspend fun fetch(userId: String): List<SavedSearch> =
        db().from("saved_searches").select {
            filter { eq("user_id", userId) }
            order("created_at", Order.DESCENDING)
        }.decodeList<SavedSearch>()

    @Serializable
    private data class InsertRow(
        @SerialName("user_id") val userId: String,
        val name: String,
        val filters: SavedSearchFilters,
        @SerialName("search_type") val searchType: String,
        @SerialName("alerts_enabled") val alertsEnabled: Boolean,
    )

    suspend fun create(userId: String, name: String, filters: SavedSearchFilters) {
        db().from("saved_searches").insert(
            InsertRow(
                userId = userId,
                name = name,
                filters = filters,
                searchType = searchType(filters.tab),
                alertsEnabled = filters.alertsEnabled,
            ),
        )
    }

    @Serializable
    private data class UpdateRow(
        val filters: SavedSearchFilters,
        @SerialName("search_type") val searchType: String,
        @SerialName("alerts_enabled") val alertsEnabled: Boolean,
    )

    suspend fun update(id: String, filters: SavedSearchFilters) {
        db().from("saved_searches").update(
            UpdateRow(
                filters = filters,
                searchType = searchType(filters.tab),
                alertsEnabled = filters.alertsEnabled,
            ),
        ) { filter { eq("id", id) } }
    }

    suspend fun delete(id: String) {
        db().from("saved_searches").delete { filter { eq("id", id) } }
    }

    companion object {
        /** Only Events-tab searches feed the event alert pipeline. */
        fun searchType(tab: String?): String = if (tab == "Events") "event_list" else "advanced"
    }
}
