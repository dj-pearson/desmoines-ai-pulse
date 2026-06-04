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
        do {
            allDeals = try await service.fetchDeals()
        } catch {
            errorMessage = error.localizedDescription
            allDeals = []
        }
        isLoading = false
    }

    func clearFilters() {
        selectedCategory = nil
        activeNowOnly = false
        searchText = ""
    }
}
