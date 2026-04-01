package com.desmoines.aipulse

import android.app.Application
import coil3.ImageLoader
import coil3.SingletonImageLoader
import coil3.disk.DiskCache
import coil3.disk.directory
import coil3.memory.MemoryCache
import coil3.request.crossfade
import coil3.network.okhttp.OkHttpNetworkFetcherFactory
import com.desmoines.aipulse.data.local.CacheManager
import com.desmoines.aipulse.util.LocalNotificationService
import com.desmoines.aipulse.util.PushNotificationService
import dagger.hilt.android.HiltAndroidApp
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import okhttp3.CacheControl
import okhttp3.Interceptor
import okhttp3.OkHttpClient
import java.util.concurrent.TimeUnit
import javax.inject.Inject

@HiltAndroidApp
class DesMoinesInsiderApp : Application(), SingletonImageLoader.Factory {

    @Inject lateinit var cacheManager: CacheManager
    @Inject lateinit var localNotificationService: LocalNotificationService

    private val appScope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    override fun onCreate() {
        super.onCreate()
        appScope.launch { cacheManager.pruneExpired() }
        // Clean up reminder IDs for alarms that have already fired
        localNotificationService.pruneExpiredReminders()

        // Initialize Firebase Cloud Messaging push notifications
        PushNotificationService.initialize(this)
    }

    override fun newImageLoader(context: coil3.PlatformContext): ImageLoader {
        return ImageLoader.Builder(context)
            .memoryCache {
                MemoryCache.Builder()
                    .maxSizeBytes(MEMORY_CACHE_SIZE)
                    .build()
            }
            .diskCache {
                DiskCache.Builder()
                    .directory(cacheDir.resolve("image_cache"))
                    .maxSizeBytes(DISK_CACHE_SIZE)
                    .build()
            }
            .components {
                add(
                    OkHttpNetworkFetcherFactory(
                        callFactory = {
                            OkHttpClient.Builder()
                                .addNetworkInterceptor(cacheControlInterceptor())
                                .build()
                        }
                    )
                )
            }
            .crossfade(true)
            .build()
    }

    /**
     * Interceptor that applies a default 7-day Cache-Control header when the server
     * does not provide one, enabling LRU disk cache TTL-based expiry.
     */
    private fun cacheControlInterceptor(): Interceptor = Interceptor { chain ->
        val response = chain.proceed(chain.request())
        val cacheHeader = response.header("Cache-Control")
        if (cacheHeader.isNullOrBlank() || cacheHeader.contains("no-store")) {
            response.newBuilder()
                .removeHeader("Cache-Control")
                .removeHeader("Pragma")
                .header(
                    "Cache-Control",
                    CacheControl.Builder()
                        .maxAge(DEFAULT_CACHE_DAYS, TimeUnit.DAYS)
                        .build()
                        .toString()
                )
                .build()
        } else {
            response
        }
    }

    companion object {
        /** 50 MB memory cache — matches iOS CachedAsyncImage memory limit */
        private const val MEMORY_CACHE_SIZE = 50L * 1024 * 1024
        /** 200 MB disk cache — matches iOS CachedAsyncImage disk limit */
        private const val DISK_CACHE_SIZE = 200L * 1024 * 1024
        /** Default cache TTL when server doesn't specify Cache-Control */
        private const val DEFAULT_CACHE_DAYS = 7
    }
}
