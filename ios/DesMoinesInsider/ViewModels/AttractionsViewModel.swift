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
            resetAndFetch()
        }
    }
    var selectedTypes: Set<AttractionType> = [] {
        didSet {
            guard !suppressFilterSideEffects, selectedTypes != oldValue else { return }
            resetAndFetch()
        }
    }
    var minRating: Double = 0 {
        didSet {
            guard !suppressFilterSideEffects, minRating != oldValue else { return }
            resetAndFetch()
        }
    }
    var featuredOnly: Bool = false {
        didSet {
            guard !suppressFilterSideEffects, featuredOnly != oldValue else { return }
            resetAndFetch()
        }
    }
    var sortBy: SortOption = .newest {
        didSet {
            guard !suppressFilterSideEffects, sortBy != oldValue else { return }
            resetAndFetch()
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
    /// Single in-flight fetch for every reset (search + all filter changes),
    /// debounced and cancellable so rapid filter changes can't leave a stale
    /// response as the last writer (IOS-AUDIT-PERF-004).
    private var fetchTask: Task<Void, Never>?
    /// Bumped at the start of every reset fetch. A concurrent `loadMoreIfNeeded`
    /// captures the value before its await and discards its page if a reset ran
    /// meanwhile, so load-more can't append onto (or clobber) a reset's offset.
    private var loadGeneration = 0

    /// Raw server rows accumulated across pages, in server (created_at desc)
    /// order. The displayed `attractions` are derived from this via client-side
    /// filter+sort. Paging offsets are driven by this raw count — never the
    /// filtered/sorted count — so client-side filtering can't desync pagination
    /// (repeat/skip items) the way deriving offset from `attractions.count` did.
    private var rawAttractions: [Attraction] = []

    // MARK: - Load

    func loadInitialData() async {
        // Avoid double-fetch when the view re-appears with existing data.
        guard attractions.isEmpty else { return }
        await refresh()
    }

    func refresh() async {
        loadGeneration &+= 1
        let generation = loadGeneration
        isLoading = true
        errorMessage = nil
        offset = 0

        do {
            let response = try await attractionsService.fetchAttractions(query: buildQuery())
            // Drop this result if it was cancelled or superseded by a newer reset
            // while the request was in flight — otherwise the older response could
            // overwrite results for the current filters (last-writer-wins race).
            guard !Task.isCancelled, generation == loadGeneration else { return }
            rawAttractions = response.attractions
            attractions = applySort(rawAttractions)
            hasMore = response.hasMore
        } catch {
            guard generation == loadGeneration else { return }
            errorMessage = error.localizedDescription
            rawAttractions = []
            attractions = []
            hasMore = false
        }

        if generation == loadGeneration { isLoading = false }
    }

    func loadMoreIfNeeded(currentItem: Attraction) async {
        guard !isLoadingMore, hasMore else { return }
        // Only trigger when we're within a few items of the end
        guard let idx = attractions.firstIndex(where: { $0.id == currentItem.id }),
              idx >= attractions.count - 5 else { return }

        isLoadingMore = true
        let generation = loadGeneration
        // Offset is the count of RAW server rows fetched so far, not the
        // filtered/sorted display count — otherwise client-side filtering shifts
        // the offset and the next page repeats or skips server rows.
        offset = rawAttractions.count

        do {
            let response = try await attractionsService.fetchAttractions(query: buildQuery())
            // A reset ran while this page was in flight — its offset/filters are
            // now stale, so discard this page rather than appending to a list the
            // reset already replaced.
            guard generation == loadGeneration else { isLoadingMore = false; return }
            rawAttractions += response.attractions
            attractions = applySort(rawAttractions)
            hasMore = response.hasMore
        } catch {
            // Pagination failures shouldn't break the main view — just stop loading more.
            if generation == loadGeneration { hasMore = false }
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
        resetAndFetch()
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

    /// Single debounced entry point for search + every filter change. Cancels any
    /// pending fetch and replaces it, so a burst of filter mutations collapses to
    /// one request and the newest wins (paired with the generation guard in
    /// `refresh`). Suppressed during bulk updates (`clearFilters`), which fire one
    /// fetch at the end.
    private func resetAndFetch() {
        guard !suppressFilterSideEffects else { return }
        fetchTask?.cancel()
        fetchTask = Task { [weak self] in
            try? await Task.sleep(for: .milliseconds(300))
            guard !Task.isCancelled else { return }
            await self?.refresh()
        }
    }
}
