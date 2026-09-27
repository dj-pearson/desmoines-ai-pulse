import Foundation
import os
import StoreKit
import Supabase
import UIKit

/// Manages In-App Purchases via StoreKit 2.
/// Handles product loading, purchasing, restoring, and entitlement verification.
///
/// Product IDs must match exactly what is configured in App Store Connect under
/// Subscriptions → "Des Moines Insider Premium" subscription group.
@MainActor
@Observable
final class StoreKitService {
    static let shared = StoreKitService()

    // MARK: - Subscription Group (from App Store Connect → Subscriptions)

    /// The subscription group ID from App Store Connect.
    /// Find this in App Store Connect → My Apps → Subscriptions → Group ID.
    static let subscriptionGroupID = "21957951"

    // MARK: - Product IDs (must match App Store Connect exactly)

    /// Product IDs from App Store Connect → Subscriptions → "Des Moines Insider Premium" group.
    /// Reference names: prod_Insider_Monthly (level 1), prod_VIP_Monthly (level 2).
    /// These IDs are immutable — they must match App Store Connect exactly.
    static let insiderMonthlyID = "prod_U4oa7Cpn0bRnuo"
    static let vipMonthlyID = "prod_U4oaGFEy12auTx"

    /// Annual SKUs (IOS-SUB-012). These must be created in App Store Connect in
    /// the same "Des Moines Insider Premium" group with these exact Product IDs
    /// (and ~17%-cheaper annual pricing: Insider $49.99/yr, VIP $129.99/yr) and
    /// a 7-day free-trial introductory offer. The local Products.storekit mirrors
    /// them so the paywall's monthly/annual toggle + trial work in the simulator.
    /// Keep the "insider"/"vip" substring so the backend tier-resolver fallback
    /// matches even if the explicit set is ever out of sync.
    static let insiderAnnualID = "prod_insider_annual"
    static let vipAnnualID = "prod_vip_annual"

    static let productIDs: Set<String> = [
        insiderMonthlyID,
        vipMonthlyID,
        insiderAnnualID,
        vipAnnualID,
    ]

    static let insiderProductIDs: Set<String> = [insiderMonthlyID, insiderAnnualID]
    static let vipProductIDs: Set<String> = [vipMonthlyID, vipAnnualID]

    // MARK: - Published State

    private(set) var products: [Product] = []
    private(set) var purchasedProductIDs: Set<String> = []
    private(set) var isLoading = false
    private(set) var errorMessage: String?

    /// Product IDs the server has *definitively* rejected (validate-ios-receipt
    /// returned `valid:false`, e.g. refunded/revoked/tampered receipt). These are
    /// excluded from `localTier` so a rejected receipt can no longer keep premium
    /// unlocked on-device (IOS-AUDIT-SEC-011). Transient/network failures do NOT
    /// populate this set — those keep the grace period. Cleared when the same
    /// product later validates successfully or leaves StoreKit entitlements.
    private(set) var serverRevokedProductIDs: Set<String> = []

    /// Why the server last refused this device's App Store subscription, when
    /// the refusal is one the user can act on. `.accountMismatch` drives the
    /// "belongs to another account" notice in SubscriptionView
    /// (IOS-DD-MONETIZATION-03).
    private(set) var serverRejectionReason: ReceiptRejection?

    /// How a non-2xx answer from validate-ios-receipt is handled. The server
    /// answers every `valid:false` with a 4xx, so before this the revocation
    /// branch below (IOS-AUDIT-SEC-011) only ran on a 200 that never came
    /// (IOS-DD-MONETIZATION-03).
    enum ReceiptRejection: Equatable {
        /// Apple says the receipt is not good (revoked, wrong bundle/product).
        case definitive(reason: String)
        /// The subscription is bound to a different Des Moines Insider account.
        case accountMismatch
        /// Worth retrying with backoff (5xx, 429, 408).
        case transient
        /// Keep the local entitlement and try again on a later launch.
        case grace
    }

    /// Server reasons that mean Apple itself rejected the transaction. Any
    /// other 403 (e.g. "userId does not match authenticated user") is about
    /// our session, not the receipt, and must not revoke.
    private static let definitiveRejectionReasons: Set<String> = [
        "Transaction has been revoked",
        "Bundle ID mismatch",
        "Product ID mismatch",
    ]

    /// Pure classification of a validate-ios-receipt failure. The status codes
    /// are the server's shipped contract and are not changed.
    /// 404 stays `.grace`: it is also what a sandbox/production race or a
    /// local .storekit build produces.
    static func classifyValidationFailure(statusCode: Int, body: Data?) -> ReceiptRejection {
        let reason = body.flatMap { try? JSONDecoder().decode(ValidationResponse.self, from: $0) }?.reason
        if statusCode == 409 || reason == "owned_by_another_account" {
            return .accountMismatch
        }
        if statusCode == 403, let reason, definitiveRejectionReasons.contains(reason) {
            return .definitive(reason: reason)
        }
        if statusCode >= 500 || statusCode == 429 || statusCode == 408 {
            return .transient
        }
        return .grace
    }

    /// True when a locally-present StoreKit entitlement has been revoked by the
    /// server. UI can surface a "subscription could not be verified" state.
    var hasServerRevokedEntitlement: Bool {
        !serverRevokedProductIDs.isEmpty
            && !purchasedProductIDs.subtracting(serverRevokedProductIDs).contains(where: {
                Self.insiderProductIDs.contains($0) || Self.vipProductIDs.contains($0)
                    || $0.contains("insider") || $0.contains("vip")
            })
    }

    /// Tier resolved from the user's `user_subscriptions` rows in Supabase.
    /// Picks up entitlements from other platforms (e.g. Stripe purchase on web,
    /// Google Play on Android) so the iOS UI honors them too.
    private(set) var backendTier: SubscriptionTier = .free

    // MARK: - Renewal state (IOS-SUB-014)

    /// Coarse renewal/lapse state derived from StoreKit's local subscription
    /// status, used to drive the win-back / update-payment banner.
    enum SubscriptionRenewalState: Equatable {
        case none          // no/active-elsewhere subscription, nothing to nudge
        case active        // subscribed and will auto-renew
        case expiringSoon  // subscribed but auto-renew is OFF (will lapse)
        case billingRetry  // payment failed, Apple is retrying (no grace UI)
        case grace         // in billing grace period (still entitled)
        case expired       // lapsed/revoked — eligible for win-back
    }

    private(set) var renewalState: SubscriptionRenewalState = .none
    private(set) var renewalExpiryDate: Date?

    /// Per-platform breakdown of the user's active subscriptions. Used by the
    /// SubscriptionView to surface a banner like "You also have an active VIP
    /// subscription via the website" so users know where to cancel from.
    /// Excludes the iOS row — that's already represented by `localTier`.
    struct CrossPlatformSubscription: Identifiable, Hashable {
        enum Platform: String { case web, android }
        var id: Platform { platform }
        let platform: Platform
        let tier: SubscriptionTier
    }
    private(set) var crossPlatformSubscriptions: [CrossPlatformSubscription] = []

    // MARK: - Computed Properties

    /// Highest tier the user holds across StoreKit (this device) and the backend
    /// (web/Android purchases synced into `user_subscriptions`).
    var currentTier: SubscriptionTier {
        let local = localTier
        return Self.tierRank(local) >= Self.tierRank(backendTier) ? local : backendTier
    }

    /// True when this Apple ID holds an Insider/VIP subscription. Deleting the
    /// account does not cancel it (Apple bills it, not us), so the deletion
    /// alerts say so (IOS-DD-ACCOUNT-08).
    var hasAppStoreSubscription: Bool { localTier != .free }

    /// Opens Apple's manage-subscriptions sheet on the foreground scene, or the
    /// App Store subscriptions page when there is no scene or the sheet fails.
    func showManageSubscriptions() async {
        if let scene = UIApplication.shared.connectedScenes
            .first(where: { $0.activationState == .foregroundActive }) as? UIWindowScene {
            do {
                try await AppStore.showManageSubscriptions(in: scene)
                return
            } catch {
                AppLogger.storekit.warning("showManageSubscriptions failed: \(error.localizedDescription)")
            }
        }
        if let url = URL(string: "https://apps.apple.com/account/subscriptions") {
            _ = await UIApplication.shared.open(url)
        }
    }

    /// Tier resolved from local StoreKit entitlements only. Server-revoked
    /// products are subtracted so an explicitly-rejected receipt can't keep
    /// premium unlocked locally (IOS-AUDIT-SEC-011).
    private var localTier: SubscriptionTier {
        Self.tier(forEntitledProductIDs: purchasedProductIDs.subtracting(serverRevokedProductIDs))
    }

    /// Pure tier resolution from a set of *effective* (non-revoked) product IDs.
    /// Internal + static so it can be unit-tested without StoreKit/network state.
    /// Order matters: VIP outranks Insider; known IDs are checked before the
    /// legacy substring fallback.
    static func tier(forEntitledProductIDs effective: Set<String>) -> SubscriptionTier {
        for id in effective where vipProductIDs.contains(id) { return .vip }
        for id in effective where insiderProductIDs.contains(id) { return .insider }
        // Fallback for legacy product IDs
        for id in effective where id.contains("vip") { return .vip }
        for id in effective where id.contains("insider") { return .insider }
        return .free
    }

    /// Resolve a backend plan name (e.g. "VIP Annual", "Insider Monthly") to a
    /// tier by substring, mirroring `tier(forEntitledProductIDs:)` so a
    /// cross-platform plan name never downgrades to `.free` (IOS-AUDIT-BUG-003).
    static func tier(forPlanName name: String?) -> SubscriptionTier {
        let planName = (name ?? "free").lowercased()
        if planName.contains("vip") { return .vip }
        if planName.contains("insider") { return .insider }
        return .free
    }

    private static func tierRank(_ tier: SubscriptionTier) -> Int {
        switch tier {
        case .vip: return 2
        case .insider: return 1
        case .free: return 0
        }
    }

    var insiderProducts: [Product] {
        products.filter { Self.insiderProductIDs.contains($0.id) }
            .sorted { $0.price < $1.price }
    }

    var vipProducts: [Product] {
        products.filter { Self.vipProductIDs.contains($0.id) }
            .sorted { $0.price < $1.price }
    }

    // MARK: - Billing Periods (IOS-SUB-010)

    /// Billing cadence for a subscription product. Annual SKUs arrive with
    /// IOS-SUB-012; until then `availablePeriods` reports `[.monthly]` and the
    /// paywall's period toggle stays hidden automatically.
    enum SubscriptionPeriod: String, CaseIterable, Identifiable {
        case monthly, annual
        var id: String { rawValue }
        var label: String { self == .monthly ? "Monthly" : "Annual" }
        var shortSuffix: String { self == .monthly ? "/mo" : "/yr" }
    }

    /// The product for a tier + billing period, if one is configured in App
    /// Store Connect. Drives the contextual paywall's tier/period selection.
    func product(for tier: SubscriptionTier, period: SubscriptionPeriod) -> Product? {
        pool(for: tier).first { Self.period(of: $0) == period }
    }

    /// Which billing periods are actually available for a tier (derived from the
    /// loaded products). Order follows `SubscriptionPeriod.allCases`.
    func availablePeriods(for tier: SubscriptionTier) -> [SubscriptionPeriod] {
        let present = Set(pool(for: tier).map { Self.period(of: $0) })
        return SubscriptionPeriod.allCases.filter { present.contains($0) }
    }

    private func pool(for tier: SubscriptionTier) -> [Product] {
        switch tier {
        case .insider: return insiderProducts
        case .vip: return vipProducts
        case .free: return []
        }
    }

    /// Maps a product's StoreKit subscription period to our coarse monthly /
    /// annual bucket (weekly/monthly → monthly; yearly → annual).
    private static func period(of product: Product) -> SubscriptionPeriod {
        guard let unit = product.subscription?.subscriptionPeriod.unit else { return .monthly }
        return unit == .year ? .annual : .monthly
    }

    /// Coarse rank so callers can tell whether a tier is an upgrade over the
    /// user's current entitlement. `free < insider < vip`.
    static func rank(_ tier: SubscriptionTier) -> Int { tierRank(tier) }

    /// Whether the current entitlement unlocks a feature (IOS-SUB-011). The
    /// single iOS equivalent of the web `useSubscription().hasFeature()`.
    func hasFeature(_ feature: PremiumFeature) -> Bool {
        Self.tierRank(currentTier) >= Self.tierRank(feature.requiredTier)
    }

    // MARK: - Private

    @ObservationIgnored private var transactionListener: Task<Void, Never>?
    private let supabase = SupabaseService.shared.client

    // MARK: - Init

    private init() {
        transactionListener = listenForTransactions()
        Task { await loadProducts() }
        Task { await updatePurchasedProducts() }
        Task { await refreshBackendTier() }
    }

    deinit {
        transactionListener?.cancel()
    }

    // MARK: - Load Products

    func loadProducts() async {
        isLoading = true
        errorMessage = nil

        do {
            let loaded = try await Product.products(for: Self.productIDs)
            products = loaded.sorted { $0.price < $1.price }

            if loaded.isEmpty {
                // Products exist in code but not in App Store Connect (sandbox or production).
                // This is the most common cause of Guideline 2.1(b) rejections.
                errorMessage = StoreError.productLoadFailed.localizedDescription
                #if DEBUG
                AppLogger.storekit.warning("No products found for IDs: \(Self.productIDs)")
                AppLogger.storekit.warning("Ensure products are created in App Store Connect and are in 'Ready to Submit' state.")
                #endif
            }
        } catch {
            errorMessage = StoreError.productLoadFailed.localizedDescription
            #if DEBUG
            AppLogger.storekit.error("Product load error: \(error.localizedDescription)")
            #endif
        }

        isLoading = false
    }

    // MARK: - Purchase

    @discardableResult
    func purchase(_ product: Product) async throws -> Transaction? {
        isLoading = true
        errorMessage = nil

        do {
            // Bind the purchase to the signed-in account so the server can
            // refuse it on any other account (IOS-DD-MONETIZATION-02).
            let uid = try? await supabase?.auth.session.user.id
            let result = try await product.purchase(options: Self.purchaseOptions(for: uid))

            switch result {
            case .success(let verification):
                let transaction = try checkVerified(verification)
                await transaction.finish()
                await updatePurchasedProducts()
                await syncEntitlementToBackend(transaction: transaction, productId: product.id)
                await refreshBackendTier()
                isLoading = false
                return transaction

            case .userCancelled:
                isLoading = false
                return nil

            case .pending:
                isLoading = false
                errorMessage = "Purchase is pending approval."
                return nil

            @unknown default:
                isLoading = false
                return nil
            }
        } catch {
            isLoading = false
            errorMessage = StoreError.purchaseFailed.localizedDescription
            throw error
        }
    }

    /// Purchase options for the signed-in account: the user id as
    /// `appAccountToken`, which Apple returns inside the signed transaction.
    /// Signed out, there is nothing to bind to and the set is empty.
    static func purchaseOptions(for userId: UUID?) -> Set<Product.PurchaseOption> {
        var options: Set<Product.PurchaseOption> = []
        if let userId {
            options.insert(.appAccountToken(userId))
        }
        return options
    }

    /// Finishes and syncs a purchase made through a StoreKit view
    /// (SubscriptionStoreView), whose completion handler used to only dismiss.
    /// Idempotent with the Transaction.updates listener: finishing twice and
    /// validating twice are both harmless (IOS-DD-MONETIZATION-05).
    /// Returns true when the purchase succeeded.
    func handleCompletedPurchase(_ result: Result<Product.PurchaseResult, Error>) async -> Bool {
        switch result {
        case .success(.success(let verification)):
            do {
                let transaction = try checkVerified(verification)
                await transaction.finish()
                await updatePurchasedProducts()
                await syncEntitlementToBackend(transaction: transaction, productId: transaction.productID)
                await refreshBackendTier()
                return true
            } catch {
                AppLogger.storekit.error("Store view purchase failed verification: \(error.localizedDescription)")
                errorMessage = StoreError.purchaseFailed.localizedDescription
                return false
            }
        case .success(.pending):
            errorMessage = "Purchase is pending approval."
            return false
        case .success:
            // .userCancelled and any future case.
            return false
        case .failure(let error):
            AppLogger.storekit.error("Store view purchase error: \(error.localizedDescription)")
            return false
        }
    }

    // MARK: - Free trial (IOS-DD-MONETIZATION-21)

    /// True only when the tier's annual SKU carries a free-trial introductory
    /// offer AND this Apple ID is still eligible for it. Onboarding promised
    /// "7 days free" without asking either question.
    func isFreeTrialAvailable(for tier: SubscriptionTier) async -> Bool {
        guard let subscription = product(for: tier, period: .annual)?.subscription,
              let offer = subscription.introductoryOffer,
              offer.paymentMode == .freeTrial else { return false }
        return await subscription.isEligibleForIntroOffer
    }

    // MARK: - Restore Purchases

    func restorePurchases() async {
        isLoading = true
        errorMessage = nil

        do {
            try await AppStore.sync()
            await updatePurchasedProducts()
            // Restore is the one deliberate "move it to this account" action,
            // so it is the only caller that asks for a transfer
            // (IOS-DD-MONETIZATION-02).
            await syncAllEntitlementsToBackend(transfer: true)
            await refreshBackendTier()
        } catch {
            errorMessage = StoreError.restoreFailed.localizedDescription
        }

        isLoading = false
    }

    // MARK: - Update Purchased Products

    func updatePurchasedProducts() async {
        var purchased: Set<String> = []

        for await result in Transaction.currentEntitlements {
            if let transaction = try? checkVerified(result) {
                purchased.insert(transaction.productID)
            }
        }

        purchasedProductIDs = purchased
        // Drop revocations for products the user no longer holds — a fresh
        // purchase of the same product will re-validate and re-clear anyway.
        serverRevokedProductIDs.formIntersection(purchased)
        await refreshRenewalState()
    }

    // MARK: - Renewal State (IOS-SUB-014)

    /// Reads StoreKit's local subscription `Status` for our group and resolves a
    /// coarse `renewalState` + expiry date. Drives the renewal/win-back banner.
    func refreshRenewalState() async {
        let statuses = (try? await Product.SubscriptionInfo.status(for: Self.subscriptionGroupID)) ?? []
        var resolved: SubscriptionRenewalState = .none
        var expiry: Date?

        for status in statuses {
            guard let renewal = try? checkVerified(status.renewalInfo),
                  let transaction = try? checkVerified(status.transaction) else { continue }
            if let exp = transaction.expirationDate {
                if expiry == nil || exp > (expiry ?? .distantPast) { expiry = exp }
            }
            let candidate: SubscriptionRenewalState
            switch status.state {
            case .subscribed:        candidate = renewal.willAutoRenew ? .active : .expiringSoon
            case .inBillingRetryPeriod: candidate = .billingRetry
            case .inGracePeriod:     candidate = .grace
            case .expired, .revoked: candidate = .expired
            default:                 candidate = .none
            }
            // Keep the most "entitled/positive" state if multiple rows exist.
            resolved = Self.moreRelevant(resolved, candidate)
        }

        renewalState = resolved
        renewalExpiryDate = expiry
    }

    /// Picks the state we'd rather surface when several subscription rows report
    /// different states (active > grace > expiringSoon > billingRetry > expired).
    private static func moreRelevant(_ a: SubscriptionRenewalState, _ b: SubscriptionRenewalState) -> SubscriptionRenewalState {
        func weight(_ s: SubscriptionRenewalState) -> Int {
            switch s {
            case .active: return 5
            case .grace: return 4
            case .expiringSoon: return 3
            case .billingRetry: return 2
            case .expired: return 1
            case .none: return 0
            }
        }
        return weight(a) >= weight(b) ? a : b
    }

    // MARK: - Transaction Listener

    private func listenForTransactions() -> Task<Void, Never> {
        Task.detached { [weak self] in
            for await result in Transaction.updates {
                do {
                    let transaction = try self?.checkVerified(result)
                    if let transaction {
                        await transaction.finish()
                        await self?.updatePurchasedProducts()
                        await self?.syncEntitlementToBackend(
                            transaction: transaction,
                            productId: transaction.productID
                        )
                        await self?.refreshBackendTier()
                    }
                } catch {
                    AppLogger.storekit.error("Transaction verification failed: \(error.localizedDescription)")
                    await self?.handleTransactionFailure(result: result, error: error)
                }
            }
        }
    }

    /// Logs failed transaction details and posts a notification for UI to show error.
    private func handleTransactionFailure(result: VerificationResult<Transaction>, error: Error) {
        // Extract transaction ID for support lookup regardless of verification status
        let transaction: Transaction
        switch result {
        case .unverified(let tx, _): transaction = tx
        case .verified(let tx): transaction = tx
        }

        let transactionId = String(transaction.id)
        let productId = transaction.productID
        AppLogger.storekit.error("Failed transaction ID: \(transactionId), product: \(productId)")

        // Post notification so UI can show error toast
        NotificationCenter.default.post(
            name: .storeKitTransactionFailed,
            object: nil,
            userInfo: [
                "transactionId": transactionId,
                "productId": productId,
                "error": error.localizedDescription,
            ]
        )
    }

    // MARK: - Verify Transaction

    nonisolated private func checkVerified<T>(_ result: VerificationResult<T>) throws -> T {
        switch result {
        case .unverified(_, let error):
            throw StoreError.verificationFailed(error)
        case .verified(let item):
            return item
        }
    }

    // MARK: - Sync Entitlements to Backend

    /// Maximum number of retry attempts for transient server errors.
    private static let maxRetries = 3

    /// Base delay in seconds for exponential backoff (1s, 2s, 4s).
    private static let baseRetryDelay: TimeInterval = 1.0

    /// Syncs all current subscription entitlements to the backend.
    /// Called after restore (transfer: true) and after sign-in (transfer:
    /// false) so user_subscriptions stays in sync across devices and web.
    func syncAllEntitlementsToBackend(transfer: Bool) async {
        for await result in Transaction.currentEntitlements {
            if let transaction = try? checkVerified(result),
               Self.productIDs.contains(transaction.productID) {
                await syncEntitlementToBackend(
                    transaction: transaction,
                    productId: transaction.productID,
                    transfer: transfer
                )
            }
        }
    }

    // MARK: - Sync after sign-in (IOS-DD-MONETIZATION-04)

    /// User ids already synced in this launch. Once per user per launch keeps
    /// sign-in well inside validate-ios-receipt's 30-per-15-minutes limit.
    @ObservationIgnored private var syncedForUserThisLaunch: Set<String> = []

    /// A purchase made while signed out, or whose sync failed, was never sent
    /// to the server again: finished transactions are not re-emitted by
    /// Transaction.updates, and the full sync only ran from Restore. The
    /// website, Android and every server-gated feature then saw Free.
    /// Never transfers: taking a subscription from another account is only
    /// done on an explicit Restore.
    func syncEntitlementsAfterSignIn(userId: String) async {
        if purchasedProductIDs.isEmpty {
            // At launch this can run before init's entitlement read finishes.
            await updatePurchasedProducts()
        }
        guard Self.shouldSyncAfterSignIn(
            userId: userId,
            alreadySynced: syncedForUserThisLaunch,
            hasAppStoreSubscription: hasAppStoreSubscription
        ) else { return }
        syncedForUserThisLaunch.insert(userId)
        await syncAllEntitlementsToBackend(transfer: false)
        await refreshBackendTier()
    }

    static func shouldSyncAfterSignIn(
        userId: String,
        alreadySynced: Set<String>,
        hasAppStoreSubscription: Bool
    ) -> Bool {
        hasAppStoreSubscription && !alreadySynced.contains(userId)
    }

    /// Sends the transaction to the server-side `validate-ios-receipt` edge function for
    /// verification with Apple's App Store Server API v2. Retries up to 3 times with
    /// exponential backoff (1s, 2s, 4s) on transient errors (5xx, network failures).
    /// A definitive rejection (see `classifyValidationFailure`) revokes the local
    /// entitlement; anything else keeps it (grace period approach).
    /// `transfer` is only true from Restore (IOS-DD-MONETIZATION-02).
    private func syncEntitlementToBackend(transaction: Transaction, productId: String, transfer: Bool = false) async {
        guard let client = supabase else { return }
        if Config.isUITesting { return }

        // Resolve the current user ID from the Supabase session
        let userId: String
        do {
            let session = try await client.auth.session
            userId = session.user.id.uuidString
        } catch {
            #if DEBUG
            AppLogger.storekit.warning("Cannot sync entitlement - no authenticated session: \(error.localizedDescription)")
            #endif
            return
        }

        struct ValidationPayload: Encodable {
            let transactionId: String
            let originalTransactionId: String
            let productId: String
            let userId: String
            /// Additive request field; the server defaults it to false.
            let transfer: Bool
        }

        let payload = ValidationPayload(
            transactionId: String(transaction.id),
            originalTransactionId: String(transaction.originalID),
            productId: productId,
            userId: userId,
            transfer: transfer
        )

        var lastError: Error?

        for attempt in 0..<Self.maxRetries {
            do {
                let decoded: ValidationResponse = try await client.functions.invoke(
                    "validate-ios-receipt",
                    options: .init(method: .post, body: payload)
                )

                if decoded.valid {
                    #if DEBUG
                    AppLogger.storekit.info("Server validation succeeded: tier=\(decoded.entitlement?.tier ?? "unknown"), expires=\(decoded.entitlement?.expiresAt ?? "none")")
                    #endif
                    // Clear any prior revocation for this product (e.g. the user
                    // re-subscribed after a refund).
                    serverRevokedProductIDs.remove(productId)
                    serverRejectionReason = nil
                    return
                } else {
                    // Server *definitively* rejected the receipt (refunded /
                    // revoked / tampered). Revoke the local entitlement rather
                    // than granting an indefinite grace period (IOS-AUDIT-SEC-011).
                    // Transient/network failures fall to the catch block below and
                    // keep grace; this branch is only reached on a clean
                    // `valid:false` response.
                    let reason = decoded.reason ?? "unknown"
                    AppLogger.storekit.warning("Server validation returned invalid; revoking local entitlement for \(productId): reason=\(reason)")
                    serverRevokedProductIDs.insert(productId)
                    return
                }
            } catch let functionsError as FunctionsError {
                // Every `valid:false` arrives here as a non-2xx
                // (IOS-DD-MONETIZATION-03).
                lastError = functionsError
                guard case let .httpError(code, data) = functionsError else { break }
                switch Self.classifyValidationFailure(statusCode: code, body: data) {
                case .definitive(let reason):
                    AppLogger.storekit.warning("Server rejected receipt (\(code)); revoking local entitlement for \(productId): reason=\(reason)")
                    serverRevokedProductIDs.insert(productId)
                    return
                case .accountMismatch:
                    AppLogger.storekit.warning("App Store subscription for \(productId) belongs to another account")
                    serverRevokedProductIDs.insert(productId)
                    serverRejectionReason = .accountMismatch
                    return
                case .transient:
                    if attempt < Self.maxRetries - 1 {
                        let delay = Self.baseRetryDelay * pow(2.0, Double(attempt))
                        try? await Task.sleep(nanoseconds: UInt64(delay * 1_000_000_000))
                        continue
                    }
                case .grace:
                    break
                }
                break
            } catch {
                lastError = error
                let isTransient = Self.isTransientError(error)

                if isTransient && attempt < Self.maxRetries - 1 {
                    let delay = Self.baseRetryDelay * pow(2.0, Double(attempt))
                    #if DEBUG
                    AppLogger.storekit.info("Transient error on attempt \(attempt + 1)/\(Self.maxRetries), retrying in \(delay)s: \(error.localizedDescription)")
                    #endif
                    try? await Task.sleep(nanoseconds: UInt64(delay * 1_000_000_000))
                    continue
                }

                // Non-transient error or final retry exhausted
                break
            }
        }

        // All retries exhausted or non-transient error.
        // Log but do NOT revoke local entitlement (grace period).
        AppLogger.storekit.error("Server validation failed after \(Self.maxRetries) attempts (grace period): \(lastError?.localizedDescription ?? "unknown error")")
    }

    // MARK: - Backend Tier (cross-platform read)

    /// Fetches the user's active `user_subscriptions` rows from Supabase and
    /// resolves the highest tier across platforms. This is how iOS picks up an
    /// entitlement the user purchased on the web (Stripe) or on Android.
    /// Safe to call without a session — it no-ops if the user isn't signed in.
    func refreshBackendTier() async {
        guard let client = supabase else { return }
        if Config.isUITesting { return }

        let userId: String
        do {
            let session = try await client.auth.session
            userId = session.user.id.uuidString
        } catch {
            // Not signed in — backend tier should reflect that.
            backendTier = .free
            crossPlatformSubscriptions = []
            return
        }

        struct PlanRef: Decodable { let name: String? }
        struct SubRow: Decodable {
            let status: String?
            let platform: String?
            let current_period_end: String?
            let plan: PlanRef?
        }

        do {
            let rows: [SubRow] = try await client
                .from("user_subscriptions")
                .select("status, platform, current_period_end, plan:subscription_plans(name)")
                .eq("user_id", value: userId)
                // Same set the server entitles (IOS-DD-MONETIZATION-06); the
                // past_due window is applied per row below.
                .in("status", values: ["active", "trialing", "past_due"])
                .execute()
                .value

            var maxTier: SubscriptionTier = .free
            var breakdown: [CrossPlatformSubscription] = []
            for row in rows {
                guard Self.isRowEntitled(
                    status: row.status,
                    currentPeriodEnd: Self.parseTimestamp(row.current_period_end)
                ) else { continue }
                // Match by substring (not exact equality) so backend plan names
                // like "VIP Annual" / "Insider Monthly" still resolve to the right
                // tier instead of silently downgrading to .free.
                let resolved = Self.tier(forPlanName: row.plan?.name)
                if Self.tierRank(resolved) > Self.tierRank(maxTier) {
                    maxTier = resolved
                }
                // Track non-iOS active subscriptions for the cross-platform
                // banner — iOS rows are already represented via local StoreKit
                // entitlements, surfacing them again would be redundant.
                if let platform = row.platform?.lowercased(), platform != "ios", resolved != .free {
                    if let p = CrossPlatformSubscription.Platform(rawValue: platform) {
                        breakdown.append(.init(platform: p, tier: resolved))
                    }
                }
            }
            backendTier = maxTier
            crossPlatformSubscriptions = breakdown
        } catch {
            #if DEBUG
            AppLogger.storekit.warning("Failed to refresh backend tier: \(error.localizedDescription)")
            #endif
            // Keep prior backendTier on transient failure (don't downgrade UX).
        }
    }

    /// Clears the cached backend tier — used when the user signs out so the
    /// next account doesn't briefly inherit the previous account's
    /// entitlement before `refreshBackendTier()` fetches fresh state.
    func clearBackendTier() {
        backendTier = .free
        crossPlatformSubscriptions = []
        syncedForUserThisLaunch = []
        serverRejectionReason = nil
    }

    // MARK: - Row entitlement (IOS-DD-MONETIZATION-06)

    /// Days a `past_due` row stays entitled after `current_period_end`. Must
    /// match GRACE_PERIOD_DAYS in supabase/functions/_shared/entitlements.ts.
    static let pastDueGraceDays = 14

    /// Direct port of `isSubscriptionRowEntitled` in _shared/entitlements.ts.
    /// iOS read only `status = 'active'`, so a web trial or a past_due
    /// subscriber still in grace looked Free on iPhone while the website and
    /// the server-gated features treated them as paid.
    static func isRowEntitled(status: String?, currentPeriodEnd: Date?, now: Date = Date()) -> Bool {
        switch status {
        case "active", "trialing":
            return true
        case "past_due":
            guard let end = currentPeriodEnd,
                  let graceEnd = Calendar(identifier: .gregorian)
                    .date(byAdding: .day, value: pastDueGraceDays, to: end) else { return false }
            return now <= graceEnd
        default:
            return false
        }
    }

    /// Postgres timestamptz as PostgREST returns it, with or without
    /// fractional seconds.
    static func parseTimestamp(_ raw: String?) -> Date? {
        guard let raw, !raw.isEmpty else { return nil }
        let withFraction = ISO8601DateFormatter()
        withFraction.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let date = withFraction.date(from: raw) { return date }
        let plain = ISO8601DateFormatter()
        plain.formatOptions = [.withInternetDateTime]
        if let date = plain.date(from: raw) { return date }
        // PostgREST sends microseconds; drop the fraction rather than depend
        // on how many digits the fractional parser accepts.
        let trimmed = raw.replacingOccurrences(of: #"\.\d+"#, with: "", options: .regularExpression)
        return plain.date(from: trimmed)
    }

    /// Determines whether an error is transient (5xx / network) and worth retrying.
    /// Classifies on structured NSURLError codes rather than treating the whole
    /// NSURLErrorDomain as retryable — cancellation and auth-required are NOT
    /// transient, so a cancelled receipt validation no longer backs off 3x
    /// (IOS-AUDIT-PERF-018).
    /// Internal + static so receipt-validation retry classification can be
    /// unit-tested with synthetic NSErrors (IOS-AUDIT-TEST-001). Uses no
    /// instance state.
    static func isTransientError(_ error: Error) -> Bool {
        let nsError = error as NSError

        if nsError.domain == NSURLErrorDomain {
            switch nsError.code {
            case NSURLErrorTimedOut,
                 NSURLErrorCannotConnectToHost,
                 NSURLErrorNetworkConnectionLost,
                 NSURLErrorNotConnectedToInternet,
                 NSURLErrorDNSLookupFailed,
                 NSURLErrorResourceUnavailable,
                 NSURLErrorCannotFindHost:
                return true
            default:
                // e.g. NSURLErrorCancelled (-999), auth-required — don't retry.
                return false
            }
        }

        // Supabase FunctionsError with 5xx status or timeout keywords.
        let description = error.localizedDescription.lowercased()
        if description.contains("500")
            || description.contains("502")
            || description.contains("503")
            || description.contains("504")
            || description.contains("timeout")
            || description.contains("connection") {
            return true
        }

        return false
    }

    // MARK: - Errors

    enum StoreError: LocalizedError {
        case productLoadFailed
        case purchaseFailed
        case restoreFailed
        case verificationFailed(Error)

        var errorDescription: String? {
            switch self {
            case .productLoadFailed:
                return "Unable to load subscription options. Please check your connection and try again."
            case .purchaseFailed:
                return "Purchase could not be completed. Please try again."
            case .restoreFailed:
                return "Unable to restore purchases. Please try again."
            case .verificationFailed:
                return "Purchase verification failed. Please contact support."
            }
        }
    }
}

extension Notification.Name {
    static let storeKitTransactionFailed = Notification.Name("storeKitTransactionFailed")
}

/// Response contract for the `validate-ios-receipt` edge function. File-scope
/// (was nested in `syncEntitlementToBackend`) so the decode is contract-locked
/// by a unit test (IOS-AUDIT-TEST-001 / -003) and can't silently drift.
struct ValidationResponse: Decodable {
    let valid: Bool
    let reason: String?
    let entitlement: Entitlement?

    struct Entitlement: Decodable {
        let tier: String?
        let expiresAt: String?
    }
}
