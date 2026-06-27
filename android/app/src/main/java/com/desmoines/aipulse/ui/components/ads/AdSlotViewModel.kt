package com.desmoines.aipulse.ui.components.ads

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.desmoines.aipulse.data.model.CampaignAd
import com.desmoines.aipulse.data.remote.BillingService
import com.desmoines.aipulse.data.remote.CampaignAdService
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

/** Loads the campaign ad for a single placement; null for premium tiers / no campaign / failure. */
@HiltViewModel
class AdSlotViewModel @Inject constructor(
    private val campaignAdService: CampaignAdService,
    private val billingService: BillingService,
) : ViewModel() {

    private val _ad = MutableStateFlow<CampaignAd?>(null)
    val ad: StateFlow<CampaignAd?> = _ad.asStateFlow()

    fun load(placement: String) {
        viewModelScope.launch {
            _ad.value = campaignAdService.fetchAd(placement, isPremium = billingService.currentTier.value.isPremium)
        }
    }
}
