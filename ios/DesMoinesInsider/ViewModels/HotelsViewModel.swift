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
            debounceSearch()
        }
    }
    var selectedAreas: Set<String> = [] {
        didSet { guard !suppress, selectedAreas != oldValue else { return }; Task { await refresh() } }
    }
    var selectedPriceRanges: Set<String> = [] {
        didSet { guard !suppress, selectedPriceRanges != oldValue else { return }; Task { await refresh() } }
    }
    var minStars: Double = 0 {
        didSet { guard !suppress, minStars != oldValue else { return }; Task { await refresh() } }
    }
    var featuredOnly: Bool = false {
        didSet { guard !suppress, featuredOnly != oldValue else { return }; Task { await refresh() } }
    }
    var sort: HotelsService.Sort = .featured {
        didSet { guard !suppress, sort != oldValue else { return }; Task { await refresh() } }
    }

    private var suppress = false

    var activeFilterCount: Int {
        selectedAreas.count + selectedPriceRanges.count + (minStars > 0 ? 1 : 0) + (featuredOnly ? 1 : 0)
    }

    // MARK: - Dependencies

    private let service = HotelsService.shared
    private let pageSize = Config.defaultPageSize
    private var offset = 0
    private var searchTask: Task<Void, Never>?

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
        searchTask?.cancel()
        isLoading = true
        errorMessage = nil
        offset = 0

        do {
            let response = try await service.fetchHotels(query: buildQuery())
            hotels = response.hotels
            hasMore = response.hasMore
            let toIndex = response.hotels
            Task { await SpotlightService.shared.indexHotels(toIndex) }
        } catch {
            errorMessage = error.localizedDescription
            hotels = []
            hasMore = false
        }

        isLoading = false
    }

    func loadMoreIfNeeded(currentItem: Hotel) async {
        guard !isLoadingMore, hasMore else { return }
        guard let idx = hotels.firstIndex(where: { $0.id == currentItem.id }),
              idx >= hotels.count - 5 else { return }

        isLoadingMore = true
        offset = hotels.count

        do {
            let response = try await service.fetchHotels(query: buildQuery())
            hotels += response.hotels
            hasMore = response.hasMore
        } catch {
            hasMore = false
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
        Task { await refresh() }
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

    private func debounceSearch() {
        searchTask?.cancel()
        searchTask = Task { [searchText] in
            try? await Task.sleep(for: .milliseconds(350))
            guard !Task.isCancelled else { return }
            guard self.searchText == searchText else { return }
            await refresh()
        }
    }
}
