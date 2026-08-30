package com.desmoines.aipulse.util

/**
 * Pure, in-memory ad de-dupe + frequency cap for a single app session (no
 * Android deps, fully unit-testable). Mirrors the iOS AdTrackingService caps.
 *
 * - A creative is impressed at most once per (campaign, creative) per session.
 * - A campaign is shown at most [maxPerCampaignPerSession] times per session.
 */
class AdFrequencyGate(
    private val maxPerCampaignPerSession: Int = DEFAULT_PER_CAMPAIGN_CAP,
) {
    private val impressionsByCampaign = mutableMapOf<String, Int>()
    private val seen = mutableSetOf<String>()

    private fun key(campaignId: String, creativeId: String) = "$campaignId:$creativeId"

    /** True while the campaign is still under its per-session impression cap. */
    fun canShow(campaignId: String): Boolean =
        (impressionsByCampaign[campaignId] ?: 0) < maxPerCampaignPerSession

    /**
     * Registers an impression. Returns true if it's new (counts toward the cap);
     * false if this (campaign, creative) was already impressed this session.
     */
    fun registerImpression(campaignId: String, creativeId: String): Boolean {
        if (!seen.add(key(campaignId, creativeId))) return false
        impressionsByCampaign[campaignId] = (impressionsByCampaign[campaignId] ?: 0) + 1
        return true
    }

    fun reset() {
        impressionsByCampaign.clear()
        seen.clear()
    }

    companion object {
        const val DEFAULT_PER_CAMPAIGN_CAP = 3
    }
}
