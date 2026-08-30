package com.desmoines.aipulse.ui.components.ads

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.desmoines.aipulse.data.model.CampaignAd
import com.desmoines.aipulse.data.remote.AdTrackingService
import com.desmoines.aipulse.data.remote.InterstitialAdService
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

/**
 * Drives the full-screen interstitial (ANDP-044). Counts the app session on
 * creation, asks the service at each stable nav boundary whether to present, and
 * exposes the pending creative for the host to render.
 */
@HiltViewModel
class InterstitialAdViewModel @Inject constructor(
    private val interstitialAdService: InterstitialAdService,
    private val adTrackingService: AdTrackingService,
) : ViewModel() {

    private val _pending = MutableStateFlow<CampaignAd?>(null)
    val pending: StateFlow<CampaignAd?> = _pending.asStateFlow()

    init {
        viewModelScope.launch { interstitialAdService.startSession() }
    }

    /** Called at a stable nav boundary (e.g. a bottom-nav tab switch). */
    fun onBoundary() {
        viewModelScope.launch {
            interstitialAdService.maybePresentAtBoundary()?.let { _pending.value = it }
        }
    }

    /** The interstitial became visible. */
    fun onImpression() {
        _pending.value?.let { adTrackingService.recordImpression(it, InterstitialAdService.PLACEMENT) }
    }

    /** The user tapped the creative's CTA. */
    fun onClick() {
        _pending.value?.let { adTrackingService.recordClick(it) }
    }

    fun dismiss() {
        _pending.value = null
    }
}
