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

    private var currentOffset = 0
    private let pageSize = Config.defaultPageSize
    private var fetchTask: Task<Void, Never>?

    private let service = RestaurantsService.shared

    // MARK: - Load

    func loadInitialData() async {
        guard restaurants.isEmpty else { return }
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
            isLoading = true
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
                restaurants = response.restaurants
            } else {
                restaurants.append(contentsOf: response.restaurants)
            }

            totalCount = response.totalCount
            hasMore = response.hasMore
            currentOffset = restaurants.count
        } catch {
            errorMessage = error.localizedDescription
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

    // MARK: - Filters

    var activeFilterCount: Int {
        var count = 0
        if !selectedCuisines.isEmpty { count += 1 }
        if !selectedPriceRanges.isEmpty { count += 1 }
        if !searchText.isEmpty { count += 1 }
        return count
    }

    func clearFilters() {
        selectedCuisines = []
        selectedPriceRanges = []
        searchText = ""
        sortBy = .popularity
    }

    private func resetAndFetch() {
        fetchTask?.cancel()
        fetchTask = Task {
            try? await Task.sleep(for: .milliseconds(300))
            guard !Task.isCancelled else { return }
            await fetchRestaurants(reset: true)
        }
    }
}
