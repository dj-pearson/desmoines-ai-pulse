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
import com.desmoines.aipulse.util.NetworkRetry
import dagger.hilt.android.qualifiers.ApplicationContext
import io.github.jan.supabase.SupabaseClient
import io.github.jan.supabase.auth.auth
import io.github.jan.supabase.functions.functions
import io.github.jan.supabase.postgrest.from
import io.github.jan.supabase.postgrest.query.Columns
import io.ktor.client.statement.bodyAsText
import io.ktor.http.isSuccess
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
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

private const val TAG = "BillingService"

/**
 * Manages Google Play Billing for subscription purchases.
 * Mirrors iOS StoreKitService.swift — same tier structure, retry logic, and grace period approach.
 */
@Singleton
class BillingService internal constructor(
    private val context: Context,
    private val supabaseClient: SupabaseClient?,
    /**
     * Dispatcher for everything this service does off the Play callbacks.
     * Defaulted at the injection site rather than here so a test can supply a
     * TestDispatcher; production always gets IO.
     */
    private val dispatcher: CoroutineDispatcher,
) : PurchasesUpdatedListener {

    @Inject
    constructor(
        @ApplicationContext context: Context,
        supabaseClient: SupabaseClient?,
    ) : this(context, supabaseClient, Dispatchers.IO)

    // Was Dispatchers.Main. Every launch below does network or disk work --
    // receipt validation, Supabase queries, Play queries -- and declaring Main
    // for that is wrong even where the SDK happens to dispatch internally, because
    // it makes the next person's addition main-thread work by default.
    private val scope = CoroutineScope(SupervisorJob() + dispatcher)

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

    // Written from Play's BillingClientStateListener callbacks and read from
    // coroutines on [dispatcher], so it needs to be visible across threads.
    @Volatile
    private var isConnected = false

    /**
     * Watchdog for [launchPurchaseFlow]. See [startPurchaseWatchdog].
     */
    private var purchaseWatchdog: Job? = null

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
            .apply {
                // Ties the Play purchase to the signed-in account. Google uses
                // it for fraud detection and it is what makes a Real-time
                // Developer Notification reconcilable to a user without a
                // round-trip. Hashed, because Play requires this field to carry
                // no personally identifiable information.
                obfuscatedAccountId()?.let { setObfuscatedAccountId(it) }
            }
            .build()

        // Armed before the sheet launches, not after, so there is no window in
        // which Play could report back before the watchdog exists.
        startPurchaseWatchdog()
        billingClient.launchBillingFlow(activity, billingFlowParams)
    }

    /**
     * Clears [_isLoading] if Play never reports back.
     *
     * [launchPurchaseFlow] sets the loading flag and only [onPurchasesUpdated]
     * clears it. That callback is not guaranteed: if the user backgrounds the
     * Play sheet and swipes the app away, or Play dies while the sheet is up,
     * nothing arrives and the spinner stays on screen for the rest of the
     * process lifetime, with the purchase buttons disabled behind it.
     *
     * The timeout is generous on purpose. A legitimate purchase can sit on the
     * Play sheet for minutes while the user adds a card or completes a bank
     * challenge, and the app is backgrounded throughout, so nobody is looking
     * at the spinner while the clock runs.
     */
    private fun startPurchaseWatchdog() {
        purchaseWatchdog?.cancel()
        purchaseWatchdog = scope.launch {
            delay(PURCHASE_FLOW_TIMEOUT_MS)
            if (_isLoading.value) {
                Log.w(TAG, "No purchase result after ${PURCHASE_FLOW_TIMEOUT_MS}ms; clearing loading state")
                _isLoading.value = false
            }
        }
    }

    override fun onPurchasesUpdated(result: BillingResult, purchases: List<Purchase>?) {
        // Play answered, so the watchdog has nothing left to guard against.
        purchaseWatchdog?.cancel()
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
                acknowledgeIfNeeded(purchase)

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
                    // Google Play auto-refunds and revokes any purchase left
                    // unacknowledged for three days. Acknowledgement used to
                    // happen only inside onPurchasesUpdated, so a purchase that
                    // completed while the app was killed -- or whose callback
                    // was never delivered -- was granted entitlement here and
                    // then silently refunded.
                    acknowledgeIfNeeded(purchase)
                }
            }
            _purchasedProductIDs.value = purchased
            recomputeCurrentTier()
            Log.i(TAG, "Updated purchases: $purchased, tier: ${_currentTier.value}")
        }
    }

    /**
     * Acknowledges [purchase] with Google Play if it has not been acknowledged
     * yet. Safe to call repeatedly: already-acknowledged purchases are skipped.
     */
    private suspend fun acknowledgeIfNeeded(purchase: Purchase) {
        if (purchase.isAcknowledged) return
        if (purchase.purchaseState != Purchase.PurchaseState.PURCHASED) return

        val params = com.android.billingclient.api.AcknowledgePurchaseParams.newBuilder()
            .setPurchaseToken(purchase.purchaseToken)
            .build()
        val result = billingClient.acknowledgePurchase(params)
        if (result.responseCode != BillingClient.BillingResponseCode.OK) {
            Log.w(TAG, "Acknowledge failed: ${result.debugMessage}")
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

        /** How long [startPurchaseWatchdog] waits for Play before giving up. */
        const val PURCHASE_FLOW_TIMEOUT_MS = 5 * 60 * 1000L
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

        val decoded: ValidationResponse = try {
            NetworkRetry.withRetry(
                maxAttempts = MAX_RETRIES,
                baseDelayMs = BASE_RETRY_DELAY_MS,
                isRetryable = ::isTransientValidationError,
            ) {
                val response = client.functions("validate-android-receipt", body = payload)
                val bodyString = response.bodyAsText()

                // A non-2xx is NOT a verdict on the receipt. The edge function
                // returns `valid:false` for auth failures, bad input, and
                // "Server configuration error" alongside genuine rejections, so
                // treating every `valid:false` as definitive would revoke every
                // paying user's entitlement during a backend outage or a
                // misconfigured deploy. Only a 2xx body is a verdict; anything
                // else is thrown, and the retry/grace path below decides.
                if (!response.status.isSuccess()) {
                    throw ReceiptValidationHttpException(response.status.value, bodyString)
                }

                validationJson.decodeFromString<ValidationResponse>(bodyString)
            }
        } catch (cancellation: CancellationException) {
            // The old loop caught Exception, which swallowed cancellation and
            // kept retrying a coroutine that had already been cancelled.
            throw cancellation
        } catch (e: Exception) {
            // Retries exhausted, or a failure not worth retrying. Either way we
            // have no verdict, so log and leave the entitlement alone: the user
            // keeps what they paid for until the server actually says otherwise.
            // Deliberately not "after $MAX_RETRIES attempts": a non-retryable
            // failure gives up on the first one, and a log that overstates what
            // was tried is how you end up chasing the wrong thing.
            Log.w(
                TAG,
                "Server validation produced no verdict (grace period): " +
                    "${e::class.java.simpleName}: ${e.message}, product=$productId, user=$userId"
            )
            return
        }

        // The verdict itself lives in validationOutcome at the bottom of this
        // file so it can be unit-tested (XPLAT-002 AC3). The status is already
        // known 2xx here; passing it keeps the rule in one place rather than
        // half here and half there.
        if (validationOutcome(true, decoded.valid) == ValidationOutcome.GRANT) {
            Log.i(TAG, "Server validation succeeded for product=$productId")
            // Clear any prior revocation: e.g. the user re-subscribed after a refund.
            _serverRevokedProductIDs.value -= productId
            recomputeCurrentTier()
        } else {
            // Server definitively rejected the receipt. Revoke rather than
            // granting an indefinite grace period (XPLAT-002).
            Log.w(
                TAG,
                "Server validation returned invalid; revoking local entitlement for " +
                    "product=$productId, user=$userId, reason=${decoded.reason ?: "unknown"}"
            )
            _serverRevokedProductIDs.value += productId
            recomputeCurrentTier()
        }
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

    /**
     * A stable, non-identifying handle for the signed-in user, or null when
     * signed out. Play caps this field at 64 characters and forbids PII, so the
     * raw Supabase user id is hashed rather than sent.
     */
    private fun obfuscatedAccountId(): String? {
        val userId = runCatching { supabaseClient?.auth?.currentSessionOrNull()?.user?.id }
            .getOrNull() ?: return null
        return java.security.MessageDigest.getInstance("SHA-256")
            .digest(userId.toByteArray())
            .joinToString("") { "%02x".format(java.util.Locale.ROOT, it) }
            .take(64)
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

/**
 * What a validate-android-receipt response means for the local entitlement
 * (XPLAT-002 AC3).
 *
 * Extracted from the middle of validateWithServer so it can be tested. The
 * branch it replaces sits in a private suspend function that reaches Google
 * Play billing and a SupabaseClient and needs an Android Context, so the
 * DECISION was unreachable from a unit test even though it is the part that
 * can revoke a paying user.
 */
internal enum class ValidationOutcome {
    /** 2xx and valid:true. Clear any prior revocation. */
    GRANT,

    /** 2xx and valid:false. The server definitively rejected the receipt. */
    REVOKE,

    /**
     * Not a verdict. Retry, then fall through to the grace period WITHOUT
     * revoking.
     *
     * This is the case worth guarding. validate-android-receipt returns
     * valid:false for auth failures, bad input and "Server configuration
     * error" as well as for genuine rejections, so reading every valid:false
     * as definitive would revoke EVERY paying user during a backend outage or
     * a misconfigured deploy. Only a 2xx body is a verdict.
     */
    NO_VERDICT,
}

/**
 * A non-2xx response from `validate-android-receipt`.
 *
 * Exists so the retry decision can be made on the status number. The previous
 * code threw an IllegalStateException with the status interpolated into its
 * message and then decided whether to retry by searching that message for
 * "500", "502", "503" and "504". A 429 or a 408 was therefore never retried,
 * a body that happened to contain the digits "503" was, and any exception with
 * a null or localized message fell straight through to give-up.
 */
internal class ReceiptValidationHttpException(
    val status: Int,
    body: String,
) : Exception("validate-android-receipt returned $status: $body")

/**
 * Whether a receipt-validation failure is worth another attempt.
 *
 * Delegates to [NetworkRetry.defaultIsRetryable] for transport failures and
 * coroutine cancellation, which is where that policy already lives; this only
 * adds the status rule for the manufactured [ReceiptValidationHttpException],
 * since Supabase's `functions()` hands back a response rather than throwing and
 * so never produces a Ktor ResponseException for the default to read.
 *
 * 408 and 429 are retryable alongside 5xx: both mean "not now", not "no".
 */
internal fun isTransientValidationError(error: Throwable): Boolean = when (error) {
    is ReceiptValidationHttpException ->
        error.status == 408 || error.status == 429 || error.status in 500..599
    else -> NetworkRetry.defaultIsRetryable(error)
}

/**
 * @param isSuccessStatus whether the HTTP status was 2xx
 * @param valid the decoded `valid` field, or null when the body did not decode
 */
internal fun validationOutcome(isSuccessStatus: Boolean, valid: Boolean?): ValidationOutcome = when {
    !isSuccessStatus -> ValidationOutcome.NO_VERDICT
    valid == true -> ValidationOutcome.GRANT
    valid == false -> ValidationOutcome.REVOKE
    // A 2xx that does not decode is not a verdict either. Failing toward
    // NO_VERDICT keeps a malformed response from revoking anyone.
    else -> ValidationOutcome.NO_VERDICT
}
