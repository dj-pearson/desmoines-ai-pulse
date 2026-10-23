package com.desmoines.aipulse.data.local.entity

import androidx.room.ColumnInfo
import androidx.room.Entity
import androidx.room.PrimaryKey

/**
 * Room entity tracking cache freshness per query key.
 * Used by CacheManager to determine if cached data is still valid.
 */
@Entity(tableName = "cache_metadata")
data class CacheMetadata(
    @PrimaryKey @ColumnInfo(name = "cache_key") val cacheKey: String,
    @ColumnInfo(name = "cached_at") val cachedAt: Long = System.currentTimeMillis(),
    @ColumnInfo(name = "ttl_minutes") val ttlMinutes: Int,
    @ColumnInfo(name = "item_count") val itemCount: Int = 0,
    /**
     * Server row count for a paginated query, so a cached page can still say
     * whether more pages exist. Null for keys that are not a page (featured,
     * related, single).
     */
    @ColumnInfo(name = "total_count") val totalCount: Int? = null,
) {
    val isExpired: Boolean
        get() = System.currentTimeMillis() - cachedAt > ttlMinutes * 60_000L

    val ageMillis: Long
        get() = System.currentTimeMillis() - cachedAt
}
