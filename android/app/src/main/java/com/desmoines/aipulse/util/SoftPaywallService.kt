package com.desmoines.aipulse.util

import com.desmoines.aipulse.data.model.PaywallContext
import com.desmoines.aipulse.data.model.SubscriptionTier
import com.desmoines.aipulse.data.remote.BillingService
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Frequency-capped soft paywall. Mirrors iOS SoftPaywallService.
 *
 * Consumers call [maybePresent] at a natural engagement moment (e.g. the favorites
 * cap, or the first Trip Planner attempt). It presents at most [MAX_PRESENTATIONS]
 * times ever, with a [COOLDOWN_MS] gap, and only for free-tier users. The host UI
 * observes [pending] and shows the paywall sheet.
 */
@Singleton
class SoftPaywallService(
    private val secureStorage: SecureStorage,
    private val billingService: BillingService,
    private val analytics: AnalyticsService,
    private val clock: () -> Long,
) {
    // Hilt uses this 2-arg constructor; the 4-arg primary is for tests (injectable clock).
    @Inject
    constructor(
        secureStorage: SecureStorage,
        billingService: BillingService,
        analytics: AnalyticsService,
    ) : this(secureStorage, billingService, analytics, { System.currentTimeMillis() })

    private val _pending = MutableStateFlow<PaywallContext?>(null)
    /** Non-null when the host should show the paywall for that context. */
    val pending: StateFlow<PaywallContext?> = _pending.asStateFlow()

    /**
     * Present the soft paywall for [context] if the caps allow. Returns true if it
     * was presented (so callers can branch). No-op for premium users.
     */
    fun maybePresent(context: PaywallContext): Boolean {
        if (billingService.currentTier.value != SubscriptionTier.FREE) return false

        val count = secureStorage.loadLong(KEY_COUNT)
        val lastShown = secureStorage.loadLong(KEY_LAST_SHOWN)
        if (!canPresent(count, lastShown, clock())) return false

        secureStorage.saveLong(KEY_COUNT, count + 1)
        secureStorage.saveLong(KEY_LAST_SHOWN, clock())
        _pending.value = context
        analytics.logPaywallPresent(context.id)
        return true
    }

    /** Dismiss the current paywall (user tapped "Maybe later" or scrimmed away). */
    fun dismiss() {
        _pending.value?.let { analytics.logPaywallDismiss(it.id) }
        _pending.value = null
    }

    /** Record that the user started the upgrade flow from the paywall. */
    fun onSubscribeClicked() {
        _pending.value?.let { analytics.logPaywallPurchaseStart(it.id) }
    }

    /** Reset the presentation history (e.g. after a purchase, or a downgrade test). */
    fun reset() {
        secureStorage.saveLong(KEY_COUNT, 0)
        secureStorage.delete(KEY_LAST_SHOWN)
    }

    companion object {
        const val MAX_PRESENTATIONS = 3
        const val COOLDOWN_MS = 7L * 24 * 60 * 60 * 1000 // 7 days
        const val KEY_COUNT = "soft_paywall_count"
        const val KEY_LAST_SHOWN = "soft_paywall_last_shown"

        /**
         * Pure cap check: under the lifetime max and past the cooldown.
         * Unit-testable without storage/billing.
         */
        fun canPresent(count: Long, lastShownMs: Long, nowMs: Long): Boolean {
            if (count >= MAX_PRESENTATIONS) return false
            if (lastShownMs > 0L && nowMs - lastShownMs < COOLDOWN_MS) return false
            return true
        }
    }
}
