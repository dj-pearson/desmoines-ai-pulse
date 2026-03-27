package com.desmoines.aipulse.di

import android.content.Context
import androidx.room.Room
import com.desmoines.aipulse.data.local.AppDatabase
import com.desmoines.aipulse.data.local.dao.AttractionDao
import com.desmoines.aipulse.data.local.dao.CacheMetadataDao
import com.desmoines.aipulse.data.local.dao.EventDao
import com.desmoines.aipulse.data.local.dao.RestaurantDao
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import javax.inject.Singleton

@Module
@InstallIn(SingletonComponent::class)
object DatabaseModule {

    @Provides
    @Singleton
    fun provideAppDatabase(@ApplicationContext context: Context): AppDatabase =
        Room.databaseBuilder(context, AppDatabase::class.java, AppDatabase.DATABASE_NAME)
            .fallbackToDestructiveMigration()
            .build()

    @Provides
    fun provideEventDao(db: AppDatabase): EventDao = db.eventDao()

    @Provides
    fun provideRestaurantDao(db: AppDatabase): RestaurantDao = db.restaurantDao()

    @Provides
    fun provideAttractionDao(db: AppDatabase): AttractionDao = db.attractionDao()

    @Provides
    fun provideCacheMetadataDao(db: AppDatabase): CacheMetadataDao = db.cacheMetadataDao()
}
