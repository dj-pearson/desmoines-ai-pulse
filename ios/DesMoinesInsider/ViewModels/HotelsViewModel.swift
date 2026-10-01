import Foundation

/// ViewModel for the "Where to Stay" screen (IOS-PARITY-003). Mirrors
/// AttractionsViewModel: search, area + price + rating filters, sort, pagination
/// and pull-to-refresh against the active `hotels` table.
@MainActor
@Observable
final class HotelsViewModel {
    // MARK: - Public State

    private(set) var hotels: [Hotel] = []
    private(set) var areas: [String] = []
    private(set) var isLoading = false
    private(set) var isLoadingMore = false
    private(set) var errorMessage: String?
    private(set) var hasMore = false
    /// Matching hotels on the server, not just the pages loaded
    /// (IOS-DD-GUIDES-17).
    private(set) var totalCount = 0

    /// Static price-range options, matching the web `PRICE_RANGES`.
    let priceRangeOptions = ["$", "$$", "$$$", "$$$$"]

    var searchText: String = "" {
        didSet {
            guard !suppress, searchText != oldValue else { return }
            resetAndFetch()
        }
    }
    var selectedAreas: Set<String> = [] {
        didSet { guard !suppress, selectedAreas != oldValue else { return }; resetAndFetch() }
    }
    var selectedPriceRanges: Set<String> = [] {
        didSet { guard !suppress, selectedPriceRanges != oldValue else { return }; resetAndFetch() }
    }
    var minStars: Double = 0 {
        didSet { guard !suppress, minStars != oldValue else { return }; resetAndFetch() }
    }
    var featuredOnly: Bool = false {
        didSet { guard !suppress, featuredOnly != oldValue else { return }; resetAndFetch() }
    }
    var sort: HotelsService.Sort = .featured {
        didSet { guard !suppress, sort != oldValue else { return }; resetAndFetch() }
    }

    private var suppress = false

    /// The filter set the rows in `hotels` were loaded for. A failed fetch
    /// for a different set must not leave the old rows (and their count)
    /// under the new chips.
    private var loadedQueryKey: String?

    private var currentQueryKey: String {
        [
            hasActiveSearch ? searchText.trimmingCharacters(in: .whitespaces) : "",
            selectedAreas.sorted().joined(separator: ","),
            selectedPriceRanges.sorted().joined(separator: ","),
            String(minStars), String(featuredOnly), sort.rawValue,
        ].joined(separator: "|")
    }

    var activeFilterCount: Int {
        selectedAreas.count + selectedPriceRanges.count + (minStars > 0 ? 1 : 0) + (featuredOnly ? 1 : 0)
    }

    /// Search narrows the list like a filter does, so the empty state and the
    /// result count have to know about it (IOS-DD-GUIDES-17).
    var hasActiveSearch: Bool { !searchText.trimmingCharacters(in: .whitespaces).isEmpty }

    /// "12 places to stay" / "1 place to stay".
    nonisolated static func resultsCopy(_ n: Int) -> String {
        "\(n) place\(n == 1 ? "" : "s") to stay"
    }

    // MARK: - Dependencies

    private let service = HotelsService.shared
    private let pageSize = Config.defaultPageSize
    private var offset = 0
    /// Single debounced, cancellable fetch for search + every filter change so a
    /// stale response can't win the last-writer race (IOS-AUDIT-PERF-004).
    private var fetchTask: Task<Void, Never>?
    /// Bumped per reset; a concurrent `loadMoreIfNeeded` discards its page if a
    /// reset ran while it was in flight.
    private var loadGeneration = 0

    // MARK: - Load

    func loadInitialData() async {
        guard hotels.isEmpty else { return }
        async let areasLoad: Void = loadAreas()
        async let refreshLoad: Bool = refresh()
        _ = await (areasLoad, refreshLoad)
    }

    private func loadAreas() async {
        areas = await service.fetchAreas()
    }

    /// Returns whether fresh rows arrived, for the pull-to-refresh haptic.
    @discardableResult
    func refresh() async -> Bool {
        loadGeneration &+= 1
        let generation = loadGeneration
        let key = currentQueryKey
        isLoading = true
        errorMessage = nil
        offset = 0

        do {
            let response = try await service.fetchHotels(query: buildQuery())
            // Discard if cancelled or superseded by a newer reset in flight.
            guard !Task.isCancelled, generation == loadGeneration else {
                // Cancelled with nothing newer started: clear the spinner.
                if generation == loadGeneration { isLoading = false }
                return false
            }
            hotels = response.hotels
            hasMore = response.hasMore
            totalCount = response.totalCount
            loadedQueryKey = key
            let toIndex = response.hotels
            Task { await SpotlightService.shared.indexHotels(toIndex) }
            isLoading = false
            return true
        } catch {
            // A debounced replacement cancels this fetch. That is not an
            // error, and it must not wipe the list: the replacement owns
            // isLoading and the rows (IOS-DD-GUIDES-17). resetAndFetch bumps
            // the generation, so a cancel with the generation unchanged is
            // the screen going away; stop the spinner then.
            if Task.isCancelled || error is CancellationError || (error as? URLError)?.code == .cancelled {
                if generation == loadGeneration { isLoading = false }
                return false
            }
            guard generation == loadGeneration else { return false }
            // Keep what is on screen when it answers this same query; the
            // view shows a banner over it. Rows for another filter set go.
            errorMessage = error.localizedDescription
            if loadedQueryKey != key {
                hotels = []
                totalCount = 0
            }
            if hotels.isEmpty { hasMore = false }
            isLoading = false
            return false
        }
    }

    func loadMoreIfNeeded(currentItem: Hotel) async {
        // Not during a reset: its offset is 0, so a page taken now would be
        // appended to rows that are about to be replaced (IOS-DD-GUIDES-17).
        guard !isLoadingMore, !isLoading, hasMore else { return }
        guard let idx = hotels.firstIndex(where: { $0.id == currentItem.id }),
              idx >= hotels.count - 5 else { return }

        isLoadingMore = true
        let generation = loadGeneration
        let startOffset = hotels.count
        offset = startOffset

        do {
            let response = try await service.fetchHotels(query: buildQuery())
            // A reset ran, or the list changed, while this page was in flight
            // — discard the stale page.
            guard generation == loadGeneration, hotels.count == startOffset else {
                isLoadingMore = false
                return
            }
            hotels += response.hotels
            hasMore = response.hasMore
            totalCount = response.totalCount
        } catch {
            if generation == loadGeneration { hasMore = false }
        }

        isLoadingMore = false
    }

    func clearFilters() {
        suppress = true
        searchText = ""
        selectedAreas = []
        selectedPriceRanges = []
        minStars = 0
        featuredOnly = false
        suppress = false
        resetAndFetch()
    }

    // MARK: - Private

    private func buildQuery() -> HotelsService.HotelsQuery {
        HotelsService.HotelsQuery(
            searchText: hasActiveSearch ? searchText.trimmingCharacters(in: .whitespaces) : nil,
            areas: Array(selectedAreas),
            priceRanges: Array(selectedPriceRanges),
            minStars: minStars > 0 ? minStars : nil,
            featuredOnly: featuredOnly,
            sort: sort,
            limit: pageSize,
            offset: offset
        )
    }

    /// Single debounced entry point for search + every filter change; cancels any
    /// pending fetch so a burst collapses to one request and the newest wins.
    /// Suppressed during bulk updates (`clearFilters`).
    private func resetAndFetch() {
        guard !suppress else { return }
        fetchTask?.cancel()
        // Supersede an in-flight refresh now, not after the debounce, so its
        // late result can't land on the new query (IOS-DD-GUIDES-17).
        loadGeneration &+= 1
        fetchTask = Task { [weak self] in
            try? await Task.sleep(for: .milliseconds(300))
            guard !Task.isCancelled else { return }
            await self?.refresh()
        }
    }
}
