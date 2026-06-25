import Foundation

/// ViewModel for the restaurants listing.
@MainActor
@Observable
final class RestaurantsViewModel {
    private(set) var restaurants: [Restaurant] = [] {
        didSet { recomputeArrangedRestaurants() }
    }
    /// Sponsored-arranged view of `restaurants`, cached so the arrangement
    /// (SponsoredArranger.arrange) runs only when `restaurants` changes — not
    /// on every SwiftUI body pass (IOS-AUDIT-PERF-010).
    private(set) var arrangedRestaurants: [Restaurant] = []
    private(set) var isLoading = false
    private(set) var isLoadingMore = false
    private(set) var hasMore = false
    private(set) var totalCount = 0
    private(set) var errorMessage: String?
    private(set) var availableCuisines: [String] = []
    private(set) var availableLocations: [String] = []

    var searchText = "" {
        didSet { if oldValue != searchText { resetAndFetch() } }
    }
    var selectedCuisines: Set<String> = [] {
        didSet { if oldValue != selectedCuisines { resetAndFetch() } }
    }
    var selectedPriceRanges: Set<String> = [] {
        didSet { if oldValue != selectedPriceRanges { resetAndFetch() } }
    }
    var selectedLocations: Set<String> = [] {
        didSet { if oldValue != selectedLocations { resetAndFetch() } }
    }
    var selectedDietary: Set<String> = [] {
        didSet { if oldValue != selectedDietary { resetAndFetch() } }
    }
    var minRating: Double = 0 {
        didSet { if oldValue != minRating { resetAndFetch() } }
    }
    var featuredOnly = false {
        didSet { if oldValue != featuredOnly { resetAndFetch() } }
    }
    var sortBy: RestaurantSortOption = .popularity {
        didSet { if oldValue != sortBy { resetAndFetch() } }
    }
    var showOpenNowOnly = false {
        didSet { if oldValue != showOpenNowOnly { scheduleClientFilters() } }
    }
    var activePreset: RestaurantPreset? = nil

    /// Set while a bulk update (`clearFilters` / `applyPreset`) mutates many
    /// filter properties at once, so each individual `didSet` skips its own
    /// debounced work. The bulk operation fires exactly one fetch at the end
    /// (IOS-AUDIT-PERF-004).
    private var isBulkUpdating = false

    private var currentOffset = 0
    private let pageSize = Config.defaultPageSize
    private var fetchTask: Task<Void, Never>?
    private var clientFilterTask: Task<Void, Never>?

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
        async let locationsTask: () = loadLocations()
        _ = await (restaurantsTask, cuisinesTask, locationsTask)
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
            query.locations = selectedLocations.isEmpty ? nil : Array(selectedLocations)
            query.minRating = minRating > 0 ? minRating : nil
            query.isFeatured = featuredOnly ? true : nil
            query.sortBy = sortBy
            query.limit = pageSize
            query.offset = currentOffset

            let response = try await service.fetchRestaurants(query: query)
            guard !Task.isCancelled else { return }

            if reset {
                allRestaurants = response.restaurants
                await cache.set(restaurantsCacheKey(), value: response.restaurants)
                // Keep Spotlight in sync so restaurants show up in system search
                // (IOS-AUDIT-FEAT-026).
                let toIndex = response.restaurants
                Task { await SpotlightService.shared.indexRestaurants(toIndex) }
            } else {
                allRestaurants.append(contentsOf: response.restaurants)
            }
            // Apply client-side filters (open now, dietary) on a background
            // task so 100+ isOpenNow() calls + description string-matching
            // don't block the main thread during scroll.
            restaurants = await Self.applyClientSideOffMain(
                list: allRestaurants,
                openNow: showOpenNowOnly,
                dietary: selectedDietary
            )

            totalCount = response.totalCount
            hasMore = response.hasMore
            // Use the unfiltered fetch count for pagination so client-side
            // filters (Open Now, Dietary) don't cause duplicate pages.
            currentOffset = allRestaurants.count
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

    // MARK: - Cuisines & Locations

    private func loadCuisines() async {
        do {
            availableCuisines = try await service.fetchAvailableCuisines()
        } catch {
            availableCuisines = []
        }
    }

    func loadLocations() async {
        guard availableLocations.isEmpty else { return }
        do {
            availableLocations = try await service.fetchAvailableLocations()
        } catch {
            availableLocations = []
        }
    }

    // MARK: - Client-Side Filters (Open Now, Dietary)

    /// All fetched restaurants before client-side filters are applied.
    private var allRestaurants: [Restaurant] = []

    /// Debounce toggle bursts (user tapping Open Now on/off quickly) and run
    /// the actual filter off the main thread. Matches the 150ms target in
    /// IOS-AUDIT-2026-007 acceptance criteria.
    private func scheduleClientFilters() {
        guard !isBulkUpdating else { return }
        clientFilterTask?.cancel()
        clientFilterTask = Task { [weak self] in
            try? await Task.sleep(for: .milliseconds(150))
            guard !Task.isCancelled, let self else { return }
            let filtered = await Self.applyClientSideOffMain(
                list: self.allRestaurants,
                openNow: self.showOpenNowOnly,
                dietary: self.selectedDietary
            )
            guard !Task.isCancelled else { return }
            self.restaurants = filtered
        }
    }

    /// Runs `applyClientSide` inside a detached task so the isOpenNow() /
    /// string-matching loop never blocks the UI. Keeps the pure filter logic
    /// as a nonisolated static function so it's straightforward to unit test.
    private static func applyClientSideOffMain(
        list: [Restaurant],
        openNow: Bool,
        dietary: Set<String>
    ) async -> [Restaurant] {
        // Cheap no-op path: nothing to filter, stay on the caller's actor.
        if !openNow && dietary.isEmpty { return list }
        return await Task.detached(priority: .userInitiated) {
            applyClientSide(to: list, openNow: openNow, dietary: dietary)
        }.value
    }

    /// Shared pure-function filter. Runs on any actor; callers that care
    /// about perf should go through `applyClientSideOffMain`.
    nonisolated private static func applyClientSide(
        to list: [Restaurant],
        openNow: Bool,
        dietary: Set<String>
    ) -> [Restaurant] {
        var result = list
        if openNow {
            result = result.filter { $0.isOpenNow() == true }
        }
        if !dietary.isEmpty {
            result = result.filter { r in
                let haystack = [r.description, r.cuisine, r.name]
                    .compactMap { $0?.lowercased() }
                    .joined(separator: " ")
                return dietary.contains { diet in
                    keywords(for: diet).contains(where: haystack.contains)
                }
            }
        }
        return result
    }

    /// Keyword list mirroring the web app's dietary search fallback.
    nonisolated private static func keywords(for diet: String) -> [String] {
        switch diet {
        case "vegan":        return ["vegan"]
        case "vegetarian":   return ["vegetarian", "veggie"]
        case "gluten-free":  return ["gluten free", "gluten-free", "celiac"]
        case "keto":         return ["keto", "low carb"]
        case "halal":        return ["halal"]
        default:             return [diet.lowercased()]
        }
    }

    // MARK: - Sponsored Arrangement (IOS-AUDIT-PERF-010)

    /// Recomputes `arrangedRestaurants` off the render path whenever
    /// `restaurants` changes. Sponsored listings are pulled to the front;
    /// organic order is otherwise preserved.
    private func recomputeArrangedRestaurants() {
        arrangedRestaurants = SponsoredArranger.arrange(restaurants, isSponsored: { $0.isActivelySponsored })
    }

    // MARK: - Filter Summary

    var activeFilterCount: Int {
        var count = 0
        if !selectedCuisines.isEmpty { count += 1 }
        if !selectedPriceRanges.isEmpty { count += 1 }
        if !selectedLocations.isEmpty { count += 1 }
        if !selectedDietary.isEmpty { count += 1 }
        if minRating > 0 { count += 1 }
        if featuredOnly { count += 1 }
        if !searchText.isEmpty { count += 1 }
        if showOpenNowOnly { count += 1 }
        return count
    }

    func clearFilters() {
        // Coalesce the many property mutations into a single fetch
        // (IOS-AUDIT-PERF-004).
        isBulkUpdating = true
        selectedCuisines = []
        selectedPriceRanges = []
        selectedLocations = []
        selectedDietary = []
        minRating = 0
        featuredOnly = false
        searchText = ""
        sortBy = .popularity
        showOpenNowOnly = false
        activePreset = nil
        isBulkUpdating = false
        resetAndFetch()
    }

    // MARK: - Smart Presets

    /// Applies a bundled set of filters in one tap. Tapping the same preset
    /// again clears it. Changing any individual filter clears `activePreset`.
    func applyPreset(_ preset: RestaurantPreset) {
        if activePreset == preset {
            clearFilters()
            return
        }
        // Reset first so presets don't compound. Coalesce into one fetch
        // (IOS-AUDIT-PERF-004).
        isBulkUpdating = true
        selectedCuisines = []
        selectedPriceRanges = Set(preset.priceRanges)
        selectedLocations = []
        selectedDietary = Set(preset.dietary)
        minRating = preset.minRating
        featuredOnly = false
        showOpenNowOnly = preset.openNow
        sortBy = preset.sortBy
        activePreset = preset
        isBulkUpdating = false
        resetAndFetch()
    }

    private func resetAndFetch() {
        // Bulk updates (clearFilters / applyPreset) mutate many properties in
        // one go; suppress their per-property fetches and fire one at the end.
        guard !isBulkUpdating else { return }
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
        if !selectedLocations.isEmpty { parts.append("l-\(selectedLocations.sorted().joined(separator: ","))") }
        if minRating > 0 { parts.append("r-\(minRating)") }
        if featuredOnly { parts.append("f-1") }
        if !searchText.isEmpty { parts.append("q-\(searchText)") }
        parts.append("s-\(sortBy.rawValue)")
        return parts.joined(separator: "-")
    }
}
