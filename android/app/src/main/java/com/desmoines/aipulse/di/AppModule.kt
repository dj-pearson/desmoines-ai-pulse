package com.desmoines.aipulse.di

import android.content.Context
import android.content.SharedPreferences
import com.desmoines.aipulse.data.remote.SupabaseClientProvider
import com.desmoines.aipulse.util.QueryCache
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import io.github.jan.supabase.SupabaseClient
import kotlinx.serialization.json.Json
import java.io.File
import javax.inject.Singleton

@Module
@InstallIn(SingletonComponent::class)
object AppModule {

    @Provides
    @Singleton
    fun provideJson(): Json = Json {
        ignoreUnknownKeys = true
        coerceInputValues = true
        isLenient = true
        encodeDefaults = true
    }

    @Provides
    @Singleton
    fun provideApplicationContext(@ApplicationContext context: Context): Context = context

    @Provides
    @Singleton
    fun provideSharedPreferences(@ApplicationContext context: Context): SharedPreferences =
        context.getSharedPreferences("desmoines_insider_prefs", Context.MODE_PRIVATE)

    @Provides
    @Singleton
    fun provideSupabaseClient(): SupabaseClient? = SupabaseClientProvider.client

    @Provides
    @Singleton
    fun provideQueryCache(
        @ApplicationContext context: Context,
        json: Json,
    ): QueryCache = QueryCache(File(context.cacheDir, "query-cache"), json)
}
