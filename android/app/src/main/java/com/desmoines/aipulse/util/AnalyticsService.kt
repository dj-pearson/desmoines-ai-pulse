package com.desmoines.aipulse.util

import android.os.Bundle
import com.google.firebase.analytics.FirebaseAnalytics
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Sink that actually records an analytics event. Abstracted so AnalyticsService's
 * consent-gating logic is unit-testable without the Firebase SDK / android.os.Bundle.
 */
interface AnalyticsSink {
    fun send(name: String, params: Map<String, String>)
    fun setCollectionEnabled(enabled: Boolean)
}

/** Firebase-backed [AnalyticsSink]. Not unit-tested (thin Bundle adapter). */
class FirebaseAnalyticsSink(
    private val firebaseAnalytics: FirebaseAnalytics,
) : AnalyticsSink {
    override fun send(name: String, params: Map<String, String>) {
        val bundle = Bundle().apply { params.forEach { (k, v) -> putString(k, v) } }
        firebaseAnalytics.logEvent(name, bundle)
    }

    override fun setCollectionEnabled(enabled: Boolean) {
        firebaseAnalytics.setAnalyticsCollectionEnabled(enabled)
    }
}

/**
 * Consent-gated analytics facade. Mirrors iOS AnalyticsService.swift.
 *
 * Non-essential events are dropped unless ConsentService.analyticsConsent is true.
 * Essential telemetry (crash/auth-error breadcrumbs) is never gated. No PII —
 * event names + structural parameters only.
 *
 * Event NAMES mirror iOS verbatim. The DATA does not: iOS AnalyticsService is
 * a stub whose every Firebase call is commented out, so it emits nothing at
 * all. This class is the only mobile surface reporting. Do not read a
 * cross-platform funnel from these events - it compares Android against zero,
 * and an absent iOS line means iOS never reported, not that iOS users did not
 * convert (XPLAT-004 AC5).
 */
@Singleton
class AnalyticsService @Inject constructor(
    private val sink: AnalyticsSink,
    private val consentService: ConsentService,
) {
    init {
        // Reflect the user's current choice in Firebase collection at startup.
        sink.setCollectionEnabled(consentService.analyticsConsent.value)
    }

    private val hasConsent: Boolean get() = consentService.analyticsConsent.value

    /** Re-apply collection state after a consent change. */
    fun applyConsent() {
        sink.setCollectionEnabled(hasConsent)
    }

    /**
     * Log [name] with [params]. Non-essential events are dropped without consent;
     * [essential] events (breadcrumbs) always send.
     */
    fun logEvent(name: String, params: Map<String, String> = emptyMap(), essential: Boolean = false) {
        if (!essential && !hasConsent) return
        sink.send(name, params)
    }

    fun logAppOpen() = logEvent(EVENT_APP_OPEN)

    fun logScreen(screen: String) = logEvent(EVENT_SCREEN_VIEW, mapOf(PARAM_SCREEN to screen))

    fun logSearch(queryLength: Int, resultCount: Int) = logEvent(
        EVENT_SEARCH,
        mapOf(PARAM_QUERY_LENGTH to queryLength.toString(), PARAM_RESULT_COUNT to resultCount.toString()),
    )

    fun logSaveFavorite(itemType: String) =
        logEvent(EVENT_SAVE_FAVORITE, mapOf(PARAM_ITEM_TYPE to itemType))

    fun logPaywallPresent(context: String) =
        logEvent(EVENT_PAYWALL_PRESENT, mapOf(PARAM_CONTEXT to context))

    fun logPaywallDismiss(context: String) =
        logEvent(EVENT_PAYWALL_DISMISS, mapOf(PARAM_CONTEXT to context))

    fun logPaywallPurchaseStart(context: String) =
        logEvent(EVENT_PAYWALL_PURCHASE_START, mapOf(PARAM_CONTEXT to context))

    companion object {
        const val EVENT_APP_OPEN = "app_open"
        const val EVENT_SCREEN_VIEW = "screen_view"
        const val EVENT_SEARCH = "search"
        const val EVENT_SAVE_FAVORITE = "save_favorite"
        const val EVENT_PAYWALL_PRESENT = "paywall_present"
        const val EVENT_PAYWALL_DISMISS = "paywall_dismiss"
        const val EVENT_PAYWALL_PURCHASE_START = "paywall_purchase_start"

        const val PARAM_SCREEN = "screen"
        const val PARAM_QUERY_LENGTH = "query_length"
        const val PARAM_RESULT_COUNT = "result_count"
        const val PARAM_ITEM_TYPE = "item_type"
        const val PARAM_CONTEXT = "context"
    }
}
