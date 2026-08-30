package com.desmoines.aipulse.data.local.dao

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import com.desmoines.aipulse.data.local.entity.CacheMetadata

@Dao
interface CacheMetadataDao {

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsert(metadata: CacheMetadata)

    @Query("SELECT * FROM cache_metadata WHERE cache_key = :cacheKey LIMIT 1")
    suspend fun get(cacheKey: String): CacheMetadata?

    @Query("DELETE FROM cache_metadata WHERE cache_key = :cacheKey")
    suspend fun delete(cacheKey: String)

    @Query("DELETE FROM cache_metadata")
    suspend fun deleteAll()

    /**
     * Drop metadata for keys older than the cache retention window.
     *
     * TAKES A CUTOFF, NOT A TTL, AND THAT IS THE FIX. This used to be
     * `WHERE cached_at + (ttl_minutes * 60000) < :nowMillis`, which deleted a
     * key's metadata as soon as it went STALE - five minutes by default - while
     * CacheManager.pruneExpired kept the cached rows for 24 hours.
     *
     * ttl_minutes is a freshness signal read at query time (CacheMetadata
     * .isExpired), not a lifetime. Deleting on it meant getCachedEvents, which
     * begins `cacheMetadataDao.get(key) ?: return null`, could no longer find
     * rows that were deliberately still there - so allowStale, the entire
     * offline path, went blind five minutes after the last successful fetch.
     * pruneExpired runs in DesMoinesInsiderApp.onCreate, before the first read
     * of every launch, so that was every offline launch.
     *
     * Covered by CacheManagerPruneTest against a real database.
     */
    @Query("DELETE FROM cache_metadata WHERE cached_at < :cutoffMillis")
    suspend fun deleteOlderThan(cutoffMillis: Long)
}
