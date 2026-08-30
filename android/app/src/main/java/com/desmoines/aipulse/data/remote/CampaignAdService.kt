package com.desmoines.aipulse.data.remote

import com.desmoines.aipulse.data.model.CampaignAd
import com.desmoines.aipulse.util.AppLogger
import io.github.jan.supabase.SupabaseClient
import io.github.jan.supabase.postgrest.postgrest
import io.github.jan.supabase.postgrest.rpc
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Serves first-party campaign ads via `get_active_ads`. Free tier only —
 * premium tiers get nothing. Each placement is cached ~5 min. Mirrors iOS
 * CampaignAdService. Any network/parse failure returns null (never throws),
 * so an ad slot simply renders nothing.
 */
@Singleton
class CampaignAdService @Inject constructor(
    private val supabaseClient: SupabaseClient?,
) {
    private fun now(): Long = System.currentTimeMillis()

    private data class Cached(val ad: CampaignAd?, val at: Long)

    private val mutex = Mutex()
    private val cache = mutableMapOf<String, Cached>()

    @Serializable
    private data class Params(@SerialName("p_placement_type") val placementType: String)

    /**
     * The live ad for [placement], or null when there's no campaign, the user
     * is premium ([isPremium] = true), or anything fails.
     */
    suspend fun fetchAd(placement: String, isPremium: Boolean): CampaignAd? {
        if (isPremium) return null
        val client = supabaseClient ?: return null

        mutex.withLock {
            cache[placement]?.let { hit ->
                if (now() - hit.at < CACHE_TTL_MS) return hit.ad
            }
        }

        val ad = runCatching {
            client.postgrest.rpc("get_active_ads", Params(placementType = placement))
                .decodeList<CampaignAd>()
                .firstOrNull { it.isRenderable }
        }.onFailure { AppLogger.network.warning("get_active_ads failed: ${it.message}") }
            .getOrNull()

        mutex.withLock { cache[placement] = Cached(ad, now()) }
        return ad
    }

    /** Clears the per-placement cache (e.g. on sign-out / tier change). */
    suspend fun clearCache() {
        mutex.withLock { cache.clear() }
    }

    companion object {
        const val CACHE_TTL_MS = 5L * 60 * 1000

        // Known placement types (parity with the web/iOS placements).
        const val TOP_BANNER = "top_banner"
        const val FEATURED_SPOT = "featured_spot"
        const val BELOW_FOLD = "below_fold"
        const val SPONSORED_LISTING = "sponsored_listing"
    }
}
