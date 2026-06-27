package com.desmoines.aipulse.ui.components.ads

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.desmoines.aipulse.data.model.CampaignAd
import com.desmoines.aipulse.data.remote.AdTrackingService
import com.desmoines.aipulse.data.remote.BillingService
import com.desmoines.aipulse.data.remote.CampaignAdService
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

/** Loads the campaign ad for a single placement; null for premium tiers / no campaign / failure / frequency cap. */
@HiltViewModel
class AdSlotViewModel @Inject constructor(
    private val campaignAdService: CampaignAdService,
    private val billingService: BillingService,
    private val adTrackingService: AdTrackingService,
) : ViewModel() {

    private val _ad = MutableStateFlow<CampaignAd?>(null)
    val ad: StateFlow<CampaignAd?> = _ad.asStateFlow()

    fun load(placement: String) {
        viewModelScope.launch {
            val fetched = campaignAdService.fetchAd(placement, isPremium = billingService.currentTier.value.isPremium)
            // Honor the per-session frequency cap before showing.
            _ad.value = fetched?.takeIf { adTrackingService.canShow(it.campaignId) }
        }
    }

    /** Called by the viewability modifier when the ad clears the 50%/1s bar. */
    fun onImpression(placement: String) {
        _ad.value?.let { adTrackingService.recordImpression(it, placement) }
    }

    /** Called on tap, before opening the creative's link. */
    fun onClick() {
        _ad.value?.let { adTrackingService.recordClick(it) }
    }
}
