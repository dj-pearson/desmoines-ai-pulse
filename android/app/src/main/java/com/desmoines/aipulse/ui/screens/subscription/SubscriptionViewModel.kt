package com.desmoines.aipulse.ui.screens.subscription

import android.app.Activity
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.desmoines.aipulse.data.model.SubscriptionTier
import com.desmoines.aipulse.data.remote.BillingService
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import javax.inject.Inject

data class SubscriptionScreenState(
    val currentTier: SubscriptionTier = SubscriptionTier.FREE,
    val selectedTier: SubscriptionTier? = null,
    val isLoading: Boolean = false,
    val errorMessage: String? = null,
    val insiderPrice: String = "",
    val vipPrice: String = "",
    val hasProducts: Boolean = false,
)

@HiltViewModel
class SubscriptionViewModel @Inject constructor(
    private val billingService: BillingService,
) : ViewModel() {

    private val _selectedTier = MutableStateFlow<SubscriptionTier?>(null)
    val selectedTier: StateFlow<SubscriptionTier?> = _selectedTier.asStateFlow()

    val uiState: StateFlow<SubscriptionScreenState> = combine(
        billingService.currentTier,
        billingService.products,
        billingService.isLoading,
        billingService.errorMessage,
        _selectedTier,
    ) { currentTier, products, isLoading, errorMessage, selectedTier ->
        val insiderProduct = billingService.getInsiderProduct()
        val vipProduct = billingService.getVipProduct()

        SubscriptionScreenState(
            currentTier = currentTier,
            selectedTier = selectedTier,
            isLoading = isLoading,
            errorMessage = errorMessage,
            insiderPrice = insiderProduct?.let { billingService.getFormattedPrice(it) } ?: "",
            vipPrice = vipProduct?.let { billingService.getFormattedPrice(it) } ?: "",
            hasProducts = products.isNotEmpty(),
        )
    }.stateIn(
        scope = viewModelScope,
        started = SharingStarted.WhileSubscribed(5_000),
        initialValue = SubscriptionScreenState(),
    )

    fun selectTier(tier: SubscriptionTier) {
        _selectedTier.value = tier
    }

    fun purchase(activity: Activity) {
        val tier = _selectedTier.value ?: return
        val productDetails = when (tier) {
            SubscriptionTier.INSIDER -> billingService.getInsiderProduct()
            SubscriptionTier.VIP -> billingService.getVipProduct()
            SubscriptionTier.FREE -> null
        } ?: return

        billingService.launchPurchaseFlow(activity, productDetails)
    }

    fun restorePurchases() {
        viewModelScope.launch {
            billingService.restorePurchases()
        }
    }

    fun clearError() {
        billingService.clearError()
    }
}
