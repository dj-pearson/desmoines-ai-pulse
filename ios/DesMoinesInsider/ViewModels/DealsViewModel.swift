import Foundation

/// ViewModel for the Deals screen (IOS-PARITY-010). Loads active deals and
/// supports category (entity_type) + active-now filtering and search.
@MainActor
@Observable
final class DealsViewModel {
    private(set) var allDeals: [Deal] = []
    private(set) var isLoading = true
    private(set) var errorMessage: String?

    var selectedCategory: String? {
        didSet { guard selectedCategory != oldValue else { return } }
    }
    var activeNowOnly = false
    var searchText = ""

    private let service = DealsService.shared
    private let cache = QueryCache.shared
    private static let cacheKey = "deals-all"

    /// entity_type categories present in the loaded deals (for filter chips).
    var categories: [String] {
        Array(Set(allDeals.map(\.entityType))).sorted()
    }

    /// Deals after applying category + active-now + search filters.
    var filteredDeals: [Deal] {
        var deals = allDeals
        if let category = selectedCategory {
            deals = deals.filter { $0.entityType == category }
        }
        if activeNowOnly {
            deals = deals.filter { $0.isActiveNow() }
        }
        let query = searchText.trimmingCharacters(in: .whitespaces).lowercased()
        if !query.isEmpty {
            deals = deals.filter {
                $0.title.lowercased().contains(query)
                    || $0.businessName.lowercased().contains(query)
                    || ($0.description?.lowercased().contains(query) ?? false)
            }
        }
        return deals
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
