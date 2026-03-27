package com.desmoines.aipulse.data.local.entity

import androidx.room.ColumnInfo
import androidx.room.Entity
import androidx.room.Index
import androidx.room.PrimaryKey

/**
 * Room entity for cached events.
 * Stores serialized JSON per item with a cache key for query-based retrieval.
 */
@Entity(
    tableName = "cached_events",
    indices = [Index("cache_key"), Index("cached_at")]
)
data class CachedEvent(
    @PrimaryKey val id: String,
    @ColumnInfo(name = "json_data") val jsonData: String,
    @ColumnInfo(name = "cache_key") val cacheKey: String,
    @ColumnInfo(name = "cached_at") val cachedAt: Long = System.currentTimeMillis(),
)
