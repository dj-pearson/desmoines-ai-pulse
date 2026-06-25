import Foundation

/// Manages the user's saved searches + alerts (IOS-PARITY-008): load, save the
/// current search (gated to Insider+ with per-tier limits), toggle alerts
/// (requests push), and delete. Free users still see the feature and hit the
/// contextual paywall.
@MainActor
@Observable
final class SavedSearchesViewModel {
    static let shared = SavedSearchesViewModel()

    private(set) var savedSearches: [SavedSearch] = []
    private(set) var isLoading = false
    private(set) var errorMessage: String?

    private let service = SavedSearchService.shared
    private let auth = AuthService.shared
    private let storeKit = StoreKitService.shared
    private let push = PushNotificationService.shared

    private let saveAction = PremiumFeature.QuotaAction.savedSearches
    private let alertAction = PremiumFeature.QuotaAction.alerts

    /// Outcome of a save/alert attempt so the view can route to the paywall.
    enum Outcome: Equatable {
        case success
        case notAuthenticated
        case needsUpgrade        // free tier: feature locked
        case limitReached(Int)   // tier limit hit
        case failure
    }

    var isAuthenticated: Bool { auth.isAuthenticated }
    var alertCount: Int { savedSearches.filter(\.alertsEnabled).count }

    func load() async {
        guard auth.isAuthenticated, let userId = auth.currentUser?.id.uuidString else {
            savedSearches = []
            return
        }
        isLoading = true
        errorMessage = nil
        do {
            savedSearches = try await service.fetchSavedSearches(userId: userId)
        } catch {
            errorMessage = error.localizedDescription
            savedSearches = []
        }
        isLoading = false
    }

    // MARK: - Save

    func saveCurrentSearch(query: String, tab: String?, name: String) async -> Outcome {
        guard let userId = auth.currentUser?.id.uuidString else { return .notAuthenticated }
        let tier = storeKit.currentTier
        guard storeKit.hasFeature(.saveSearches) else { return .needsUpgrade }
        guard saveAction.isWithinLimit(savedSearches.count, for: tier) else {
            return .limitReached(saveAction.limit(for: tier))
        }

        let filters = SavedSearchFilters(query: query, tab: tab, alertsEnabled: false)
        let displayName = name.trimmingCharacters(in: .whitespaces).isEmpty ? query : name
        do {
            let created = try await service.createSavedSearch(userId: userId, name: displayName, filters: filters)
            savedSearches.insert(created, at: 0)
            return .success
        } catch {
            errorMessage = "Couldn't save your search."
            return .failure
        }
    }

    // MARK: - Alerts

    /// Toggle the alert flag on a saved search. Enabling requires the alerts
    /// entitlement (+ push permission). Returns the outcome.
    func toggleAlert(_ search: SavedSearch) async -> Outcome {
        guard auth.isAuthenticated else { return .notAuthenticated }
        let enabling = !search.alertsEnabled
        let tier = storeKit.currentTier

        if enabling {
            guard storeKit.hasFeature(.createAlerts) else { return .needsUpgrade }
            let activeAlerts = alertCount
            guard alertAction.isWithinLimit(activeAlerts, for: tier) else {
                return .limitReached(alertAction.limit(for: tier))
            }
            await push.requestPermissionAndRegister()
        }

        var filters = search.filters
        filters.alertsEnabled = enabling
        do {
            try await service.updateFilters(id: search.id, filters: filters)
            if let idx = savedSearches.firstIndex(where: { $0.id == search.id }) {
                savedSearches[idx].filters = filters
            }
            return .success
        } catch {
            errorMessage = "Couldn't update the alert."
            return .failure
        }
    }

    // MARK: - Delete

    func delete(_ search: SavedSearch) async {
        // Optimistically remove, but remember where it was so we can restore it
        // (and tell the user) if the backend delete fails — otherwise a failed
        // delete silently reappears on the next load with no explanation.
        guard let index = savedSearches.firstIndex(where: { $0.id == search.id }) else { return }
        let removed = savedSearches.remove(at: index)
        do {
            try await service.deleteSavedSearch(id: search.id)
        } catch {
            savedSearches.insert(removed, at: min(index, savedSearches.count))
            errorMessage = "Couldn't delete that saved search."
        }
    }
}
