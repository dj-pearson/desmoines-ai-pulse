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

    @Query("DELETE FROM cache_metadata WHERE cached_at + (ttl_minutes * 60000) < :nowMillis")
    suspend fun deleteExpired(nowMillis: Long = System.currentTimeMillis())
}
