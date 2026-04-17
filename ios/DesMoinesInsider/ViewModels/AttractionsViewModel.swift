import Foundation

/// ViewModel for the Attractions browse screen. Mirrors RestaurantsViewModel
/// but scoped to the `attractions` table — search, type filter, rating floor,
/// featured toggle, and simple sort. Pagination matches other list screens.
@MainActor
@Observable
final class AttractionsViewModel {
    // MARK: - Public State

    private(set) var attractions: [Attraction] = []
    private(set) var isLoading = false
    private(set) var isLoadingMore = false
    private(set) var errorMessage: String?
    private(set) var hasMore = false

    var searchText: String = "" {
        didSet {
            guard !suppressFilterSideEffects, searchText != oldValue else { return }
            debounceSearch()
        }
    }
    var selectedTypes: Set<AttractionType> = [] {
        didSet {
            guard !suppressFilterSideEffects, selectedTypes != oldValue else { return }
            Task { await refresh() }
        }
    }
    var minRating: Double = 0 {
        didSet {
            guard !suppressFilterSideEffects, minRating != oldValue else { return }
            Task { await refresh() }
        }
    }
    var featuredOnly: Bool = false {
        didSet {
            guard !suppressFilterSideEffects, featuredOnly != oldValue else { return }
            Task { await refresh() }
        }
    }
    var sortBy: SortOption = .newest {
        didSet {
            guard !suppressFilterSideEffects, sortBy != oldValue else { return }
            Task { await refresh() }
        }
    }

    /// Set while `clearFilters()` runs so the four mutation didSets don't each
    /// fire their own refresh. We do one refresh at the end instead.
    private var suppressFilterSideEffects = false

    enum SortOption: String, CaseIterable, Identifiable {
        case newest = "Newest"
        case rating = "Top rated"
        case name = "Name"

        var id: String { rawValue }
    }

    var activeFilterCount: Int {
        var count = selectedTypes.count
        if minRating > 0 { count += 1 }
        if featuredOnly { count += 1 }
        return count
    }

    // MARK: - Dependencies

    private let attractionsService = AttractionsService.shared
    private let pageSize = Config.defaultPageSize
    private var offset = 0
    private var searchTask: Task<Void, Never>?

    // MARK: - Load

    func loadInitialData() async {
        // Avoid double-fetch when the view re-appears with existing data.
        guard attractions.isEmpty else { return }
        await refresh()
    }

    func refresh() async {
        searchTask?.cancel()
        isLoading = true
        errorMessage = nil
        offset = 0

        do {
            let response = try await attractionsService.fetchAttractions(query: buildQuery())
            attractions = applySort(response.attractions)
            hasMore = response.hasMore
        } catch {
            errorMessage = error.localizedDescription
            attractions = []
            hasMore = false
        }

        isLoading = false
    }

    func loadMoreIfNeeded(currentItem: Attraction) async {
        guard !isLoadingMore, hasMore else { return }
        // Only trigger when we're within a few items of the end
        guard let idx = attractions.firstIndex(where: { $0.id == currentItem.id }),
              idx >= attractions.count - 5 else { return }

        isLoadingMore = true
        offset = attractions.count

        do {
            let response = try await attractionsService.fetchAttractions(query: buildQuery())
            let merged = attractions + response.attractions
            attractions = applySort(merged)
            hasMore = response.hasMore
        } catch {
            // Pagination failures shouldn't break the main view — just stop loading more.
            hasMore = false
        }

        isLoadingMore = false
    }

    // MARK: - Filters

    func clearFilters() {
        suppressFilterSideEffects = true
        searchText = ""
        selectedTypes = []
        minRating = 0
        featuredOnly = false
        suppressFilterSideEffects = false
        Task { await refresh() }
    }

    // MARK: - Private

    private func buildQuery() -> AttractionsService.AttractionsQuery {
        AttractionsService.AttractionsQuery(
            searchText: searchText.trimmingCharacters(in: .whitespaces).isEmpty ? nil : searchText,
            // AttractionsService supports a single type filter; when multiple
            // types are selected we fetch a broader set and filter client-side
            // in `applySort` below.
            type: selectedTypes.count == 1 ? selectedTypes.first?.rawValue : nil,
            minRating: minRating > 0 ? minRating : nil,
            isFeatured: featuredOnly ? true : nil,
            limit: pageSize,
            offset: offset
        )
    }

    /// Apply client-side sort and (when >1 type is selected) client-side type filter.
    private func applySort(_ items: [Attraction]) -> [Attraction] {
        var filtered = items
        if selectedTypes.count > 1 {
            filtered = filtered.filter { selectedTypes.contains($0.attractionType) }
        }

        switch sortBy {
        case .newest:
            return filtered // server already orders by created_at desc
        case .rating:
            return filtered.sorted {
                ($0.rating ?? 0) > ($1.rating ?? 0)
            }
        case .name:
            return filtered.sorted { $0.name < $1.name }
        }
    }

    /// Debounce search input so we don't fire a request on every keystroke.
    private func debounceSearch() {
        searchTask?.cancel()
        searchTask = Task { [searchText] in
            try? await Task.sleep(for: .milliseconds(350))
            guard !Task.isCancelled else { return }
            // Only refresh if the field we captured is still current
            guard self.searchText == searchText else { return }
            await refresh()
        }
    }
}
