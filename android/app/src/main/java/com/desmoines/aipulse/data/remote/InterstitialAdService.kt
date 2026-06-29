package com.desmoines.aipulse.data.remote

import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.intPreferencesKey
import androidx.datastore.preferences.core.longPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import com.desmoines.aipulse.data.model.CampaignAd
import com.desmoines.aipulse.util.InterstitialCaps
import com.desmoines.aipulse.util.InterstitialFrequencyGate
import com.desmoines.aipulse.util.InterstitialState
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.flow.first
import javax.inject.Inject
import javax.inject.Singleton

private val Context.interstitialStore: DataStore<Preferences> by preferencesDataStore(name = "interstitial_ads")

/**
 * Serves occasional full-screen interstitial ads at stable nav boundaries for
 * free-tier users only, under strict frequency caps (no shows during warm-up
 * sessions, a per-session ceiling, and minimum boundary/time gaps). Session and
 * last-shown counters persist in DataStore. Mirrors iOS InterstitialAdService.
 *
 * Callers invoke [maybePresentAtBoundary] only at safe boundaries (e.g. a tab
 * switch) — never mid-read or mid-flow.
 */
@Singleton
class InterstitialAdService @Inject constructor(
    @param:ApplicationContext private val context: Context,
    private val campaignAdService: CampaignAdService,
    private val billingService: BillingService,
) {
    private val caps = InterstitialCaps()
    private val sessionKey = intPreferencesKey("session_count")
    private val lastShownKey = longPreferencesKey("last_shown_ms")

    @Volatile private var sessionNumber = 0
    @Volatile private var shownThisSession = 0
    @Volatile private var boundariesSinceLastShow = 0
    @Volatile private var lastShownMs = 0L
    @Volatile private var sessionStarted = false

    private fun now(): Long = System.currentTimeMillis()

    /** Increment the persisted session counter once per app launch. Idempotent. */
    suspend fun startSession() {
        if (sessionStarted) return
        sessionStarted = true
        val prefs = context.interstitialStore.data.first()
        lastShownMs = prefs[lastShownKey] ?: 0L
        sessionNumber = (prefs[sessionKey] ?: 0) + 1
        context.interstitialStore.edit { it[sessionKey] = sessionNumber }
        shownThisSession = 0
        boundariesSinceLastShow = 0
    }

    /**
     * Call at a stable nav boundary. Counts the boundary and, if the caps permit
     * and a renderable campaign creative is available, returns it to show and
     * records the show. Returns null (no-op) for premium users or when capped.
     */
    suspend fun maybePresentAtBoundary(): CampaignAd? {
        if (!sessionStarted) startSession()
        boundariesSinceLastShow += 1

        if (billingService.currentTier.value.isPremium) return null

        val state = InterstitialState(
            sessionNumber = sessionNumber,
            shownThisSession = shownThisSession,
            lastShownMs = lastShownMs,
            boundariesSinceLastShow = boundariesSinceLastShow,
        )
        if (!InterstitialFrequencyGate.canPresent(caps, state, now())) return null

        val ad = campaignAdService.fetchAd(PLACEMENT, isPremium = false)?.takeIf { it.isRenderable } ?: return null

        // Mark presented and roll the counters forward.
        shownThisSession += 1
        boundariesSinceLastShow = 0
        lastShownMs = now()
        context.interstitialStore.edit { it[lastShownKey] = lastShownMs }
        return ad
    }

    /** Clear all persisted + in-session interstitial state (sign-out teardown). */
    suspend fun reset() {
        context.interstitialStore.edit { it.clear() }
        sessionNumber = 0
        shownThisSession = 0
        boundariesSinceLastShow = 0
        lastShownMs = 0L
        sessionStarted = false
    }

    companion object {
        const val PLACEMENT = "interstitial"
    }
}
