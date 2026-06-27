package com.desmoines.aipulse.util

import android.content.Context
import com.desmoines.aipulse.data.remote.AdTrackingService
import com.desmoines.aipulse.data.remote.CampaignAdService
import com.desmoines.aipulse.data.repository.GroupSessionManager
import dagger.hilt.android.qualifiers.ApplicationContext
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Tears down all per-user, on-device state on sign-out so nothing leaks into the
 * next session (ANDP-064, mirroring the iOS sign-out leak fix). Stops the
 * session timer, wipes secure tokens + cached profile, clears personal caches
 * (swipe/search/recently-viewed/ad), the query cache, and the image cache, and
 * drops any in-memory session state. Every step is best-effort and isolated so
 * one failure can't abort the rest.
 */
@Singleton
class SignOutCleaner @Inject constructor(
    @param:ApplicationContext private val context: Context,
    private val secureStorage: SecureStorage,
    private val sessionTimeoutService: SessionTimeoutService,
    private val swipeInteractionService: SwipeInteractionService,
    private val searchHistoryService: SearchHistoryService,
    private val recentlyViewedService: RecentlyViewedService,
    private val adTrackingService: AdTrackingService,
    private val campaignAdService: CampaignAdService,
    private val groupSessionManager: GroupSessionManager,
    private val softPaywallService: SoftPaywallService,
    private val queryCache: QueryCache,
) {
    suspend fun tearDown() {
        // Stop timers / in-memory session state first.
        runCatching { sessionTimeoutService.stopTracking() }
        groupSessionManager.clear()
        runCatching { softPaywallService.reset() }
        runCatching { adTrackingService.reset() }

        // Clear on-device personal history + caches.
        runCatching { swipeInteractionService.reset() }
        runCatching { searchHistoryService.clearAll() }
        runCatching { recentlyViewedService.clear() }
        runCatching { campaignAdService.clearCache() }
        runCatching { queryCache.clear() }
        runCatching { clearImageCache() }

        // Wipe credentials + cached profile last.
        runCatching { secureStorage.deleteAll() }
    }

    private fun clearImageCache() {
        val loader = coil3.SingletonImageLoader.get(context)
        loader.memoryCache?.clear()
        loader.diskCache?.clear()
    }
}
