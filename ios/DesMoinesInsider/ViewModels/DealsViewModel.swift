import Foundation

/// ViewModel for the Deals screen (IOS-PARITY-010). Loads active deals and
/// supports category (entity_type) + active-now filtering and search.
@MainActor
@Observable
final class DealsViewModel {
    private(set) var allDeals: [Deal] = [] {
        didSet { recomputeDerivedState() }
    }
    private(set) var isLoading = true
    private(set) var errorMessage: String?

    var selectedCategory: String? {
        didSet {
            guard selectedCategory != oldValue else { return }
            recomputeMatching()
        }
    }
    var activeNowOnly = false
    var searchText = "" {
        didSet {
            guard searchText != oldValue else { return }
            recomputeMatching()
        }
    }

    init() {}

    /// Test seam: start with a fixed set of deals so the derived state can be
    /// asserted without a network round trip.
    ///
    /// Calls recomputeDerivedState() explicitly because a `didSet` does NOT fire
    /// for an assignment made during initialization.
    init(deals: [Deal]) {
        self.allDeals = deals
        recomputeDerivedState()
    }

    private let service = DealsService.shared
    private let cache = QueryCache.shared
    private static let cacheKey = "deals-all"

    /// entity_type categories present in the loaded deals (for filter chips).
    ///
    /// Stored rather than computed (IOS-AUDIT-PERF-022): it depends only on
    /// allDeals, and as a computed property it rebuilt a Set and sorted it on
    /// every single body evaluation.
    private(set) var categories: [String] = []

    /// Deals matching the CATEGORY and SEARCH filters. Stored, because neither
    /// input depends on the clock.
    private(set) var matchingDeals: [Deal] = []

    /// Deals after every filter, including active-now.
    ///
    /// AC1 asks for this to be stored too, and it deliberately is NOT. isActiveNow()
    /// reads the current time, so caching its result would freeze the "active now"
    /// filter at whenever the last recompute happened -- a deal would keep showing
    /// as open after its window closed, which is a behaviour change AC3 forbids.
    ///
    /// Everything expensive that CAN be cached already is: the Set-and-sort for the
    /// chips, the per-deal lowercasing for search, and the category pass. What is
    /// left is one predicate over an already-narrowed list, and only when the
    /// toggle is on.
    var filteredDeals: [Deal] {
        guard activeNowOnly else { return matchingDeals }
        return matchingDeals.filter { $0.isActiveNow() }
    }

    /// Rebuilds everything derived from allDeals.
    private func recomputeDerivedState() {
        categories = Array(Set(allDeals.map(\.entityType))).sorted()
        recomputeMatching()
    }

    /// Rebuilds the clock-independent filter result.
    private func recomputeMatching() {
        var deals = allDeals
        if let category = selectedCategory {
            deals = deals.filter { $0.entityType == category }
        }
        let query = searchText.trimmingCharacters(in: .whitespaces).lowercased()
        if !query.isEmpty {
            deals = deals.filter {
                $0.title.lowercased().contains(query)
                    || $0.businessName.lowercased().contains(query)
                    || ($0.description?.lowercased().contains(query) ?? false)
            }
        }
        matchingDeals = deals
    }

    var activeFilterCount: Int {
        (selectedCategory != nil ? 1 : 0) + (activeNowOnly ? 1 : 0)
    }

    func loadInitialData() async {
        guard allDeals.isEmpty else { return }
        await refresh()
    }

    func refresh() async {
        isLoading = true
        errorMessage = nil

        let isOffline = !NetworkMonitor.shared.isConnected

        // Offline cold start: show the last-fetched deals (IOS-COMPLY-004).
        if allDeals.isEmpty,
           let cached: [Deal] = await cache.get(Self.cacheKey, allowStale: isOffline) {
            allDeals = cached
            isLoading = false
        }
        if isOffline && !allDeals.isEmpty {
            isLoading = false
            return
        }

        do {
            allDeals = try await service.fetchDeals()
            await cache.set(Self.cacheKey, value: allDeals)
        } catch {
            // Keep cached deals on failure; only surface an error on a true blank.
            if allDeals.isEmpty {
                errorMessage = error.localizedDescription
            }
        }
        isLoading = false
    }

    func clearFilters() {
        selectedCategory = nil
        activeNowOnly = false
        searchText = ""
    }
}
