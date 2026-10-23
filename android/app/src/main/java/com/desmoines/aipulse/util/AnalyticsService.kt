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
 * Firebase collection starts OFF: the manifest sets
 * firebase_analytics_collection_enabled=false, and this class turns it on only
 * once ConsentService.analyticsConsent is true. DesMoinesInsiderApp calls
 * [applyConsent] in onCreate, so a stored grant takes effect at process start
 * rather than whenever something first injects this class.
 *
 * Non-essential events are dropped here without consent. [logEvent]'s
 * `essential` flag skips that check and hands the event to the sink, but it is
 * NOT a bypass: while collection is disabled Firebase discards every logged
 * event, essential or not. Crash and error reporting go through
 * CrashReportingService, not this class. No PII - event names and structural
 * parameters only.
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
    private val hasConsent: Boolean get() = consentService.analyticsConsent.value

    init {
        // Reflect the user's current choice in Firebase collection on construction.
        applyConsent()
    }

    /**
     * Apply the stored consent to Firebase collection. Called at app start and
     * after every consent change. Collection is enabled only on a grant; without
     * one it is (re)disabled, which is what a revocation needs and a no-op on a
     * fresh install, where the manifest already starts it disabled.
     */
    fun applyConsent() {
        sink.setCollectionEnabled(hasConsent)
    }

    /**
     * Log [name] with [params]. Non-essential events are dropped without consent.
     * [essential] events skip that check, but Firebase still drops them while
     * collection is disabled, so without consent they are not recorded either.
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
