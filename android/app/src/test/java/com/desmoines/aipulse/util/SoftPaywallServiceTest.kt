package com.desmoines.aipulse.util

import com.desmoines.aipulse.data.model.PaywallContext
import com.desmoines.aipulse.data.model.SubscriptionTier
import com.desmoines.aipulse.data.remote.BillingService
import io.mockk.every
import io.mockk.mockk
import io.mockk.verify
import kotlinx.coroutines.flow.MutableStateFlow
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test

class SoftPaywallServiceTest {

    private lateinit var secureStorage: SecureStorage
    private lateinit var billingService: BillingService
    private lateinit var analytics: AnalyticsService
    private val now = 1_000_000_000L

    @BeforeEach
    fun setup() {
        secureStorage = mockk(relaxed = true)
        billingService = mockk(relaxed = true)
        analytics = mockk(relaxed = true)
    }

    private fun service(tier: SubscriptionTier = SubscriptionTier.FREE): SoftPaywallService {
        every { billingService.currentTier } returns MutableStateFlow(tier)
        return SoftPaywallService(secureStorage, billingService, analytics) { now }
    }

    // --- pure cap logic ---

    @Test
    fun `canPresent allows a fresh free user`() {
        assertTrue(SoftPaywallService.canPresent(count = 0, lastShownMs = 0, nowMs = now))
    }

    @Test
    fun `canPresent blocks once the lifetime max is reached`() {
        assertFalse(
            SoftPaywallService.canPresent(
                count = SoftPaywallService.MAX_PRESENTATIONS.toLong(),
                lastShownMs = 0,
                nowMs = now,
            ),
        )
    }

    @Test
    fun `canPresent blocks inside the cooldown window`() {
        val lastShown = now - (SoftPaywallService.COOLDOWN_MS - 1)
        assertFalse(SoftPaywallService.canPresent(count = 1, lastShownMs = lastShown, nowMs = now))
    }

    @Test
    fun `canPresent allows again after the cooldown`() {
        val lastShown = now - SoftPaywallService.COOLDOWN_MS
        assertTrue(SoftPaywallService.canPresent(count = 1, lastShownMs = lastShown, nowMs = now))
    }

    // --- maybePresent integration ---

    @Test
    fun `maybePresent shows for a free user and records it`() {
        val svc = service(SubscriptionTier.FREE)
        val shown = svc.maybePresent(PaywallContext.TRIP_PLANNER)

        assertTrue(shown)
        assertEquals(PaywallContext.TRIP_PLANNER, svc.pending.value)
        verify { secureStorage.saveLong(SoftPaywallService.KEY_COUNT, 1L) }
        verify { analytics.logPaywallPresent(PaywallContext.TRIP_PLANNER.id) }
    }

    @Test
    fun `maybePresent never shows for premium users`() {
        val svc = service(SubscriptionTier.INSIDER)
        val shown = svc.maybePresent(PaywallContext.TRIP_PLANNER)

        assertFalse(shown)
        assertNull(svc.pending.value)
        verify(exactly = 0) { analytics.logPaywallPresent(any()) }
    }

    @Test
    fun `maybePresent respects the lifetime cap`() {
        every { secureStorage.loadLong(SoftPaywallService.KEY_COUNT, any()) } returns
            SoftPaywallService.MAX_PRESENTATIONS.toLong()
        val svc = service(SubscriptionTier.FREE)

        assertFalse(svc.maybePresent(PaywallContext.FAVORITES))
        assertNull(svc.pending.value)
    }

    // --- present (explicit user tap) ---

    @Test
    fun `present shows for a free user even past the lifetime cap`() {
        // An explicit tap bypasses the frequency cap that throttles passive prompts.
        every { secureStorage.loadLong(SoftPaywallService.KEY_COUNT, any()) } returns
            SoftPaywallService.MAX_PRESENTATIONS.toLong()
        val svc = service(SubscriptionTier.FREE)

        val shown = svc.present(PaywallContext.PREMIUM_FILTERS)

        assertTrue(shown)
        assertEquals(PaywallContext.PREMIUM_FILTERS, svc.pending.value)
        verify { analytics.logPaywallPresent(PaywallContext.PREMIUM_FILTERS.id) }
    }

    @Test
    fun `present never shows for premium users`() {
        val svc = service(SubscriptionTier.VIP)

        assertFalse(svc.present(PaywallContext.PREMIUM_FILTERS))
        assertNull(svc.pending.value)
        verify(exactly = 0) { analytics.logPaywallPresent(any()) }
    }

    @Test
    fun `dismiss clears the pending context`() {
        val svc = service(SubscriptionTier.FREE)
        svc.maybePresent(PaywallContext.FAVORITES)
        svc.dismiss()

        assertNull(svc.pending.value)
        verify { analytics.logPaywallDismiss(PaywallContext.FAVORITES.id) }
    }
}
