package com.desmoines.aipulse.data.local.dao

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import com.desmoines.aipulse.data.local.entity.CachedEvent

@Dao
interface EventDao {

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertAll(events: List<CachedEvent>)

    @Query("SELECT * FROM cached_events WHERE cache_key = :cacheKey ORDER BY cached_at DESC")
    suspend fun getAllByKey(cacheKey: String): List<CachedEvent>

    @Query("SELECT * FROM cached_events WHERE id = :id LIMIT 1")
    suspend fun getById(id: String): CachedEvent?

    @Query("DELETE FROM cached_events")
    suspend fun deleteAll()

    @Query("DELETE FROM cached_events WHERE cached_at < :cutoffMillis")
    suspend fun deleteExpired(cutoffMillis: Long)

    @Query("DELETE FROM cached_events WHERE cache_key = :cacheKey")
    suspend fun deleteByKey(cacheKey: String)

    @Query("SELECT COUNT(*) FROM cached_events")
    suspend fun count(): Int
}
