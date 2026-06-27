package com.desmoines.aipulse.ui.screens.subscription

import androidx.lifecycle.ViewModel
import com.desmoines.aipulse.data.model.PaywallContext
import com.desmoines.aipulse.util.SoftPaywallService
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.StateFlow
import javax.inject.Inject

/** Thin host VM exposing the singleton SoftPaywallService state to the UI. */
@HiltViewModel
class SoftPaywallViewModel @Inject constructor(
    private val service: SoftPaywallService,
) : ViewModel() {

    val pending: StateFlow<PaywallContext?> = service.pending

    fun dismiss() = service.dismiss()

    fun onSubscribeClicked() = service.onSubscribeClicked()
}
