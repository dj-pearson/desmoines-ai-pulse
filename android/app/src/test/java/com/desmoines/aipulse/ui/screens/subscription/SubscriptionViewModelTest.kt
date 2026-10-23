package com.desmoines.aipulse.ui.screens.subscription

import android.app.Activity
import com.android.billingclient.api.ProductDetails
import com.desmoines.aipulse.data.model.SubscriptionTier
import com.desmoines.aipulse.data.remote.BillingService
import com.desmoines.aipulse.util.Config
import io.mockk.every
import io.mockk.mockk
import io.mockk.verify
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test

/**
 * AND-OVH-008: the paywall shows only Play's price, says so when Play has
 * nothing to sell, and never swallows a purchase tap on a missing product.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class SubscriptionViewModelTest {

    private val testDispatcher = StandardTestDispatcher()
    private lateinit var billingService: BillingService

    private val currentTier = MutableStateFlow(SubscriptionTier.FREE)
    private val products = MutableStateFlow<List<ProductDetails>>(emptyList())
    private val productsQueried = MutableStateFlow(false)
    private val isLoading = MutableStateFlow(false)
    private val errorMessage = MutableStateFlow<String?>(null)
    private val purchasedIds = MutableStateFlow<Set<String>>(emptySet())

    private var insiderProduct: ProductDetails? = null
    private var vipProduct: ProductDetails? = null

    @BeforeEach
    fun setup() {
        Dispatchers.setMain(testDispatcher)
        billingService = mockk(relaxed = true)
        every { billingService.currentTier } returns currentTier
        every { billingService.products } returns products
        every { billingService.productsQueried } returns productsQueried
        every { billingService.isLoading } returns isLoading
        every { billingService.errorMessage } returns errorMessage
        every { billingService.purchasedProductIDs } returns purchasedIds
        every { billingService.getInsiderProduct() } answers { insiderProduct }
        every { billingService.getVipProduct() } answers { vipProduct }
    }

    @AfterEach
    fun tearDown() = Dispatchers.resetMain()

    private fun product(price: String): ProductDetails {
        val details = mockk<ProductDetails>()
        every { billingService.getFormattedPrice(details) } returns price
        return details
    }

    /** Starts collecting so WhileSubscribed state actually computes. */
    private fun TestScope.vm(): SubscriptionViewModel {
        val viewModel = SubscriptionViewModel(billingService)
        backgroundScope.launch { viewModel.uiState.collect {} }
        return viewModel
    }

    @Test
    fun `before the product query finishes both tiers are loading, not priced`() = runTest(testDispatcher) {
        val viewModel = vm()
        advanceUntilIdle()

        val state = viewModel.uiState.value
        assertEquals(TierOffer.Loading, state.insiderOffer)
        assertEquals(TierOffer.Loading, state.vipOffer)
        viewModel.selectTier(SubscriptionTier.INSIDER)
        advanceUntilIdle()
        assertFalse(viewModel.uiState.value.canPurchase)
        assertNull(viewModel.uiState.value.selectedPrice)
    }

    @Test
    fun `a null product after the query is unavailable and cannot be bought`() = runTest(testDispatcher) {
        insiderProduct = product("$5.49")
        vipProduct = null
        productsQueried.value = true
        products.value = listOf(insiderProduct!!)
        val viewModel = vm()
        advanceUntilIdle()

        val state = viewModel.uiState.value
        assertEquals(TierOffer.Available("$5.49"), state.insiderOffer)
        assertEquals(TierOffer.Unavailable, state.vipOffer)

        viewModel.selectTier(SubscriptionTier.VIP)
        advanceUntilIdle()
        assertFalse(viewModel.uiState.value.canPurchase)
        assertNull(viewModel.uiState.value.selectedPrice)
    }

    @Test
    fun `a product with no formatted price is unavailable rather than blank`() = runTest(testDispatcher) {
        insiderProduct = product("  ")
        productsQueried.value = true
        val viewModel = vm()
        advanceUntilIdle()

        assertEquals(TierOffer.Unavailable, viewModel.uiState.value.insiderOffer)
    }

    @Test
    fun `selected tier carries Play's own price for the renewal disclosure`() = runTest(testDispatcher) {
        insiderProduct = product("EUR 4,99")
        vipProduct = product("EUR 12,49")
        productsQueried.value = true
        val viewModel = vm()

        viewModel.selectTier(SubscriptionTier.VIP)
        advanceUntilIdle()

        val state = viewModel.uiState.value
        assertEquals("EUR 12,49", state.selectedPrice)
        assertTrue(state.canPurchase)
    }

    @Test
    fun `purchasing a missing product shows an error instead of returning silently`() = runTest(testDispatcher) {
        productsQueried.value = true
        val viewModel = vm()
        viewModel.selectTier(SubscriptionTier.INSIDER)

        viewModel.purchase(mockk<Activity>(relaxed = true))
        advanceUntilIdle()

        assertEquals(SubscriptionViewModel.PRODUCT_MISSING_MESSAGE, viewModel.uiState.value.errorMessage)
        assertTrue(viewModel.uiState.value.errorMessage!!.startsWith("Subscriptions unavailable right now"))
        verify(exactly = 0) { billingService.launchPurchaseFlow(any(), any()) }

        viewModel.clearError()
        advanceUntilIdle()
        assertNull(viewModel.uiState.value.errorMessage)
    }

    @Test
    fun `purchasing an available product launches Play billing`() = runTest(testDispatcher) {
        val vip = product("$1.00")
        vipProduct = vip
        productsQueried.value = true
        val viewModel = vm()
        viewModel.selectTier(SubscriptionTier.VIP)
        val activity = mockk<Activity>(relaxed = true)

        viewModel.purchase(activity)
        advanceUntilIdle()

        verify(exactly = 1) { billingService.launchPurchaseFlow(activity, vip) }
        assertNull(viewModel.uiState.value.errorMessage)
    }

    @Test
    fun `a Google Play subscriber gets a manage link for their product`() = runTest(testDispatcher) {
        currentTier.value = SubscriptionTier.VIP
        purchasedIds.value = setOf(Config.VIP_MONTHLY_PRODUCT_ID)
        val viewModel = vm()
        advanceUntilIdle()

        assertEquals(
            "https://play.google.com/store/account/subscriptions?sku=vip_monthly&package=com.desmoines.aipulse",
            viewModel.uiState.value.manageSubscriptionUrl,
        )
    }

    @Test
    fun `no Play purchase means no manage link, even for a web subscriber`() = runTest(testDispatcher) {
        currentTier.value = SubscriptionTier.INSIDER
        val viewModel = vm()
        advanceUntilIdle()

        assertNull(viewModel.uiState.value.manageSubscriptionUrl)
    }

    @Test
    fun `manage sku prefers the higher tier`() {
        assertEquals(
            Config.VIP_MONTHLY_PRODUCT_ID,
            SubscriptionViewModel.playSubscriptionSku(
                setOf(Config.INSIDER_MONTHLY_PRODUCT_ID, Config.VIP_MONTHLY_PRODUCT_ID),
            ),
        )
        assertEquals(
            Config.INSIDER_MONTHLY_PRODUCT_ID,
            SubscriptionViewModel.playSubscriptionSku(setOf(Config.INSIDER_MONTHLY_PRODUCT_ID)),
        )
        assertNull(SubscriptionViewModel.playSubscriptionSku(emptySet()))
    }
}
