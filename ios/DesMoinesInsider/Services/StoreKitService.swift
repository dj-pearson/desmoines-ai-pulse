import Foundation
import StoreKit

/// Manages In-App Purchases via StoreKit 2.
/// Handles product loading, purchasing, restoring, and entitlement verification.
@MainActor
@Observable
final class StoreKitService {
    static let shared = StoreKitService()

    // MARK: - Product IDs

    static let productIDs: Set<String> = [
        "com.desmoines.aipulse.insider.monthly",
        "com.desmoines.aipulse.insider.yearly",
        "com.desmoines.aipulse.vip.monthly",
        "com.desmoines.aipulse.vip.yearly",
    ]

    // MARK: - Published State

    private(set) var products: [Product] = []
    private(set) var purchasedProductIDs: Set<String> = []
    private(set) var isLoading = false
    private(set) var errorMessage: String?

    // MARK: - Computed Properties

    var currentTier: SubscriptionTier {
        for id in purchasedProductIDs {
            if id.contains("vip") { return .vip }
        }
        for id in purchasedProductIDs {
            if id.contains("insider") { return .insider }
        }
        return .free
    }

    var insiderProducts: [Product] {
        products.filter { $0.id.contains("insider") }
            .sorted { $0.price < $1.price }
    }

    var vipProducts: [Product] {
        products.filter { $0.id.contains("vip") }
            .sorted { $0.price < $1.price }
    }

    // MARK: - Private

    private var transactionListener: Task<Void, Never>?
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
            products = try await Product.products(for: Self.productIDs)
                .sorted { $0.price < $1.price }
        } catch {
            errorMessage = StoreError.productLoadFailed.localizedDescription
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

    private func checkVerified<T>(_ result: VerificationResult<T>) throws -> T {
        switch result {
        case .unverified(_, let error):
            throw StoreError.verificationFailed(error)
        case .verified(let item):
            return item
        }
    }

    // MARK: - Sync Entitlement to Backend

    private func syncEntitlementToBackend(transaction: Transaction, productId: String) async {
        guard let client = supabase else { return }

        do {
            struct ReceiptPayload: Encodable {
                let transactionId: String
                let productId: String
                let originalTransactionId: String
            }

            let payload = ReceiptPayload(
                transactionId: String(transaction.id),
                productId: productId,
                originalTransactionId: String(transaction.originalID)
            )

            _ = try await client.functions.invoke(
                "verify-apple-receipt",
                options: .init(method: .post, body: payload)
            )
        } catch {
            // Log but don't surface to user - entitlement is already granted locally
            if Config.isUITesting { return }
            print("Failed to sync entitlement to backend: \(error.localizedDescription)")
        }
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
