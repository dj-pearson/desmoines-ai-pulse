import Foundation

/// Manages the user's saved searches + alerts (IOS-PARITY-008): load, save the
/// current search (gated to Insider+ with per-tier limits), toggle alerts, and
/// delete. Free users still see the feature and hit the contextual paywall.
///
/// Alerts are a nightly EMAIL from saved-search-alerts, for event searches
/// only (search_type 'event_list'). Toggling one used to ask for push
/// permission, for a push nothing sends (IOS-DD-SEARCH-10).
@MainActor
@Observable
final class SavedSearchesViewModel {
    static let shared = SavedSearchesViewModel()

    private(set) var savedSearches: [SavedSearch] = []
    private(set) var isLoading = false
    private(set) var errorMessage: String?
    /// Whose rows `savedSearches` holds, so a failed reload keeps them only
    /// for the same user (IOS-DD-SEARCH-12).
    private(set) var loadedForUserId: String?

    private let service = SavedSearchService.shared
    private let auth = AuthService.shared
    private let storeKit = StoreKitService.shared

    private let saveAction = PremiumFeature.QuotaAction.savedSearches
    private let alertAction = PremiumFeature.QuotaAction.alerts

    /// Longest name and query a save sends (IOS-DD-SEARCH-11).
    static let maxNameLength = 120
    static let maxQueryLength = 200

    /// Outcome of a save/alert attempt so the view can route to the paywall.
    enum Outcome: Equatable {
        case success
        case notAuthenticated
        case needsUpgrade        // free tier: feature locked
        case limitReached(Int)   // tier limit hit
        case duplicate(SavedSearch)
        /// Alerts are only delivered for event searches.
        case notEligible
        case failure
    }

    var isAuthenticated: Bool { auth.isAuthenticated }
    var alertCount: Int { Self.alertCount(savedSearches) }

    /// Alerts that count against the plan: only ones the job can deliver.
    static func alertCount(_ rows: [SavedSearch]) -> Int {
        rows.filter { $0.isAlertEligible && $0.alertsEnabled }.count
    }

    func load() async {
        guard auth.isAuthenticated, let userId = auth.currentUser?.id.uuidString else {
            reset()
            return
        }
        isLoading = true
        errorMessage = nil
        do {
            savedSearches = try await service.fetchSavedSearches(userId: userId)
            loadedForUserId = userId
        } catch {
            errorMessage = "Couldn't load your saved searches."
            if loadedForUserId != userId {
                savedSearches = []
                loadedForUserId = nil
            }
        }
        isLoading = false
    }

    /// Forget everything. Called on sign-out (AuthService.purgeLocalUserState).
    func reset() {
        savedSearches = []
        errorMessage = nil
        loadedForUserId = nil
    }

    #if DEBUG
    /// Test seam: the singleton's dependencies are private.
    func _seed(_ rows: [SavedSearch], errorMessage: String? = nil) {
        savedSearches = rows
        self.errorMessage = errorMessage
    }
    #endif

    // MARK: - Save

    /// The saved search with the same words, if any.
    func existing(for query: String) -> SavedSearch? {
        Self.existing(for: query, in: savedSearches)
    }

    static func existing(for query: String, in rows: [SavedSearch]) -> SavedSearch? {
        let wanted = query.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !wanted.isEmpty else { return nil }
        return rows.first { $0.query.caseInsensitiveCompare(wanted) == .orderedSame }
    }

    /// Trimmed and capped; an empty name falls back to the query.
    static func sanitized(name: String, query: String) -> (name: String, query: String) {
        let q = String(query.trimmingCharacters(in: .whitespacesAndNewlines).prefix(maxQueryLength))
        let n = String(name.trimmingCharacters(in: .whitespacesAndNewlines).prefix(maxNameLength))
        return (n.isEmpty ? String(q.prefix(maxNameLength)) : n, q)
    }

    func saveCurrentSearch(
        query: String,
        tab: String?,
        name: String,
        parsed: ParsedSearch,
        hadEventResults: Bool
    ) async -> Outcome {
        guard let userId = auth.currentUser?.id.uuidString else { return .notAuthenticated }
        let tier = storeKit.currentTier
        guard storeKit.hasFeature(.saveSearches) else { return .needsUpgrade }
        if let match = existing(for: query) { return .duplicate(match) }
        guard saveAction.isWithinLimit(savedSearches.count, for: tier) else {
            return .limitReached(saveAction.limit(for: tier))
        }

        let clean = Self.sanitized(name: name, query: query)
        let filters = SavedSearchFilters.forSave(query: clean.query, tab: tab, parsed: parsed)
        let searchType = SavedSearchService.searchType(tab: tab, hadEventResults: hadEventResults)
        do {
            let created = try await service.createSavedSearch(
                userId: userId,
                name: clean.name,
                filters: filters,
                searchType: searchType
            )
            savedSearches.insert(created, at: 0)
            return .success
        } catch {
            // enforce_saved_searches_limit (20260918000001) refused it: the
            // server's view of the plan, which is the one that counts.
            if FavoritesService.isServerCapError(error) { return .needsUpgrade }
            errorMessage = "Couldn't save your search."
            return .failure
        }
    }

    // MARK: - Alerts

    /// Toggle the alert flag on a saved search. Enabling requires the alerts
    /// entitlement and an event search. Returns the outcome.
    func toggleAlert(_ search: SavedSearch) async -> Outcome {
        guard auth.isAuthenticated, let userId = auth.currentUser?.id.uuidString else {
            return .notAuthenticated
        }
        let enabling = !search.alertsEnabled
        let tier = storeKit.currentTier
        // A pre-FEAT-024 iOS Events search was stored as 'advanced'; enabling
        // it promotes the row so the job reads it.
        let promote = search.promotesToEventList

        if enabling {
            guard search.isAlertEligible || promote else { return .notEligible }
            guard storeKit.hasFeature(.createAlerts) else { return .needsUpgrade }
            guard alertAction.isWithinLimit(alertCount, for: tier) else {
                return .limitReached(alertAction.limit(for: tier))
            }
        }

        let merged = search.mergedFilters(alertsEnabled: enabling)
        let promoteNow = enabling && promote
        do {
            let written = try await service.setAlerts(
                id: search.id,
                userId: userId,
                enabled: enabling,
                mergedFilters: merged,
                promoteToEventList: promoteNow
            )
            guard written > 0 else {
                errorMessage = "That saved search is no longer available."
                return .failure
            }
            if let idx = savedSearches.firstIndex(where: { $0.id == search.id }) {
                savedSearches[idx].rawFilters = merged
                savedSearches[idx].filters.alertsEnabled = enabling
                savedSearches[idx].topAlertsEnabled = enabling
                if promoteNow { savedSearches[idx].searchType = "event_list" }
            }
            return .success
        } catch {
            errorMessage = "Couldn't update the alert."
            return .failure
        }
    }

    // MARK: - Delete

    /// Returns true when the row is gone on the server.
    @discardableResult
    func delete(_ search: SavedSearch) async -> Bool {
        // Optimistically remove, but remember where it was so we can restore it
        // (and tell the user) if the backend delete fails — otherwise a failed
        // delete silently reappears on the next load with no explanation.
        guard let index = savedSearches.firstIndex(where: { $0.id == search.id }) else { return false }
        guard let userId = auth.currentUser?.id.uuidString else { return false }
        let removed = savedSearches.remove(at: index)
        do {
            let deleted = try await service.deleteSavedSearch(id: search.id, userId: userId)
            if deleted > 0 { return true }
        } catch {}
        savedSearches.insert(removed, at: min(index, savedSearches.count))
        errorMessage = "Couldn't delete that saved search."
        return false
    }
}
