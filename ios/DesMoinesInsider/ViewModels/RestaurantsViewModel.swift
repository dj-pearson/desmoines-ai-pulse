import Foundation

/// ViewModel for the restaurants listing.
@MainActor
@Observable
final class RestaurantsViewModel {
    private(set) var restaurants: [Restaurant] = []
    private(set) var isLoading = false
    private(set) var isLoadingMore = false
    private(set) var hasMore = false
    private(set) var totalCount = 0
    private(set) var errorMessage: String?
    private(set) var availableCuisines: [String] = []

    var searchText = "" {
        didSet { resetAndFetch() }
    }
    var selectedCuisines: Set<String> = [] {
        didSet { resetAndFetch() }
    }
    var selectedPriceRanges: Set<String> = [] {
        didSet { resetAndFetch() }
    }
    var sortBy: RestaurantSortOption = .popularity {
        didSet { resetAndFetch() }
    }
    var showOpenNowOnly = false {
        didSet { if oldValue != showOpenNowOnly { applyOpenNowFilter() } }
    }

    private var currentOffset = 0
    private let pageSize = Config.defaultPageSize
    private var fetchTask: Task<Void, Never>?

    private let service = RestaurantsService.shared
    private let cache = QueryCache.shared

    // MARK: - Load

    func loadInitialData() async {
        guard restaurants.isEmpty else { return }

        // Serve cached data immediately for instant cold start
        let cacheKey = restaurantsCacheKey()
        let isOffline = !NetworkMonitor.shared.isConnected

        if let cached: [Restaurant] = await cache.get(cacheKey, allowStale: isOffline) {
            allRestaurants = cached
            restaurants = showOpenNowOnly ? cached.filter { $0.isOpenNow() == true } : cached
            isLoading = false
        }

        if isOffline && !restaurants.isEmpty { return }

        async let restaurantsTask: () = fetchRestaurants(reset: true)
        async let cuisinesTask: () = loadCuisines()
        _ = await (restaurantsTask, cuisinesTask)
    }

    func refresh() async {
        await fetchRestaurants(reset: true)
    }

    // MARK: - Fetch

    func fetchRestaurants(reset: Bool = false) async {
        if reset {
            currentOffset = 0
            if restaurants.isEmpty { isLoading = true }
        } else {
            isLoadingMore = true
        }
        errorMessage = nil

        do {
            var query = RestaurantsService.RestaurantsQuery()
            query.searchText = searchText.isEmpty ? nil : searchText
            query.cuisines = selectedCuisines.isEmpty ? nil : Array(selectedCuisines)
            query.priceRanges = selectedPriceRanges.isEmpty ? nil : Array(selectedPriceRanges)
            query.sortBy = sortBy
            query.limit = pageSize
            query.offset = currentOffset

            let response = try await service.fetchRestaurants(query: query)

            if reset {
                allRestaurants = response.restaurants
                await cache.set(restaurantsCacheKey(), value: response.restaurants)
            } else {
                allRestaurants.append(contentsOf: response.restaurants)
            }
            // Apply open now filter if active
            if showOpenNowOnly {
                restaurants = allRestaurants.filter { $0.isOpenNow() == true }
            } else {
                restaurants = allRestaurants
            }

            totalCount = response.totalCount
            hasMore = response.hasMore
            currentOffset = restaurants.count
        } catch {
            if restaurants.isEmpty {
                errorMessage = error.localizedDescription
            }
        }

        isLoading = false
        isLoadingMore = false
    }

    func loadMoreIfNeeded(currentItem: Restaurant?) async {
        guard let currentItem,
              hasMore,
              !isLoadingMore,
              let index = restaurants.firstIndex(where: { $0.id == currentItem.id }),
              index >= restaurants.count - 5 else { return }

        await fetchRestaurants(reset: false)
    }

    // MARK: - Cuisines

    private func loadCuisines() async {
        do {
            availableCuisines = try await service.fetchAvailableCuisines()
        } catch {
            availableCuisines = []
        }
    }

    // MARK: - Open Now Filter (client-side)

    /// All fetched restaurants before the Open Now filter is applied.
    private var allRestaurants: [Restaurant] = []

    private func applyOpenNowFilter() {
        if showOpenNowOnly {
            restaurants = allRestaurants.filter { $0.isOpenNow() == true }
        } else {
            restaurants = allRestaurants
        }
    }

    // MARK: - Filters

    var activeFilterCount: Int {
        var count = 0
        if !selectedCuisines.isEmpty { count += 1 }
        if !selectedPriceRanges.isEmpty { count += 1 }
        if !searchText.isEmpty { count += 1 }
        if showOpenNowOnly { count += 1 }
        return count
    }

    func clearFilters() {
        selectedCuisines = []
        selectedPriceRanges = []
        searchText = ""
        sortBy = .popularity
        showOpenNowOnly = false
    }

    private func resetAndFetch() {
        fetchTask?.cancel()
        fetchTask = Task {
            try? await Task.sleep(for: .milliseconds(300))
            guard !Task.isCancelled else { return }
            await fetchRestaurants(reset: true)
        }
    }

    // MARK: - Cache Key

    private func restaurantsCacheKey() -> String {
        var parts = ["restaurants"]
        if !selectedCuisines.isEmpty { parts.append("c-\(selectedCuisines.sorted().joined(separator: ","))") }
        if !selectedPriceRanges.isEmpty { parts.append("p-\(selectedPriceRanges.sorted().joined(separator: ","))") }
        if !searchText.isEmpty { parts.append("q-\(searchText)") }
        parts.append("s-\(sortBy.rawValue)")
        return parts.joined(separator: "-")
    }
}
