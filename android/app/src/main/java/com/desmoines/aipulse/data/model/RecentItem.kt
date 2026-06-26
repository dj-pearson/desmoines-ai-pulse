package com.desmoines.aipulse.data.model

import androidx.compose.runtime.Immutable
import kotlinx.serialization.Serializable

/** Content type a [RecentItem] can point at. Mirrors iOS RecentItem.type. */
@Serializable
enum class RecentItemType {
    EVENT, RESTAURANT, ATTRACTION, ARTICLE, HOTEL
}

/**
 * A recently-viewed listing, persisted on-device. Mirrors iOS RecentlyViewedService.RecentItem.
 */
@Immutable
@Serializable
data class RecentItem(
    val type: RecentItemType,
    val id: String,
    val title: String,
    val imageUrl: String? = null,
)
