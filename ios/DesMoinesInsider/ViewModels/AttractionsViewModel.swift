import Foundation

/// ViewModel for the Attractions browse screen. Mirrors RestaurantsViewModel
/// but scoped to the `attractions` table — search, type filter, rating floor,
/// featured / free / kids / rainy-day toggles, and sort. Pagination matches
/// other list screens.
@MainActor
@Observable
final class AttractionsViewModel {
    // MARK: - Public State

    private(set) var attractions: [Attraction] = []
    private(set) var isLoading = false
    private(set) var isLoadingMore = false
    private(set) var errorMessage: String?
    private(set) var hasMore = false
    /// Rows matching the filters on the server, not rows loaded so far
    /// (IOS-DD-BROWSE-14).
    private(set) var totalCount = 0
    /// A page after the first failed (not cancelled). The list stays, and a
    /// retry row replaces the spinner.
    private(set) var loadMoreFailed = false
    /// Whether a load has finished, so an empty result is not refetched on
    /// every appearance (the IOS-AUDIT-UX-059 shape). A cancelled load does
    /// not count.
    private(set) var hasLoadedOnce = false

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
    /// `is_free = true` (IOS-DD-BROWSE-16).
    var freeOnly: Bool = false {
        didSet {
            guard !suppressFilterSideEffects, freeOnly != oldValue else { return }
            resetAndFetch()
        }
    }
    /// `is_kid_friendly = true`.
    var kidFriendlyOnly: Bool = false {
        didSet {
            guard !suppressFilterSideEffects, kidFriendlyOnly != oldValue else { return }
            resetAndFetch()
        }
    }
    /// "Rainy day": `is_indoor = true`.
    var indoorOnly: Bool = false {
        didSet {
            guard !suppressFilterSideEffects, indoorOnly != oldValue else { return }
            resetAndFetch()
        }
    }
    var sortBy: SortOption = .featured {
        didSet {
            guard !suppressFilterSideEffects, sortBy != oldValue else { return }
            resetAndFetch()
        }
    }

    /// Set while `clearFilters()` runs so the mutation didSets don't each
    /// fire their own refresh. We do one refresh at the end instead.
    private var suppressFilterSideEffects = false

    enum SortOption: String, CaseIterable, Identifiable {
        case featured = "Recommended"
        case newest = "Newest"
        case rating = "Top rated"
        case name = "Name"

        var id: String { rawValue }

        /// The service-level sort this option maps to. Kept as a mapping rather
        /// than reusing one enum, so the picker's display strings stay a UI
        /// concern and the service does not inherit them.
        var serviceSort: AttractionsService.Sort {
            switch self {
            case .featured: return .featured
            case .newest: return .newest
            case .rating: return .rating
            case .name: return .name
            }
        }
    }

    var activeFilterCount: Int {
        var count = selectedTypes.count
        if minRating > 0 { count += 1 }
        if featuredOnly { count += 1 }
        if freeOnly { count += 1 }
        if kidFriendlyOnly { count += 1 }
        if indoorOnly { count += 1 }
        return count
    }

    // MARK: - Dependencies

    private let attractionsService: AttractionSearchProviding
    private let pageSize = Config.defaultPageSize
    /// Single in-flight fetch for every reset (search + all filter changes),
    /// debounced and cancellable so rapid filter changes can't leave a stale
    /// response as the last writer (IOS-AUDIT-PERF-004).
    private var fetchTask: Task<Void, Never>?
    /// Bumped by every reset, synchronously, before the debounce
    /// (IOS-DD-BROWSE-14). It used to be bumped only after the 300ms sleep, so
    /// a refresh already in flight still matched and a cancelled one could
    /// write an error. A concurrent load-more captures the value before its
    /// await and discards its page if a reset ran meanwhile.
    private var loadGeneration = 0

    /// Raw server rows accumulated across pages, in server order. Paging
    /// offsets are driven by this raw count, never by what is displayed.
    private var rawAttractions: [Attraction] = []

    init(service: AttractionSearchProviding = AttractionsService.shared) {
        self.attractionsService = service
    }

    // MARK: - Load

    func loadInitialData() async {
        guard !hasLoadedOnce else { return }
        await refresh()
    }

    func refresh() async {
        loadGeneration &+= 1
        await performRefresh(generation: loadGeneration)
    }

    private func performRefresh(generation: Int) async {
        isLoading = true
        errorMessage = nil
        loadMoreFailed = false
        defer { if generation == loadGeneration { isLoading = false } }

        do {
            let response = try await attractionsService.fetchAttractions(query: buildQuery(offset: 0))
            // Drop this result if it was cancelled or superseded by a newer reset
            // while the request was in flight — otherwise the older response could
            // overwrite results for the current filters (last-writer-wins race).
            guard !Task.isCancelled, generation == loadGeneration else { return }
            rawAttractions = response.attractions
            attractions = rawAttractions
            totalCount = response.totalCount
            hasMore = response.hasMore
            hasLoadedOnce = true
            // Spotlight routes attraction-<id>; index the first page
            // (IOS-DD-PLATFORM-08).
            let page = response.attractions
            Task { await SpotlightService.shared.indexAttractions(page) }
        } catch {
            guard generation == loadGeneration else { return }
            // Leaving the screen, or a newer search, is not a failure.
            if Task.isCancelled || FavoritesService.isCancellation(error) { return }
            // Keep what is on screen; the stale-data banner says the refresh
            // failed (it was unreachable while a failure emptied the list).
            // No more pages: they would be pages of the new query appended to
            // rows of the old one.
            errorMessage = error.localizedDescription
            hasMore = false
            hasLoadedOnce = true
        }
    }

    func loadMoreIfNeeded(currentItem: Attraction) async {
        guard !isLoadingMore, !isLoading, !loadMoreFailed, hasMore else { return }
        // Only trigger when we're within a few items of the end
        guard let idx = attractions.firstIndex(where: { $0.id == currentItem.id }),
              idx >= attractions.count - 5 else { return }
        await loadMore()
    }

    /// The "Couldn't load more - Retry" row.
    func retryLoadMore() async {
        guard !isLoadingMore, !isLoading, hasMore else { return }
        await loadMore()
    }

    private func loadMore() async {
        isLoadingMore = true
        loadMoreFailed = false
        defer { isLoadingMore = false }
        let generation = loadGeneration
        // Offset is the count of RAW server rows fetched so far.
        let query = buildQuery(offset: rawAttractions.count)

        do {
            let response = try await attractionsService.fetchAttractions(query: query)
            // A reset ran while this page was in flight — its offset/filters are
            // now stale, so discard this page rather than appending to a list the
            // reset already replaced.
            guard !Task.isCancelled, generation == loadGeneration else { return }
            let known = Set(rawAttractions.map(\.id))
            rawAttractions += response.attractions.filter { !known.contains($0.id) }
            attractions = rawAttractions
            totalCount = response.totalCount
            hasMore = response.hasMore
        } catch {
            // A cancelled page (the row scrolled away) is not the end of the
            // list; it used to set hasMore = false for good (IOS-DD-BROWSE-14).
            guard generation == loadGeneration,
                  !Task.isCancelled, !FavoritesService.isCancellation(error) else { return }
            loadMoreFailed = true
        }
    }

    // MARK: - Filters

    /// Clears the filters, not the search: the toolbar menu and the empty
    /// state's "Clear Filters" are about filters, and wiping the typed query
    /// with them was a surprise (IOS-DD-BROWSE-15).
    func clearFilters() {
        suppressFilterSideEffects = true
        selectedTypes = []
        minRating = 0
        featuredOnly = false
        freeOnly = false
        kidFriendlyOnly = false
        indoorOnly = false
        suppressFilterSideEffects = false
        resetAndFetch()
    }

    // MARK: - Private

    func buildQuery(offset: Int) -> AttractionsService.AttractionsQuery {
        // IOS-AUDIT-BUG-006: type filtering and sorting are both server-side now.
        // Doing either in Swift made the offset window mean something different
        // from what the server paged by.
        var query = AttractionsService.AttractionsQuery(
            searchText: searchText.trimmingCharacters(in: .whitespaces).isEmpty ? nil : searchText,
            types: selectedTypes.isEmpty ? nil : selectedTypes.map(\.rawValue).sorted(),
            minRating: minRating > 0 ? minRating : nil,
            isFeatured: featuredOnly ? true : nil,
            sortBy: sortBy.serviceSort,
            limit: pageSize,
            offset: offset
        )
        query.isFree = freeOnly ? true : nil
        query.isKidFriendly = kidFriendlyOnly ? true : nil
        query.isIndoor = indoorOnly ? true : nil
        return query
    }

    // applySort was removed here (IOS-AUDIT-BUG-006). It sorted, and filtered by
    // type, only the pages fetched so far - so "Top rated" ranked the loaded
    // subset rather than the collection, and a multi-type filter could shrink a
    // page to a couple of rows. Both moved into the query.

    /// Single debounced entry point for search + every filter change. Cancels any
    /// pending fetch and replaces it, so a burst of filter mutations collapses to
    /// one request and the newest wins. The generation moves on here, at once,
    /// so any refresh or load-more already in flight is superseded before the
    /// debounce even starts. Suppressed during bulk updates (`clearFilters`),
    /// which fire one fetch at the end.
    private func resetAndFetch() {
        guard !suppressFilterSideEffects else { return }
        fetchTask?.cancel()
        loadGeneration &+= 1
        let generation = loadGeneration
        fetchTask = Task { [weak self] in
            try? await Task.sleep(for: .milliseconds(300))
            guard !Task.isCancelled else { return }
            await self?.performRefresh(generation: generation)
        }
    }
}
