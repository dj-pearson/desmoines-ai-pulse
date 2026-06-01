package com.desmoines.aipulse.data.remote

import android.content.SharedPreferences
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Static registry and brand-rotation service for affiliate display ads.
 * Mirrors iOS AffiliateAdService.swift and web affiliateAds.ts configuration.
 *
 * Shows rotating hotel partner ads to free-tier users. The same brand is shown
 * for 30 minutes across all placements for consistency.
 */
@Singleton
class AffiliateAdService @Inject constructor(
    private val sharedPreferences: SharedPreferences,
    private val json: Json
) {

    // MARK: - Types

    data class AffiliatePartner(
        val id: String,
        val name: String,
        val affiliateUrl: String,
        /** Image URLs keyed by size string ("728x90", "300x250", "160x600") */
        val assets: Map<String, String>,
        val isActive: Boolean = true
    )

    enum class Placement {
        /** 300x250 — used in feed / between content */
        BANNER,
        /** 728x90 — horizontal strip */
        COMPACT
    }

    // MARK: - Configuration

    companion object {
        private const val ASSET_BASE_URL = "https://desmoinesinsider.com/ads/affiliates"
        private const val SESSION_KEY = "affiliate_brand_session"
        private const val SESSION_DURATION_MS = 30 * 60 * 1000L // 30 minutes
    }

    @Serializable
    private data class BrandSession(
        val index: Int,
        val timestamp: Long
    )

    /** Partners must match the web registry in src/lib/affiliateAds.ts */
    val partners: List<AffiliatePartner> = listOf(
        AffiliatePartner(
            id = "hyatt",
            name = "Hyatt",
            affiliateUrl = "https://hyatt.jewn.net/DWyqGG",
            assets = mapOf(
                "728x90" to "$ASSET_BASE_URL/hyatt/728x90.jpeg",
                "300x250" to "$ASSET_BASE_URL/hyatt/300x250.jpeg",
                "160x600" to "$ASSET_BASE_URL/hyatt/160x600.jpeg"
            )
        ),
        AffiliatePartner(
            id = "ihg",
            name = "IHG",
            affiliateUrl = "https://ihg.hmxg.net/5kaEq9",
            assets = mapOf(
                "728x90" to "$ASSET_BASE_URL/ihg/728x90.jpeg",
                "300x250" to "$ASSET_BASE_URL/ihg/300x250.jpeg",
                "160x600" to "$ASSET_BASE_URL/ihg/160x600.jpeg"
            )
        ),
        AffiliatePartner(
            id = "marriott",
            name = "Marriott",
            affiliateUrl = "https://marriott.pxf.io/en1QGZ",
            assets = mapOf(
                "728x90" to "$ASSET_BASE_URL/marriott/728x90.jpeg",
                "300x250" to "$ASSET_BASE_URL/marriott/300x250.jpeg",
                "160x600" to "$ASSET_BASE_URL/marriott/160x600.jpeg"
            )
        )
    )

    // MARK: - Public API

    /**
     * Returns the current session's affiliate partner (consistent across all placements).
     * Rotates to next partner when the 30-minute session expires.
     */
    val currentPartner: AffiliatePartner?
        get() {
            val active = partners.filter { it.isActive }
            if (active.isEmpty()) return null

            val now = System.currentTimeMillis()
            val session = loadSession()

            val index: Int
            if (session != null && now - session.timestamp < SESSION_DURATION_MS) {
                index = session.index % active.size
            } else {
                index = if (session != null) (session.index + 1) % active.size else 0
                saveSession(BrandSession(index = index, timestamp = now))
            }

            return active[index]
        }

    /**
     * Returns the image URL for the given placement from the current session partner.
     */
    fun imageUrl(placement: Placement): String? {
        val partner = currentPartner ?: return null
        val sizeKey = when (placement) {
            Placement.BANNER -> "300x250"
            Placement.COMPACT -> "728x90"
        }
        return partner.assets[sizeKey]
    }

    /**
     * Returns the affiliate tracking URL for the current session partner.
     */
    val affiliateUrl: String?
        get() = currentPartner?.affiliateUrl

    // MARK: - Persistence

    private fun loadSession(): BrandSession? {
        val data = sharedPreferences.getString(SESSION_KEY, null) ?: return null
        return try {
            json.decodeFromString<BrandSession>(data)
        } catch (_: Exception) {
            null
        }
    }

    private fun saveSession(session: BrandSession) {
        try {
            val data = json.encodeToString(BrandSession.serializer(), session)
            sharedPreferences.edit().putString(SESSION_KEY, data).apply()
        } catch (_: Exception) {
            // Silently fail — ad session persistence is non-critical
        }
    }
}
