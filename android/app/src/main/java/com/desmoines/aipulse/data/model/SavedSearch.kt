package com.desmoines.aipulse.data.model

import androidx.compose.runtime.Immutable
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/**
 * The saved query payload stored in `saved_searches.filters` (JSONB). The query
 * + tab + alert flag live inside `filters` so we reuse the existing schema.
 * Mirrors iOS SavedSearchFilters (tolerant decode via defaults).
 */
@Immutable
@Serializable
data class SavedSearchFilters(
    val query: String = "",
    val tab: String? = null,
    @SerialName("alerts_enabled") val alertsEnabled: Boolean = false,
)

/**
 * A saved search (ANDP-050), decoding the `saved_searches` row. Mirrors iOS
 * SavedSearch. The nightly alert job scans the top-level `alerts_enabled` +
 * `search_type` columns, which the repository mirrors from [filters].
 */
@Immutable
@Serializable
data class SavedSearch(
    val id: String,
    @SerialName("user_id") val userId: String = "",
    val name: String = "",
    val filters: SavedSearchFilters = SavedSearchFilters(),
    @SerialName("created_at") val createdAt: String? = null,
) {
    val alertsEnabled: Boolean get() = filters.alertsEnabled
    val query: String get() = filters.query
}
