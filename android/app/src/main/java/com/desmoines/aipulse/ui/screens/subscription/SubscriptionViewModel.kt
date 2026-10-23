package com.desmoines.aipulse.ui.screens.subscription

import android.app.Activity
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.android.billingclient.api.ProductDetails
import com.desmoines.aipulse.BuildConfig
import com.desmoines.aipulse.data.model.SubscriptionTier
import com.desmoines.aipulse.data.remote.BillingService
import com.desmoines.aipulse.data.remote.PurchasePlan
import com.desmoines.aipulse.data.remote.planPurchase
import com.desmoines.aipulse.util.Config
import com.desmoines.aipulse.util.PlaySubscriptionLinks
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import javax.inject.Inject

/**
 * What the paywall can say about one tier. The only price it ever shows is
 * Play's own formattedPrice from [Available]; there is no fallback figure,
 * because a price the app made up is a price the user was not charged
 * (CLAUDE.md, "Money is decided on the server"; AND-OVH-008).
 */
sealed interface TierOffer {
    /** Product query still running: show progress, not a price. */
    data object Loading : TierOffer

    /** Play returned the product with a price. */
    data class Available(val formattedPrice: String) : TierOffer

    /** Query finished and Play has no usable product for this tier. */
    data object Unavailable : TierOffer

    companion object {
        fun from(product: ProductDetails?, formattedPrice: String?, queried: Boolean, isLoading: Boolean): TierOffer {
            val price = formattedPrice?.trim().orEmpty()
            return when {
                product != null && price.isNotEmpty() -> Available(price)
                !queried || isLoading -> Loading
                else -> Unavailable
            }
        }
    }
}

data class SubscriptionScreenState(
    val currentTier: SubscriptionTier = SubscriptionTier.FREE,
    val selectedTier: SubscriptionTier? = null,
    val isLoading: Boolean = false,
    val errorMessage: String? = null,
    val insiderOffer: TierOffer = TierOffer.Loading,
    val vipOffer: TierOffer = TierOffer.Loading,
    /** Play's management page for the user's Google Play subscription; null when they have none. */
    val manageSubscriptionUrl: String? = null,
    /**
     * What a tap on Subscribe will do for [selectedTier]: a first purchase, a
     * replacement of the user's Play subscription, or nothing. Drives the
     * button label and the disclosure under it (AND-OVH-009).
     */
    val purchasePlan: PurchasePlan? = null,
) {
    fun offerFor(tier: SubscriptionTier): TierOffer? = when (tier) {
        SubscriptionTier.INSIDER -> insiderOffer
        SubscriptionTier.VIP -> vipOffer
        SubscriptionTier.FREE -> null
    }

    /** The selected tier's Play price, for the renewal disclosure under the CTA. */
    val selectedPrice: String?
        get() = (selectedTier?.let { offerFor(it) } as? TierOffer.Available)?.formattedPrice

    /** Subscribe is enabled only for a different tier Play can actually sell right now. */
    val canPurchase: Boolean
        get() = selectedTier != null && selectedTier != currentTier && selectedPrice != null
}

@HiltViewModel
class SubscriptionViewModel @Inject constructor(
    private val billingService: BillingService,
) : ViewModel() {

    private val _selectedTier = MutableStateFlow<SubscriptionTier?>(null)
    val selectedTier: StateFlow<SubscriptionTier?> = _selectedTier.asStateFlow()

    /**
     * Errors this screen raises itself. BillingService's own error flow is
     * read-only from here, and a purchase tap on a missing product used to
     * return without a word (AND-OVH-008).
     */
    private val _localError = MutableStateFlow<String?>(null)

    private val offers = combine(
        billingService.products,
        billingService.productsQueried,
        billingService.isLoading,
    ) { _, queried, isLoading ->
        val insider = billingService.getInsiderProduct()
        val vip = billingService.getVipProduct()
        TierOffer.from(insider, insider?.let { billingService.getFormattedPrice(it) }, queried, isLoading) to
            TierOffer.from(vip, vip?.let { billingService.getFormattedPrice(it) }, queried, isLoading)
    }

    val uiState: StateFlow<SubscriptionScreenState> = combine(
        billingService.currentTier,
        billingService.purchasedProductIDs,
        combine(billingService.errorMessage, _localError) { billing, local -> local ?: billing },
        billingService.isLoading,
        combine(offers, _selectedTier, billingService.playSubscription) { o, s, p -> Triple(o, s, p) },
    ) { currentTier, purchasedIds, errorMessage, isLoading, (offerPair, selectedTier, playSubscription) ->
        SubscriptionScreenState(
            currentTier = currentTier,
            selectedTier = selectedTier,
            isLoading = isLoading,
            errorMessage = errorMessage,
            insiderOffer = offerPair.first,
            vipOffer = offerPair.second,
            manageSubscriptionUrl = playSubscriptionSku(purchasedIds)?.let {
                PlaySubscriptionLinks.manageUrl(it, BuildConfig.APPLICATION_ID)
            },
            purchasePlan = selectedTier?.let { target ->
                planPurchase(
                    currentTier = playSubscription?.tier ?: SubscriptionTier.FREE,
                    currentPurchaseToken = playSubscription?.purchaseToken,
                    targetTier = target,
                )
            },
        )
    }.stateIn(
        scope = viewModelScope,
        started = SharingStarted.WhileSubscribed(5_000),
        initialValue = SubscriptionScreenState(),
    )

    fun selectTier(tier: SubscriptionTier) {
        _selectedTier.value = tier
        _localError.value = null
    }

    fun purchase(activity: Activity) {
        val tier = _selectedTier.value ?: return
        val productDetails = when (tier) {
            SubscriptionTier.INSIDER -> billingService.getInsiderProduct()
            SubscriptionTier.VIP -> billingService.getVipProduct()
            SubscriptionTier.FREE -> null
        }
        if (productDetails == null) {
            _localError.value = PRODUCT_MISSING_MESSAGE
            return
        }
        _localError.value = null
        viewModelScope.launch {
            billingService.launchPurchaseFlow(activity, productDetails)
        }
    }

    fun restorePurchases() {
        _localError.value = null
        viewModelScope.launch {
            billingService.restorePurchases()
        }
    }

    fun clearError() {
        _localError.value = null
        billingService.clearError()
    }

    companion object {
        const val PRODUCT_MISSING_MESSAGE =
            "Subscriptions unavailable right now. That plan isn't available from Google Play at the moment; please try again later."

        /**
         * The Play product id to manage, highest tier first. Null when the
         * user holds no Google Play subscription: a web or App Store
         * subscriber can't cancel anything from Play's page, and the
         * cross-platform banner already tells them where to go.
         */
        fun playSubscriptionSku(purchasedIds: Set<String>): String? = when {
            purchasedIds.isEmpty() -> null
            Config.VIP_MONTHLY_PRODUCT_ID in purchasedIds -> Config.VIP_MONTHLY_PRODUCT_ID
            Config.INSIDER_MONTHLY_PRODUCT_ID in purchasedIds -> Config.INSIDER_MONTHLY_PRODUCT_ID
            else -> purchasedIds.sorted().first()
        }
    }
}
