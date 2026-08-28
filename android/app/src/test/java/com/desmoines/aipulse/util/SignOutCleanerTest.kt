package com.desmoines.aipulse.util

import android.content.Context
import com.desmoines.aipulse.data.remote.AdTrackingService
import com.desmoines.aipulse.data.remote.CampaignAdService
import com.desmoines.aipulse.data.repository.FavoritesRepository
import com.desmoines.aipulse.data.repository.GroupSessionManager
import io.mockk.coVerify
import io.mockk.every
import io.mockk.mockk
import io.mockk.verify
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.runTest
import org.junit.jupiter.api.Test

@OptIn(ExperimentalCoroutinesApi::class)
class SignOutCleanerTest {

    private val context: Context = mockk(relaxed = true)
    private val secureStorage: SecureStorage = mockk(relaxed = true)
    private val sessionTimeoutService: SessionTimeoutService = mockk(relaxed = true)
    private val swipeInteractionService: SwipeInteractionService = mockk(relaxed = true)
    private val searchHistoryService: SearchHistoryService = mockk(relaxed = true)
    private val recentlyViewedService: RecentlyViewedService = mockk(relaxed = true)
    private val adTrackingService: AdTrackingService = mockk(relaxed = true)
    private val campaignAdService: CampaignAdService = mockk(relaxed = true)
    private val groupSessionManager: GroupSessionManager = mockk(relaxed = true)
    private val softPaywallService: SoftPaywallService = mockk(relaxed = true)
    private val queryCache: QueryCache = mockk(relaxed = true)
    private val favoritesRepository: FavoritesRepository = mockk(relaxed = true)

    private fun cleaner() = SignOutCleaner(
        context, secureStorage, sessionTimeoutService, swipeInteractionService,
        searchHistoryService, recentlyViewedService, adTrackingService, campaignAdService,
        groupSessionManager, softPaywallService, queryCache, favoritesRepository,
    )

    @Test
    fun `tearDown resets every per-user store and stops the session timer`() = runTest {
        cleaner().tearDown()

        // Credentials + session.
        verify { secureStorage.deleteAll() }
        verify { sessionTimeoutService.stopTracking() }
        verify { groupSessionManager.clear() }
        verify { softPaywallService.reset() }
        verify { adTrackingService.reset() }

        // On-device personal history + caches.
        coVerify { swipeInteractionService.reset() }
        coVerify { searchHistoryService.clearAll() }
        coVerify { recentlyViewedService.clear() }
        coVerify { campaignAdService.clearCache() }
        coVerify { queryCache.clear() }

        // The local restaurant-favorites fallback and the in-memory id caches
        // both outlived sign-out, handing the next account the previous
        // account's saves.
        verify { favoritesRepository.clearLocalState() }
    }

    @Test
    fun `one failing step does not abort the rest of the teardown`() = runTest {
        // Every step is meant to be isolated, but groupSessionManager.clear()
        // was the one unguarded call: a throw there skipped every wipe below it,
        // including the credential wipe.
        every { groupSessionManager.clear() } throws IllegalStateException("boom")

        cleaner().tearDown()

        verify { secureStorage.deleteAll() }
        verify { favoritesRepository.clearLocalState() }
        coVerify { queryCache.clear() }
    }
}
