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

    var activeFilterCount: Int {
        selectedAreas.count + selectedPriceRanges.count + (minStars > 0 ? 1 : 0) + (featuredOnly ? 1 : 0)
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
        async let refreshLoad: Void = refresh()
        _ = await (areasLoad, refreshLoad)
    }

    private func loadAreas() async {
        areas = await service.fetchAreas()
    }

    func refresh() async {
        loadGeneration &+= 1
        let generation = loadGeneration
        isLoading = true
        errorMessage = nil
        offset = 0

        do {
            let response = try await service.fetchHotels(query: buildQuery())
            // Discard if cancelled or superseded by a newer reset in flight.
            guard !Task.isCancelled, generation == loadGeneration else { return }
            hotels = response.hotels
            hasMore = response.hasMore
            let toIndex = response.hotels
            Task { await SpotlightService.shared.indexHotels(toIndex) }
        } catch {
            guard generation == loadGeneration else { return }
            errorMessage = error.localizedDescription
            hotels = []
            hasMore = false
        }

        if generation == loadGeneration { isLoading = false }
    }

    func loadMoreIfNeeded(currentItem: Hotel) async {
        guard !isLoadingMore, hasMore else { return }
        guard let idx = hotels.firstIndex(where: { $0.id == currentItem.id }),
              idx >= hotels.count - 5 else { return }

        isLoadingMore = true
        let generation = loadGeneration
        offset = hotels.count

        do {
            let response = try await service.fetchHotels(query: buildQuery())
            // A reset ran while this page was in flight — discard the stale page.
            guard generation == loadGeneration else { isLoadingMore = false; return }
            hotels += response.hotels
            hasMore = response.hasMore
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
            searchText: searchText.trimmingCharacters(in: .whitespaces).isEmpty ? nil : searchText,
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
        fetchTask = Task { [weak self] in
            try? await Task.sleep(for: .milliseconds(300))
            guard !Task.isCancelled else { return }
            await self?.refresh()
        }
    }
}
