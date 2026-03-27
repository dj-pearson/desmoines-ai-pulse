package com.desmoines.aipulse.data.local

import androidx.room.Database
import androidx.room.RoomDatabase
import com.desmoines.aipulse.data.local.dao.AttractionDao
import com.desmoines.aipulse.data.local.dao.CacheMetadataDao
import com.desmoines.aipulse.data.local.dao.EventDao
import com.desmoines.aipulse.data.local.dao.RestaurantDao
import com.desmoines.aipulse.data.local.entity.CacheMetadata
import com.desmoines.aipulse.data.local.entity.CachedAttraction
import com.desmoines.aipulse.data.local.entity.CachedEvent
import com.desmoines.aipulse.data.local.entity.CachedRestaurant

/**
 * Room database for offline caching of events, restaurants, and attractions.
 * Mirrors iOS QueryCache.swift behavior with structured Room tables.
 */
@Database(
    entities = [
        CachedEvent::class,
        CachedRestaurant::class,
        CachedAttraction::class,
        CacheMetadata::class,
    ],
    version = 1,
    exportSchema = false,
)
abstract class AppDatabase : RoomDatabase() {
    abstract fun eventDao(): EventDao
    abstract fun restaurantDao(): RestaurantDao
    abstract fun attractionDao(): AttractionDao
    abstract fun cacheMetadataDao(): CacheMetadataDao

    companion object {
        const val DATABASE_NAME = "desmoines_insider_cache.db"
    }
}
