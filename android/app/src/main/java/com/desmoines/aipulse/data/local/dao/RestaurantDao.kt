package com.desmoines.aipulse.data.local.dao

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import com.desmoines.aipulse.data.local.entity.CachedRestaurant

@Dao
interface RestaurantDao {

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertAll(restaurants: List<CachedRestaurant>)

    @Query("SELECT * FROM cached_restaurants WHERE cache_key = :cacheKey ORDER BY cached_at DESC")
    suspend fun getAllByKey(cacheKey: String): List<CachedRestaurant>

    @Query("SELECT * FROM cached_restaurants WHERE id = :id LIMIT 1")
    suspend fun getById(id: String): CachedRestaurant?

    @Query("DELETE FROM cached_restaurants")
    suspend fun deleteAll()

    @Query("DELETE FROM cached_restaurants WHERE cached_at < :cutoffMillis")
    suspend fun deleteExpired(cutoffMillis: Long)

    @Query("DELETE FROM cached_restaurants WHERE cache_key = :cacheKey")
    suspend fun deleteByKey(cacheKey: String)

    @Query("SELECT COUNT(*) FROM cached_restaurants")
    suspend fun count(): Int
}
