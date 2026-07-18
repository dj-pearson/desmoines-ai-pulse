package com.desmoines.aipulse.data.remote

import android.app.Activity
import android.content.Context
import android.util.Log
import com.android.billingclient.api.BillingClient
import com.android.billingclient.api.BillingClientStateListener
import com.android.billingclient.api.BillingFlowParams
import com.android.billingclient.api.BillingResult
import com.android.billingclient.api.PendingPurchasesParams
import com.android.billingclient.api.ProductDetails
import com.android.billingclient.api.Purchase
import com.android.billingclient.api.PurchasesUpdatedListener
import com.android.billingclient.api.QueryProductDetailsParams
import com.android.billingclient.api.QueryPurchasesParams
import com.android.billingclient.api.acknowledgePurchase
import com.android.billingclient.api.queryProductDetails
import com.android.billingclient.api.queryPurchasesAsync
import com.desmoines.aipulse.data.model.SubscriptionTier
import com.desmoines.aipulse.util.Config
import dagger.hilt.android.qualifiers.ApplicationContext
import io.github.jan.supabase.SupabaseClient
import io.github.jan.supabase.auth.auth
import io.github.jan.supabase.functions.functions
import io.github.jan.supabase.postgrest.from
import io.github.jan.supabase.postgrest.query.Columns
import io.ktor.client.statement.bodyAsText
import io.ktor.http.isSuccess
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import javax.inject.Inject
import javax.inject.Singleton
import kotlin.coroutines.resume
import kotlin.math.pow

private const val TAG = "BillingService"

/**
 * Manages Google Play Billing for subscription purchases.
 * Mirrors iOS StoreKitService.swift — same tier structure, retry logic, and grace period approach.
 */
@Singleton
class BillingService @Inject constructor(
    @param:ApplicationContext private val context: Context,
    private val supabaseClient: SupabaseClient?,
) : PurchasesUpdatedListener {

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main)

    // region State

    private val _products = MutableStateFlow<List<ProductDetails>>(emptyList())
    val products: StateFlow<List<ProductDetails>> = _products.asStateFlow()

    private val _purchasedProductIDs = MutableStateFlow<Set<String>>(emptySet())
    val purchasedProductIDs: StateFlow<Set<String>> = _purchasedProductIDs.asStateFlow()

    /**
     * Products the backend has definitively rejected (refunded / revoked /
     * tampered). Google Play keeps reporting these locally, so they must be
     * subtracted from the local entitlement — mirrors iOS's
     * `serverRevokedProductIDs` (StoreKitService.swift, IOS-AUDIT-SEC-011).
     */
    private val _serverRevokedProductIDs = MutableStateFlow<Set<String>>(emptySet())
    val serverRevokedProductIDs: StateFlow<Set<String>> = _serverRevokedProductIDs.asStateFlow()

    private val _currentTier = MutableStateFlow(SubscriptionTier.FREE)
    val currentTier: StateFlow<SubscriptionTier> = _currentTier.asStateFlow()

    /**
     * Tier resolved from the user's `user_subscriptions` rows in Supabase.
     * Picks up entitlements from other platforms (e.g. Stripe purchase on web,
     * StoreKit purchase on iOS) so the Android UI honors them too.
     */
    private val _backendTier = MutableStateFlow(SubscriptionTier.FREE)
    val backendTier: StateFlow<SubscriptionTier> = _backendTier.asStateFlow()

    private val _isLoading = MutableStateFlow(false)
    val isLoading: StateFlow<Boolean> = _isLoading.asStateFlow()

    private val _errorMessage = MutableStateFlow<String?>(null)
    val errorMessage: StateFlow<String?> = _errorMessage.asStateFlow()

    // endregion

    // region BillingClient

    private val billingClient: BillingClient = BillingClient.newBuilder(context)
        .setListener(this)
        .enablePendingPurchases(
            PendingPurchasesParams.newBuilder()
                .enableOneTimeProducts()
                .enablePrepaidPlans()
                .build()
        )
        .build()

    private var isConnected = false

    init {
        connect()
        scope.launch { refreshBackendTier() }
    }

    private fun connect() {
        billingClient.startConnection(object : BillingClientStateListener {
            override fun onBillingSetupFinished(result: BillingResult) {
                if (result.responseCode == BillingClient.BillingResponseCode.OK) {
                    isConnected = true
                    Log.i(TAG, "Billing client connected")
                    scope.launch { loadProducts() }
                    scope.launch { updatePurchasedProducts() }
                } else {
                    isConnected = false
                    Log.w(TAG, "Billing setup failed: ${result.debugMessage}")
                }
            }

            override fun onBillingServiceDisconnected() {
                isConnected = false
                Log.w(TAG, "Billing service disconnected, will reconnect on next operation")
            }
        })
    }

    /**
     * Ensures the billing client is connected, with retry.
     */
    private suspend fun ensureConnected(): Boolean {
        if (isConnected) return true
        return suspendCancellableCoroutine { cont ->
            billingClient.startConnection(object : BillingClientStateListener {
                override fun onBillingSetupFinished(result: BillingResult) {
                    isConnected = result.responseCode == BillingClient.BillingResponseCode.OK
                    if (cont.isActive) cont.resume(isConnected)
                }

                override fun onBillingServiceDisconnected() {
                    isConnected = false
                    if (cont.isActive) cont.resume(false)
                }
            })
        }
    }

    // endregion

    // region Load Products

    suspend fun loadProducts() {
        _isLoading.value = true
        _errorMessage.value = null

        if (!ensureConnected()) {
            _errorMessage.value = BillingError.PRODUCT_LOAD_FAILED.message
            _isLoading.value = false
            return
        }

        val productList = Config.SUBSCRIPTION_PRODUCT_IDS.map { productId ->
            QueryProductDetailsParams.Product.newBuilder()
                .setProductId(productId)
                .setProductType(BillingClient.ProductType.SUBS)
                .build()
        }

        val params = QueryProductDetailsParams.newBuilder()
            .setProductList(productList)
            .build()

        val result = billingClient.queryProductDetails(params)

        if (result.billingResult.responseCode == BillingClient.BillingResponseCode.OK) {
            val details = result.productDetailsList ?: emptyList()
            _products.value = details.sortedBy {
                it.subscriptionOfferDetails?.firstOrNull()?.pricingPhases
                    ?.pricingPhaseList?.firstOrNull()?.priceAmountMicros ?: Long.MAX_VALUE
            }
            if (details.isEmpty()) {
                _errorMessage.value = BillingError.PRODUCT_LOAD_FAILED.message
                Log.w(TAG, "No products found for IDs: ${Config.SUBSCRIPTION_PRODUCT_IDS}")
            }
        } else {
            _errorMessage.value = BillingError.PRODUCT_LOAD_FAILED.message
            Log.w(TAG, "Product query failed: ${result.billingResult.debugMessage}")
        }

        _isLoading.value = false
    }

    // endregion

    // region Purchase

    fun launchPurchaseFlow(activity: Activity, productDetails: ProductDetails) {
        _isLoading.value = true
        _errorMessage.value = null

        val offerToken = productDetails.subscriptionOfferDetails?.firstOrNull()?.offerToken
        if (offerToken == null) {
            _errorMessage.value = BillingError.PURCHASE_FAILED.message
            _isLoading.value = false
            return
        }

        val productDetailsParams = BillingFlowParams.ProductDetailsParams.newBuilder()
            .setProductDetails(productDetails)
            .setOfferToken(offerToken)
            .build()

        val billingFlowParams = BillingFlowParams.newBuilder()
            .setProductDetailsParamsList(listOf(productDetailsParams))
            .build()

        billingClient.launchBillingFlow(activity, billingFlowParams)
    }

    override fun onPurchasesUpdated(result: BillingResult, purchases: List<Purchase>?) {
        when (result.responseCode) {
            BillingClient.BillingResponseCode.OK -> {
                purchases?.forEach { purchase ->
                    scope.launch { handlePurchase(purchase) }
                }
            }
            BillingClient.BillingResponseCode.USER_CANCELED -> {
                _isLoading.value = false
            }
            BillingClient.BillingResponseCode.ITEM_ALREADY_OWNED -> {
                _isLoading.value = false
                scope.launch { updatePurchasedProducts() }
            }
            else -> {
                _errorMessage.value = BillingError.PURCHASE_FAILED.message
                _isLoading.value = false
                Log.w(TAG, "Purchase failed: ${result.debugMessage}")
            }
        }
    }

    private suspend fun handlePurchase(purchase: Purchase) {
        when (purchase.purchaseState) {
            Purchase.PurchaseState.PURCHASED -> {
                // Acknowledge the purchase if not already
                if (!purchase.isAcknowledged) {
                    val params = com.android.billingclient.api.AcknowledgePurchaseParams.newBuilder()
                        .setPurchaseToken(purchase.purchaseToken)
                        .build()
                    val result = billingClient.acknowledgePurchase(params)
                    if (result.responseCode != BillingClient.BillingResponseCode.OK) {
                        Log.w(TAG, "Acknowledge failed: ${result.debugMessage}")
                    }
                }

                updatePurchasedProducts()

                // Sync to backend
                purchase.products.forEach { productId ->
                    syncEntitlementToBackend(
                        purchaseToken = purchase.purchaseToken,
                        productId = productId,
                    )
                }
                refreshBackendTier()
                _isLoading.value = false
            }
            Purchase.PurchaseState.PENDING -> {
                _errorMessage.value = "Purchase is pending approval."
                _isLoading.value = false
            }
            else -> {
                _isLoading.value = false
            }
        }
    }

    // endregion

    // region Restore Purchases

    suspend fun restorePurchases() {
        _isLoading.value = true
        _errorMessage.value = null

        if (!ensureConnected()) {
            _errorMessage.value = BillingError.RESTORE_FAILED.message
            _isLoading.value = false
            return
        }

        updatePurchasedProducts()
        syncAllEntitlementsToBackend()
        refreshBackendTier()
        _isLoading.value = false
    }

    // endregion

    // region Update Purchased Products

    suspend fun updatePurchasedProducts() {
        if (!ensureConnected()) return

        val params = QueryPurchasesParams.newBuilder()
            .setProductType(BillingClient.ProductType.SUBS)
            .build()

        val result = billingClient.queryPurchasesAsync(params)

        if (result.billingResult.responseCode == BillingClient.BillingResponseCode.OK) {
            val purchased = mutableSetOf<String>()
            result.purchasesList.forEach { purchase ->
                if (purchase.purchaseState == Purchase.PurchaseState.PURCHASED) {
                    purchased.addAll(purchase.products)
                }
            }
            _purchasedProductIDs.value = purchased
            recomputeCurrentTier()
            Log.i(TAG, "Updated purchases: $purchased, tier: ${_currentTier.value}")
        }
    }

    /**
     * Tier resolved from local Google Play entitlements only, minus anything the
     * server has definitively rejected. Without the subtraction a refunded,
     * revoked, or tampered purchase keeps premium unlocked on-device
     * indefinitely, because Google Play still reports it locally (XPLAT-002).
     */
    private fun localTier(): SubscriptionTier =
        resolveTier(_purchasedProductIDs.value - _serverRevokedProductIDs.value)

    private fun resolveTier(purchasedIds: Set<String>): SubscriptionTier {
        // Check VIP first (higher tier)
        if (purchasedIds.contains(Config.VIP_MONTHLY_PRODUCT_ID)) return SubscriptionTier.VIP
        if (purchasedIds.contains(Config.INSIDER_MONTHLY_PRODUCT_ID)) return SubscriptionTier.INSIDER

        // Fallback for legacy product IDs
        purchasedIds.forEach { id ->
            if (id.contains("vip")) return SubscriptionTier.VIP
        }
        purchasedIds.forEach { id ->
            if (id.contains("insider")) return SubscriptionTier.INSIDER
        }

        return SubscriptionTier.FREE
    }

    private fun tierRank(tier: SubscriptionTier): Int = when (tier) {
        SubscriptionTier.VIP -> 2
        SubscriptionTier.INSIDER -> 1
        SubscriptionTier.FREE -> 0
    }

    /** Resolves the highest tier across local Google Play and the backend. */
    private fun recomputeCurrentTier() {
        val local = localTier()
        val backend = _backendTier.value
        _currentTier.value = if (tierRank(local) >= tierRank(backend)) local else backend
    }

    // endregion

    // region Backend Sync

    /**
     * Lenient by design: `ignoreUnknownKeys` means the backend can ADD response
     * fields without breaking shipped binaries, which CLAUDE.md treats as an
     * always-safe change. The substring check this replaced inverted that
     * guarantee — a purely additive response edit, or a change in whitespace or
     * key order, silently flipped every validation to the invalid path.
     */
    private val validationJson = Json { ignoreUnknownKeys = true }

    private companion object {
        const val MAX_RETRIES = 3
        const val BASE_RETRY_DELAY_MS = 1000L
    }

    private suspend fun syncAllEntitlementsToBackend() {
        if (!ensureConnected()) return

        val params = QueryPurchasesParams.newBuilder()
            .setProductType(BillingClient.ProductType.SUBS)
            .build()

        val result = billingClient.queryPurchasesAsync(params)
        if (result.billingResult.responseCode == BillingClient.BillingResponseCode.OK) {
            result.purchasesList.forEach { purchase ->
                if (purchase.purchaseState == Purchase.PurchaseState.PURCHASED) {
                    purchase.products.forEach { productId ->
                        syncEntitlementToBackend(
                            purchaseToken = purchase.purchaseToken,
                            productId = productId,
                        )
                    }
                }
            }
        }
    }

    /**
     * Sends the purchase to the backend for verification.
     * Retries up to 3 times with exponential backoff (1s, 2s, 4s) on transient errors.
     * On validation failure, logs a warning but does NOT revoke local entitlements (grace period).
     */
    private suspend fun syncEntitlementToBackend(
        purchaseToken: String,
        productId: String,
    ) {
        val client = supabaseClient ?: return

        val userId: String = try {
            client.auth.currentSessionOrNull()?.user?.id ?: run {
                Log.w(TAG, "Cannot sync entitlement — no authenticated session")
                return
            }
        } catch (e: Exception) {
            Log.w(TAG, "Cannot sync entitlement — auth error: ${e.message}")
            return
        }

        val payload = buildJsonObject {
            put("purchaseToken", purchaseToken)
            put("productId", productId)
            put("userId", userId)
            put("packageName", Config.APP_BUNDLE_ID)
        }

        var lastError: Exception? = null

        for (attempt in 0 until MAX_RETRIES) {
            try {
                val response = client.functions("validate-android-receipt", body = payload)
                val bodyString = response.bodyAsText()

                // A non-2xx is NOT a verdict on the receipt. The edge function
                // returns `valid:false` for auth failures, bad input, and
                // "Server configuration error" alongside genuine rejections, so
                // treating every `valid:false` as definitive would revoke every
                // paying user's entitlement during a backend outage or a
                // misconfigured deploy. Only a 2xx body is a verdict; anything
                // else falls through to the retry/grace path below.
                if (!response.status.isSuccess()) {
                    throw IllegalStateException(
                        "validate-android-receipt returned ${response.status.value}: $bodyString"
                    )
                }

                val decoded = validationJson.decodeFromString<ValidationResponse>(bodyString)

                if (decoded.valid) {
                    Log.i(TAG, "Server validation succeeded for product=$productId")
                    // Clear any prior revocation — e.g. the user re-subscribed
                    // after a refund.
                    _serverRevokedProductIDs.value -= productId
                    recomputeCurrentTier()
                    return
                } else {
                    // Server definitively rejected the receipt. Revoke rather
                    // than granting an indefinite grace period (XPLAT-002).
                    Log.w(
                        TAG,
                        "Server validation returned invalid; revoking local entitlement for " +
                            "product=$productId, user=$userId, reason=${decoded.reason ?: "unknown"}"
                    )
                    _serverRevokedProductIDs.value += productId
                    recomputeCurrentTier()
                    return
                }
            } catch (e: Exception) {
                lastError = e
                val isTransient = isTransientError(e)

                if (isTransient && attempt < MAX_RETRIES - 1) {
                    val delayMs = BASE_RETRY_DELAY_MS * 2.0.pow(attempt.toDouble()).toLong()
                    Log.d(TAG, "Transient error on attempt ${attempt + 1}/$MAX_RETRIES, retrying in ${delayMs}ms: ${e.message}")
                    delay(delayMs)
                    continue
                }
                break
            }
        }

        // All retries exhausted — log but do NOT revoke (grace period)
        Log.w(TAG, "Server validation failed after $MAX_RETRIES attempts (grace period): ${lastError?.message}, product=$productId, user=$userId")
    }

    @Serializable
    private data class BackendPlanRef(val name: String? = null)

    @Serializable
    private data class BackendSubRow(
        val status: String? = null,
        val platform: String? = null,
        val plan: BackendPlanRef? = null,
    )

    /**
     * Per-platform breakdown of the user's active subscriptions. Used by
     * SubscriptionScreen to surface a banner like "You also have an active
     * VIP subscription via the website" so users know where to cancel from.
     * Excludes the Android row — that's already represented by [currentTier].
     */
    enum class CrossPlatformOrigin { WEB, IOS }

    data class CrossPlatformSubscription(
        val origin: CrossPlatformOrigin,
        val tier: SubscriptionTier,
    )

    private val _crossPlatformSubscriptions =
        MutableStateFlow<List<CrossPlatformSubscription>>(emptyList())
    val crossPlatformSubscriptions: StateFlow<List<CrossPlatformSubscription>> =
        _crossPlatformSubscriptions.asStateFlow()

    /**
     * Fetches the user's active `user_subscriptions` rows from Supabase and
     * resolves the highest tier across platforms. This is how Android picks up
     * an entitlement the user purchased on the web (Stripe) or on iOS.
     * Safe to call without a session — it no-ops if the user isn't signed in.
     */
    suspend fun refreshBackendTier() {
        val client = supabaseClient ?: return

        val userId: String = try {
            client.auth.currentSessionOrNull()?.user?.id ?: run {
                _backendTier.value = SubscriptionTier.FREE
                _crossPlatformSubscriptions.value = emptyList()
                recomputeCurrentTier()
                return
            }
        } catch (e: Exception) {
            Log.d(TAG, "Cannot refresh backend tier — auth error: ${e.message}")
            return
        }

        try {
            val rows = client.from("user_subscriptions")
                .select(Columns.raw("status, platform, plan:subscription_plans(name)")) {
                    filter {
                        eq("user_id", userId)
                        eq("status", "active")
                    }
                }
                .decodeList<BackendSubRow>()

            var maxTier = SubscriptionTier.FREE
            val breakdown = mutableListOf<CrossPlatformSubscription>()
            rows.forEach { row ->
                val resolved = when (row.plan?.name?.lowercase()) {
                    "vip" -> SubscriptionTier.VIP
                    "insider" -> SubscriptionTier.INSIDER
                    else -> SubscriptionTier.FREE
                }
                if (tierRank(resolved) > tierRank(maxTier)) {
                    maxTier = resolved
                }
                // Track non-Android active subscriptions for the cross-
                // platform banner — Android rows are already represented via
                // local Play Billing entitlements, surfacing them again
                // would be redundant.
                val platformLower = row.platform?.lowercase()
                if (resolved != SubscriptionTier.FREE && platformLower != null && platformLower != "android") {
                    val origin = when (platformLower) {
                        "web" -> CrossPlatformOrigin.WEB
                        "ios" -> CrossPlatformOrigin.IOS
                        else -> null
                    }
                    if (origin != null) {
                        breakdown.add(CrossPlatformSubscription(origin, resolved))
                    }
                }
            }
            _backendTier.value = maxTier
            _crossPlatformSubscriptions.value = breakdown
            recomputeCurrentTier()
        } catch (e: Exception) {
            // Keep prior backendTier on transient failure (don't downgrade UX).
            Log.w(TAG, "Failed to refresh backend tier: ${e.message}")
        }
    }

    /**
     * Clears the cached backend tier — used when the user signs out so the
     * next account doesn't briefly inherit the previous account's
     * entitlement before [refreshBackendTier] fetches fresh state.
     */
    fun clearBackendTier() {
        _backendTier.value = SubscriptionTier.FREE
        _crossPlatformSubscriptions.value = emptyList()
        recomputeCurrentTier()
    }

    private fun isTransientError(error: Exception): Boolean {
        val message = error.message?.lowercase() ?: return false
        return message.contains("500") ||
                message.contains("502") ||
                message.contains("503") ||
                message.contains("504") ||
                message.contains("timeout") ||
                message.contains("network") ||
                message.contains("connection")
    }

    // endregion

    // region Helpers

    fun getInsiderProduct(): ProductDetails? =
        _products.value.find { it.productId == Config.INSIDER_MONTHLY_PRODUCT_ID }

    fun getVipProduct(): ProductDetails? =
        _products.value.find { it.productId == Config.VIP_MONTHLY_PRODUCT_ID }

    fun getFormattedPrice(productDetails: ProductDetails): String {
        return productDetails.subscriptionOfferDetails?.firstOrNull()
            ?.pricingPhases?.pricingPhaseList?.firstOrNull()
            ?.formattedPrice ?: ""
    }

    fun clearError() {
        _errorMessage.value = null
    }

    // endregion

    // region Errors

    enum class BillingError(val message: String) {
        PRODUCT_LOAD_FAILED("Unable to load subscription options. Please check your connection and try again."),
        PURCHASE_FAILED("Purchase could not be completed. Please try again."),
        RESTORE_FAILED("Unable to restore purchases. Please try again."),
    }

    // endregion
}

/**
 * Response contract for the `validate-android-receipt` edge function:
 *   { valid: true,  entitlement: { tier, expiresAt } }
 *   { valid: false, reason: string }
 *
 * File-scope (not nested) so the decode is contract-locked by a unit test and
 * cannot silently drift — mirrors iOS's `ValidationResponse` in
 * StoreKitService.swift, which is locked the same way.
 */
@Serializable
data class ValidationResponse(
    val valid: Boolean,
    val reason: String? = null,
    val entitlement: Entitlement? = null,
) {
    @Serializable
    data class Entitlement(
        val tier: String? = null,
        val expiresAt: String? = null,
    )
}
