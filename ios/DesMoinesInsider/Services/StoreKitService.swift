import Foundation
import StoreKit

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

    static let productIDs: Set<String> = [
        insiderMonthlyID,
        vipMonthlyID,
    ]

    static let insiderProductIDs: Set<String> = [insiderMonthlyID]
    static let vipProductIDs: Set<String> = [vipMonthlyID]

    // MARK: - Published State

    private(set) var products: [Product] = []
    private(set) var purchasedProductIDs: Set<String> = []
    private(set) var isLoading = false
    private(set) var errorMessage: String?

    // MARK: - Computed Properties

    var currentTier: SubscriptionTier {
        for id in purchasedProductIDs {
            if Self.vipProductIDs.contains(id) { return .vip }
        }
        for id in purchasedProductIDs {
            if Self.insiderProductIDs.contains(id) { return .insider }
        }
        // Fallback for legacy product IDs
        for id in purchasedProductIDs {
            if id.contains("vip") { return .vip }
        }
        for id in purchasedProductIDs {
            if id.contains("insider") { return .insider }
        }
        return .free
    }

    var insiderProducts: [Product] {
        products.filter { Self.insiderProductIDs.contains($0.id) }
            .sorted { $0.price < $1.price }
    }

    var vipProducts: [Product] {
        products.filter { Self.vipProductIDs.contains($0.id) }
            .sorted { $0.price < $1.price }
    }

    // MARK: - Private

    @ObservationIgnored private var transactionListener: Task<Void, Never>?
    private let supabase = SupabaseService.shared.client

    // MARK: - Init

    private init() {
        transactionListener = listenForTransactions()
        Task { await loadProducts() }
        Task { await updatePurchasedProducts() }
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
                print("[StoreKit] No products found for IDs: \(Self.productIDs)")
                print("[StoreKit] Ensure products are created in App Store Connect and are in 'Ready to Submit' state.")
                #endif
            }
        } catch {
            errorMessage = StoreError.productLoadFailed.localizedDescription
            #if DEBUG
            print("[StoreKit] Product load error: \(error.localizedDescription)")
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
            let result = try await product.purchase()

            switch result {
            case .success(let verification):
                let transaction = try checkVerified(verification)
                await transaction.finish()
                await updatePurchasedProducts()
                await syncEntitlementToBackend(transaction: transaction, productId: product.id)
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

    // MARK: - Restore Purchases

    func restorePurchases() async {
        isLoading = true
        errorMessage = nil

        do {
            try await AppStore.sync()
            await updatePurchasedProducts()
            await syncAllEntitlementsToBackend()
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
    }

    // MARK: - Transaction Listener

    private func listenForTransactions() -> Task<Void, Never> {
        Task.detached { [weak self] in
            for await result in Transaction.updates {
                if let transaction = try? self?.checkVerified(result) {
                    await transaction.finish()
                    await self?.updatePurchasedProducts()
                    await self?.syncEntitlementToBackend(
                        transaction: transaction,
                        productId: transaction.productID
                    )
                }
            }
        }
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
    /// Called after restore so user_subscriptions stays in sync across devices and web.
    private func syncAllEntitlementsToBackend() async {
        for await result in Transaction.currentEntitlements {
            if let transaction = try? checkVerified(result),
               Self.productIDs.contains(transaction.productID) {
                await syncEntitlementToBackend(transaction: transaction, productId: transaction.productID)
            }
        }
    }

    /// Sends the transaction to the server-side `validate-ios-receipt` edge function for
    /// verification with Apple's App Store Server API v2. Retries up to 3 times with
    /// exponential backoff (1s, 2s, 4s) on transient errors (5xx, network failures).
    /// On validation failure, logs a warning but does NOT revoke local entitlements
    /// (grace period approach).
    private func syncEntitlementToBackend(transaction: Transaction, productId: String) async {
        guard let client = supabase else { return }
        if Config.isUITesting { return }

        // Resolve the current user ID from the Supabase session
        let userId: String
        do {
            let session = try await client.auth.session
            userId = session.user.id.uuidString
        } catch {
            #if DEBUG
            print("[StoreKit] Cannot sync entitlement - no authenticated session: \(error.localizedDescription)")
            #endif
            return
        }

        struct ValidationPayload: Encodable {
            let transactionId: String
            let originalTransactionId: String
            let productId: String
            let userId: String
        }

        struct ValidationResponse: Decodable {
            let valid: Bool
            let reason: String?
            let entitlement: Entitlement?

            struct Entitlement: Decodable {
                let tier: String?
                let expiresAt: String?
            }
        }

        let payload = ValidationPayload(
            transactionId: String(transaction.id),
            originalTransactionId: String(transaction.originalID),
            productId: productId,
            userId: userId
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
                    print("[StoreKit] Server validation succeeded: tier=\(decoded.entitlement?.tier ?? "unknown"), expires=\(decoded.entitlement?.expiresAt ?? "none")")
                    #endif
                    return
                } else {
                    // Server explicitly said the receipt is invalid.
                    // Log a warning but do NOT revoke local access (grace period).
                    let reason = decoded.reason ?? "unknown"
                    print("[StoreKit] Server validation returned invalid (grace period): reason=\(reason), product=\(productId), user=\(userId)")
                    return
                }
            } catch {
                lastError = error
                let isTransient = isTransientError(error)

                if isTransient && attempt < Self.maxRetries - 1 {
                    let delay = Self.baseRetryDelay * pow(2.0, Double(attempt))
                    #if DEBUG
                    print("[StoreKit] Transient error on attempt \(attempt + 1)/\(Self.maxRetries), retrying in \(delay)s: \(error.localizedDescription)")
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
        print("[StoreKit] Server validation failed after \(Self.maxRetries) attempts (grace period): \(lastError?.localizedDescription ?? "unknown error"), product=\(productId), user=\(userId)")
    }

    /// Determines whether an error is transient (5xx / network) and worth retrying.
    private func isTransientError(_ error: Error) -> Bool {
        let description = error.localizedDescription.lowercased()

        // Network-level errors
        if (error as NSError).domain == NSURLErrorDomain {
            return true
        }

        // Supabase FunctionsError with 5xx status or timeout keywords
        if description.contains("500")
            || description.contains("502")
            || description.contains("503")
            || description.contains("504")
            || description.contains("timeout")
            || description.contains("network")
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
