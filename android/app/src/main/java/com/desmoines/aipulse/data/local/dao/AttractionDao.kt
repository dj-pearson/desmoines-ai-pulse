package com.desmoines.aipulse.data.local.dao

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import com.desmoines.aipulse.data.local.entity.CachedAttraction

@Dao
interface AttractionDao {

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertAll(attractions: List<CachedAttraction>)

    @Query("SELECT * FROM cached_attractions WHERE cache_key = :cacheKey ORDER BY cached_at DESC")
    suspend fun getAllByKey(cacheKey: String): List<CachedAttraction>

    @Query("SELECT * FROM cached_attractions WHERE id = :id LIMIT 1")
    suspend fun getById(id: String): CachedAttraction?

    @Query("DELETE FROM cached_attractions")
    suspend fun deleteAll()

    @Query("DELETE FROM cached_attractions WHERE cached_at < :cutoffMillis")
    suspend fun deleteExpired(cutoffMillis: Long)

    @Query("DELETE FROM cached_attractions WHERE cache_key = :cacheKey")
    suspend fun deleteByKey(cacheKey: String)

    @Query("SELECT COUNT(*) FROM cached_attractions")
    suspend fun count(): Int
}
