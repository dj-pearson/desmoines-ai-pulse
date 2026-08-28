package com.desmoines.aipulse.util

import android.content.Context
import com.desmoines.aipulse.data.remote.AdTrackingService
import com.desmoines.aipulse.data.remote.CampaignAdService
import com.desmoines.aipulse.data.repository.FavoritesRepository
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
    private val favoritesRepository: FavoritesRepository,
) {
    suspend fun tearDown() {
        // Stop timers / in-memory session state first.
        step("sessionTimeout") { sessionTimeoutService.stopTracking() }
        // Was the one unguarded call in a class whose whole contract is "every
        // step is isolated" -- a throw here skipped the twelve wipes below it.
        step("groupSession") { groupSessionManager.clear() }
        step("softPaywall") { softPaywallService.reset() }
        step("adTracking") { adTrackingService.reset() }

        // Clear on-device personal history + caches.
        step("swipeInteractions") { swipeInteractionService.reset() }
        step("searchHistory") { searchHistoryService.clearAll() }
        step("recentlyViewed") { recentlyViewedService.clear() }
        step("campaignAds") { campaignAdService.clearCache() }
        step("queryCache") { queryCache.clear() }
        step("imageCache") { clearImageCache() }
        // In-memory favorite ids plus the local restaurant-favorites fallback.
        // Both outlived sign-out, so the next account on the device saw the
        // previous account's saves.
        step("favorites") { favoritesRepository.clearLocalState() }
        // The FCM registration token is what the backend addresses pushes to.
        step("pushToken") { PushNotificationService.clearLocalToken(context) }

        // Wipe credentials + cached profile last.
        step("secureStorage") { secureStorage.deleteAll() }
    }

    /**
     * Runs one teardown step in isolation.
     *
     * A failure must not abort the remaining wipes, but it also must not vanish:
     * a half-completed sign-out is exactly the leak this class exists to
     * prevent, and the bare `runCatching` this replaced left no trace of one.
     */
    private inline fun step(name: String, block: () -> Unit) {
        runCatching(block).onFailure {
            AppLogger.general.error("Sign-out step '$name' failed", it)
        }
    }

    private fun clearImageCache() {
        val loader = coil3.SingletonImageLoader.get(context)
        loader.memoryCache?.clear()
        loader.diskCache?.clear()
    }
}
