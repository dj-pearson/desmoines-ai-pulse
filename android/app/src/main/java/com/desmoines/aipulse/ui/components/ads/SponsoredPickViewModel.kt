package com.desmoines.aipulse.ui.components.ads

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.desmoines.aipulse.data.model.SponsoredPick
import com.desmoines.aipulse.data.remote.AdTrackingService
import com.desmoines.aipulse.data.remote.SponsoredPickService
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

/** Loads + tracks a sponsored pick for one AI surface. Null for premium / no inventory / failure. */
@HiltViewModel
class SponsoredPickViewModel @Inject constructor(
    private val sponsoredPickService: SponsoredPickService,
    private val adTrackingService: AdTrackingService,
) : ViewModel() {

    private val _pick = MutableStateFlow<SponsoredPick?>(null)
    val pick: StateFlow<SponsoredPick?> = _pick.asStateFlow()

    fun load(surface: String, query: String?) {
        viewModelScope.launch {
            _pick.value = sponsoredPickService.fetch(surface, query)
        }
    }

    fun onImpression(surface: String) {
        _pick.value?.let { adTrackingService.recordSponsoredImpression(it.campaignId, surface) }
    }

    fun onClick(surface: String) {
        _pick.value?.let { adTrackingService.recordSponsoredClick(it.campaignId, surface) }
    }
}
