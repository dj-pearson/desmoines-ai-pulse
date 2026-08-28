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
import com.desmoines.aipulse.util.CrashReportingService
import com.desmoines.aipulse.util.CrashUploader
import com.desmoines.aipulse.util.LocalNotificationService
import com.desmoines.aipulse.util.PushNotificationService
import com.desmoines.aipulse.util.QueryCache
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
    @Inject lateinit var queryCache: QueryCache
    @Inject lateinit var crashReportingService: CrashReportingService
    @Inject lateinit var crashUploader: CrashUploader

    private val appScope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    override fun onCreate() {
        super.onCreate()
        // Install the crash handler as early as possible.
        crashReportingService.install()
        // Drain whatever the previous run recorded. Every crash the app has
        // ever captured stayed on the device until now (XPLAT-004 AC1).
        // Silent on failure, and records survive a failed attempt.
        appScope.launch { crashUploader.uploadPending() }
        appScope.launch { cacheManager.pruneExpired() }
        appScope.launch { queryCache.prune() }
        // Clean up reminder IDs for alarms that have already fired. Reads
        // SharedPreferences and rebuilds a PendingIntent per saved reminder, so
        // it belongs off the cold-start critical path like the other three.
        appScope.launch { localNotificationService.pruneExpiredReminders() }

        // Initialize Firebase Cloud Messaging push notifications
        PushNotificationService.initialize(this)
    }

    override fun newImageLoader(context: coil3.PlatformContext): ImageLoader {
        return ImageLoader.Builder(context)
            .memoryCache {
                MemoryCache.Builder()
                    .maxSizeBytes(imageMemoryCacheBytes())
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
                                .connectTimeout(IMAGE_TIMEOUT_SECONDS, TimeUnit.SECONDS)
                                .readTimeout(IMAGE_TIMEOUT_SECONDS, TimeUnit.SECONDS)
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
     * Image memory cache budget, as a fraction of the heap this process is
     * actually allowed.
     */
    private fun imageMemoryCacheBytes(): Long =
        (Runtime.getRuntime().maxMemory() * MEMORY_CACHE_HEAP_FRACTION).toLong()

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
        /**
         * Share of the app's available heap given to the image memory cache.
         *
         * Was a flat 50 MB to match the iOS limit, but Android heap sizes are
         * per-device: on a low-end phone with a 96 MB heap that cache alone is
         * over half the budget and turns image-heavy scrolling into an
         * OutOfMemoryError. A fraction scales with whatever the device allows.
         */
        private const val MEMORY_CACHE_HEAP_FRACTION = 0.20
        /** 200 MB disk cache — matches iOS CachedAsyncImage disk limit */
        private const val DISK_CACHE_SIZE = 200L * 1024 * 1024
        /** Default cache TTL when server doesn't specify Cache-Control */
        private const val DEFAULT_CACHE_DAYS = 7
        /** Timeout for image download connections in seconds */
        private const val IMAGE_TIMEOUT_SECONDS = 30L
    }
}
