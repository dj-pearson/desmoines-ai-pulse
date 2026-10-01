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

    /// The last reset failed while older rows were on screen, so what is shown
    /// may not match the chips (IOS-DD-RESTAURANTS-02).
    private(set) var lastFetchFailed = false
    /// The rows are the fuzzy "did you mean" fallback for a search with no
    /// exact hits (IOS-DD-RESTAURANTS-13).
    private(set) var isFuzzyFallback = false
    /// Open Now is loading further pages by itself to find open rows
    /// (IOS-DD-RESTAURANTS-04).
    private(set) var isAutoFilling = false

    // MARK: - Filters
    //
    // Every filter except search and sort clears `activePreset` when the user
    // changes it, so a preset chip never stays lit over filters it no longer
    // describes, and tapping it then re-applies instead of wiping everything
    // (IOS-DD-RESTAURANTS-07, same rule as EventsViewModel). Bulk updates set
    // the preset themselves.

    var searchText = "" {
        didSet { if oldValue != searchText { resetAndFetch() } }
    }
    var selectedCuisines: Set<String> = [] {
        didSet { filterChanged(oldValue != selectedCuisines) }
    }
    var selectedPriceRanges: Set<String> = [] {
        didSet { filterChanged(oldValue != selectedPriceRanges) }
    }
    /// LocationArea raw values (IOS-DD-RESTAURANTS-05). An older value that is
    /// not an area still works as an exact `location` match.
    var selectedLocations: Set<String> = [] {
        didSet { filterChanged(oldValue != selectedLocations) }
    }
    /// Sent to the server as keyword or-groups (IOS-DD-RESTAURANTS-04).
    var selectedDietary: Set<String> = [] {
        didSet { filterChanged(oldValue != selectedDietary) }
    }
    var minRating: Double = 0 {
        didSet { filterChanged(oldValue != minRating) }
    }
    /// Only sponsored rows carry is_featured since 20260902000004; there is no
    /// UI for it any more, but Discover and old state still set it.
    var featuredOnly = false {
        didSet { filterChanged(oldValue != featuredOnly) }
    }
    /// Newly opened, opening soon and announced (IOS-DD-RESTAURANTS-07).
    var newOpeningsOnly = false {
        didSet { filterChanged(oldValue != newOpeningsOnly) }
    }
    var sortBy: RestaurantSortOption = .popularity {
        didSet { if oldValue != sortBy { resetAndFetch() } }
    }
    /// Time-dependent, so client-side; see `continueOpenNowFillIfNeeded`.
    var showOpenNowOnly = false {
        didSet {
            guard oldValue != showOpenNowOnly else { return }
            if !isBulkUpdating { activePreset = nil }
            autoFillPages = 0
            scheduleClientFilters()
        }
    }
    var activePreset: RestaurantPreset? = nil

    /// Set while a bulk update (`clearFilters` / `applyPreset`) mutates many
    /// filter properties at once, so each individual `didSet` skips its own
    /// debounced work. The bulk operation fires exactly one fetch at the end
    /// (IOS-AUDIT-PERF-004).
    private var isBulkUpdating = false

    private func filterChanged(_ changed: Bool) {
        guard changed else { return }
        if !isBulkUpdating { activePreset = nil }
        resetAndFetch()
    }

    static let newOpeningStatuses = ["newly_opened", "opening_soon", "announced"]

    // MARK: - Paging state

    /// Raw server rows fetched so far; the next page's offset. Open Now drops
    /// rows client-side, so it cannot be `restaurants.count`.
    private var rawFetchedCount = 0
    /// Ids of the first page, the only part the sponsored arrangement touches
    /// (IOS-DD-RESTAURANTS-02).
    private var firstPageIds: Set<String> = []
    /// One seed per list, picked on reset, so every page comes from the same
    /// rotation shuffle.
    private var rotationSeed: Int?
    /// Pages Open Now has loaded by itself since the last reset.
    private var autoFillPages = 0
    static let openNowFillTarget = 10
    static let maxAutoFillPages = 5

    private let pageSize = Config.defaultPageSize
    private var fetchTask: Task<Void, Never>?
    private var clientFilterTask: Task<Void, Never>?

    /// Bumped by every reset. A fetch that finds it changed when its await
    /// returns belongs to an older filter and throws its result away
    /// (IOS-DD-RESTAURANTS-02, the EventsViewModel pattern).
    private var generation = 0
    /// The in-flight load-more, owned here so a reset can cancel it. It ran in
    /// a per-row `.task` nothing could cancel, so a page fetched for the old
    /// filter appended under the new one.
    private var loadMoreTask: Task<Void, Never>?

    private let service: RestaurantFeedProviding
    private let cache = QueryCache.shared

    init(service: RestaurantFeedProviding = RestaurantsService.shared) {
        self.service = service
    }

    // MARK: - Load

    func loadInitialData() async {
        guard restaurants.isEmpty else { return }

        // Serve cached data immediately for instant cold start
        let isOffline = !NetworkMonitor.shared.isConnected

        if let cacheKey = restaurantsCacheKey(),
           let cached: [Restaurant] = await cache.get(cacheKey, allowStale: isOffline) {
            allRestaurants = cached
            firstPageIds = Set(cached.map(\.id))
            restaurants = Self.applyClientSide(to: cached, openNow: showOpenNowOnly)
            isLoading = false
        }

        if isOffline && !restaurants.isEmpty { return }

        async let restaurantsTask: () = fetchRestaurants(reset: true)
        async let cuisinesTask: () = loadCuisines()
        _ = await (restaurantsTask, cuisinesTask)
    }

    /// Returns whether the refresh succeeded, for the pull-to-refresh haptic.
    @discardableResult
    func refresh() async -> Bool {
        // A pending debounced fetch would land after this one and replace it.
        fetchTask?.cancel()
        await fetchRestaurants(reset: true)
        return errorMessage == nil
    }

    // MARK: - Fetch

    func fetchRestaurants(reset: Bool = false) async {
        if reset {
            generation += 1
            loadMoreTask?.cancel()
            loadMoreTask = nil
            // The cancelled load-more no longer owns this flag.
            isLoadingMore = false
            isAutoFilling = false
            autoFillPages = 0
            rotationSeed = RestaurantsService.rotationSeed(now: .now)
            if restaurants.isEmpty { isLoading = true }
        } else {
            isLoadingMore = true
        }
        errorMessage = nil

        let gen = generation
        let offset = reset ? 0 : rawFetchedCount
        // Only the current generation may clear the flags; a stale fetch
        // leaves them to the one that replaced it. Covers every exit,
        // cancellation included. Open Now's fill runs after the flags clear,
        // so the next page is not started while this one still owns them.
        defer {
            if gen == generation {
                if reset { isLoading = false } else { isLoadingMore = false }
                continueOpenNowFillIfNeeded()
            }
        }

        let query = currentQuery(offset: offset)
        let searchForFallback = searchText

        do {
            let response = try await service.fetchRestaurants(query: query)
            guard gen == generation else { return }

            if reset {
                // Nothing matched a bare search: offer the fuzzy "did you
                // mean" rows rather than a dead end (IOS-DD-RESTAURANTS-13).
                if response.restaurants.isEmpty,
                   searchForFallback.count >= 3,
                   activeFilterCount == 1,
                   let fuzzy = try? await service.fuzzySearchRestaurants(query: searchForFallback, limit: pageSize),
                   gen == generation,
                   !fuzzy.isEmpty {
                    isFuzzyFallback = true
                    lastFetchFailed = false
                    allRestaurants = fuzzy
                    firstPageIds = Set(fuzzy.map(\.id))
                    restaurants = fuzzy
                    totalCount = fuzzy.count
                    hasMore = false
                    rawFetchedCount = fuzzy.count
                    return
                }
                guard gen == generation else { return }
            }

            let newAll: [Restaurant]
            if reset {
                newAll = response.restaurants
            } else {
                // A row can shift pages between requests; never show it twice.
                let existing = Set(allRestaurants.map(\.id))
                newAll = allRestaurants + response.restaurants.filter { !existing.contains($0.id) }
            }
            // Open Now runs off the main thread so 100+ evaluations don't
            // block scrolling.
            let filtered = await Self.applyClientSideOffMain(list: newAll, openNow: showOpenNowOnly)
            guard gen == generation else { return }

            if reset {
                isFuzzyFallback = false
                lastFetchFailed = false
                firstPageIds = Set(response.restaurants.map(\.id))
            }
            allRestaurants = newAll
            restaurants = filtered
            totalCount = response.totalCount
            hasMore = response.hasMore
            // From the offset this request used, not +=: two overlapping
            // requests used to both add.
            rawFetchedCount = offset + response.restaurants.count

            if reset {
                let toCache = response.restaurants
                // Keep Spotlight in sync so restaurants show up in system search
                // (IOS-AUDIT-FEAT-026).
                Task { await SpotlightService.shared.indexRestaurants(toCache) }
                if let key = restaurantsCacheKey() {
                    await cache.set(key, value: toCache)
                }
            }
        } catch {
            guard gen == generation else { return }
            // A cancelled request is not an error the user did anything about.
            if EventsViewModel.isCancellation(error) { return }
            // Always recorded (IOS-DD-RESTAURANTS-02). It used to be set only
            // when the list was empty, so the stale banner could never show
            // and pull-to-refresh reported success on a failure.
            errorMessage = error.localizedDescription
            if reset && !restaurants.isEmpty { lastFetchFailed = true }
        }
    }

    /// The query for the current filters.
    private func currentQuery(offset: Int) -> RestaurantsService.RestaurantsQuery {
        var query = RestaurantsService.RestaurantsQuery()
        query.searchText = searchText.isEmpty ? nil : searchText
        query.cuisines = selectedCuisines.isEmpty ? nil : selectedCuisines.sorted()
        query.priceRanges = selectedPriceRanges.isEmpty ? nil : selectedPriceRanges.sorted()
        query.locations = selectedLocations.isEmpty ? nil : selectedLocations.sorted()
        query.dietary = selectedDietary.isEmpty ? nil : selectedDietary.sorted()
        query.minRating = minRating > 0 ? minRating : nil
        query.isFeatured = featuredOnly ? true : nil
        query.statuses = newOpeningsOnly ? Self.newOpeningStatuses : nil
        query.sortBy = sortBy
        query.limit = pageSize
        query.offset = offset
        query.rotationSeed = rotationSeed
        return query
    }

    // MARK: - Load More

    /// Starts the next page when `currentItem` is within five rows of the end
    /// of what is rendered. Synchronous: the task is owned here so a reset can
    /// cancel it. Indexes `arrangedRestaurants`, which is what the list renders.
    func loadMoreIfNeeded(currentItem: Restaurant?) {
        guard let currentItem,
              hasMore,
              !isLoadingMore,
              !isFuzzyFallback,
              let index = arrangedRestaurants.firstIndex(where: { $0.id == currentItem.id }),
              index >= arrangedRestaurants.count - 5 else { return }
        startLoadMore()
    }

    private func startLoadMore() {
        isLoadingMore = true
        loadMoreTask = Task { [weak self] in
            // Cancelled by a reset before it ran: fetching now would use the
            // new filters with the old list's offset.
            guard !Task.isCancelled else { return }
            await self?.fetchRestaurants(reset: false)
        }
    }

    /// Open Now filters loaded pages, and the next page loads only when a row
    /// near the end appears, so a list with few open rows stalled on "No
    /// Restaurants Found" while more pages existed. Pull up to
    /// `maxAutoFillPages` more pages until `openNowFillTarget` rows show.
    private func continueOpenNowFillIfNeeded() {
        guard showOpenNowOnly,
              !isFuzzyFallback,
              errorMessage == nil,
              hasMore,
              !isLoadingMore,
              restaurants.count < Self.openNowFillTarget,
              autoFillPages < Self.maxAutoFillPages else {
            isAutoFilling = false
            return
        }
        autoFillPages += 1
        isAutoFilling = true
        startLoadMore()
    }

    // MARK: - Cuisines

    private func loadCuisines() async {
        do {
            availableCuisines = try await service.fetchAvailableCuisines()
        } catch {
            availableCuisines = []
        }
    }

    // MARK: - Client-Side Filter (Open Now)

    /// All fetched restaurants before Open Now is applied.
    private var allRestaurants: [Restaurant] = []

    /// Re-run Open Now against the clock, e.g. when the app returns to the
    /// foreground: a list filtered at 9pm is wrong at 11pm.
    func reevaluateClientFilters() {
        scheduleClientFilters()
    }

    /// Debounce toggle bursts (user tapping Open Now on/off quickly) and run
    /// the actual filter off the main thread. Matches the 150ms target in
    /// IOS-AUDIT-2026-007 acceptance criteria.
    private func scheduleClientFilters() {
        guard !isBulkUpdating else { return }
        clientFilterTask?.cancel()
        let gen = generation
        clientFilterTask = Task { [weak self] in
            try? await Task.sleep(for: .milliseconds(150))
            guard !Task.isCancelled, let self, gen == self.generation else { return }
            let snapshot = self.allRestaurants
            var filtered = await Self.applyClientSideOffMain(list: snapshot, openNow: self.showOpenNowOnly)
            guard !Task.isCancelled, gen == self.generation else { return }
            // A page appended while the filter ran: filter what is there now,
            // not the snapshot, or the appended rows vanish.
            if self.allRestaurants.count != snapshot.count {
                filtered = Self.applyClientSide(to: self.allRestaurants, openNow: self.showOpenNowOnly)
            }
            self.restaurants = filtered
            self.continueOpenNowFillIfNeeded()
        }
    }

    /// Runs `applyClientSide` inside a detached task so the evaluation loop
    /// never blocks the UI.
    private static func applyClientSideOffMain(list: [Restaurant], openNow: Bool) async -> [Restaurant] {
        // Cheap no-op path: nothing to filter, stay on the caller's actor.
        if !openNow { return list }
        let now = Date()
        return await Task.detached(priority: .userInitiated) {
            applyClientSide(to: list, openNow: openNow, at: now)
        }.value
    }

    /// Shared pure-function filter. Dietary is server-side now
    /// (IOS-DD-RESTAURANTS-04); only Open Now, which depends on the clock,
    /// stays here.
    nonisolated static func applyClientSide(to list: [Restaurant], openNow: Bool, at date: Date = Date()) -> [Restaurant] {
        guard openNow else { return list }
        return list.filter { $0.isOpenNow(at: date) == true }
    }

    // MARK: - Sponsored Arrangement (IOS-AUDIT-PERF-010)

    /// Recomputes `arrangedRestaurants` whenever `restaurants` changes.
    /// Sponsored listings are pulled to the front of the FIRST page only;
    /// later pages keep server order, so a sponsored row arriving in page 3
    /// no longer jumps above the user's scroll position (IOS-DD-RESTAURANTS-02).
    /// Open Now keeps order, so the first page's rows are a prefix.
    private func recomputeArrangedRestaurants() {
        let headCount = restaurants.prefix { firstPageIds.contains($0.id) }.count
        let head = Array(restaurants.prefix(headCount))
        arrangedRestaurants = SponsoredArranger.arrange(head, isSponsored: { $0.isActivelySponsored })
            + restaurants.dropFirst(headCount)
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
        if newOpeningsOnly { count += 1 }
        if !searchText.isEmpty { count += 1 }
        if showOpenNowOnly { count += 1 }
        return count
    }

    /// The chip-bar count. `restaurants.count` was the loaded rows, not the
    /// matches; Open Now can only count what it has checked, hence the "+".
    var resultCountText: String {
        if showOpenNowOnly {
            let n = restaurants.count
            return hasMore ? "\(n)+ open now" : "\(n) open now"
        }
        return "\(totalCount) result\(totalCount == 1 ? "" : "s")"
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
        newOpeningsOnly = false
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
        // A cuisine preset uses only the cuisines that have rows.
        let cuisines = RestaurantPreset.available(cuisines: availableCuisines)
            .first { $0.preset == preset }?.cuisines ?? preset.cuisines
        // Reset first so presets don't compound. Coalesce into one fetch
        // (IOS-AUDIT-PERF-004).
        isBulkUpdating = true
        selectedCuisines = Set(cuisines)
        selectedPriceRanges = Set(preset.priceRanges)
        selectedLocations = []
        selectedDietary = Set(preset.dietary)
        minRating = preset.minRating
        featuredOnly = false
        newOpeningsOnly = preset.newOpeningsOnly
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
        // Anything in flight was asked for the old filters: retire it now, not
        // 300ms from now, so it cannot land during the debounce.
        generation += 1
        loadMoreTask?.cancel()
        loadMoreTask = nil
        isLoadingMore = false
        isAutoFilling = false
        fetchTask = Task { [weak self] in
            try? await Task.sleep(for: .milliseconds(300))
            guard !Task.isCancelled else { return }
            await self?.fetchRestaurants(reset: true)
        }
    }

    // MARK: - Cache Key

    private func restaurantsCacheKey() -> String? {
        Self.cacheKey(
            searchText: searchText,
            cuisines: selectedCuisines,
            priceRanges: selectedPriceRanges,
            locations: selectedLocations,
            dietary: selectedDietary,
            minRating: minRating,
            featuredOnly: featuredOnly,
            newOpeningsOnly: newOpeningsOnly,
            sortBy: sortBy
        )
    }

    /// Every filter that changes the server result is in the key. A search
    /// is never cached (IOS-DD-RESTAURANTS-14): the key becomes a filename,
    /// which is outside file protection, and searches are rarely repeated.
    /// The prefix moved to "restaurants2" because the row shape changed
    /// (hours_json), so rows cached before cannot fill Open Now.
    static func cacheKey(
        searchText: String,
        cuisines: Set<String>,
        priceRanges: Set<String>,
        locations: Set<String>,
        dietary: Set<String>,
        minRating: Double,
        featuredOnly: Bool,
        newOpeningsOnly: Bool,
        sortBy: RestaurantSortOption
    ) -> String? {
        guard searchText.isEmpty else { return nil }
        var parts = ["restaurants2"]
        if !cuisines.isEmpty { parts.append("c-\(cuisines.sorted().joined(separator: ","))") }
        if !priceRanges.isEmpty { parts.append("p-\(priceRanges.sorted().joined(separator: ","))") }
        if !locations.isEmpty { parts.append("l-\(locations.sorted().joined(separator: ","))") }
        if !dietary.isEmpty { parts.append("d-\(dietary.sorted().joined(separator: ","))") }
        if minRating > 0 { parts.append("r-\(minRating)") }
        if featuredOnly { parts.append("f-1") }
        if newOpeningsOnly { parts.append("n-1") }
        parts.append("s-\(sortBy.rawValue)")
        return parts.joined(separator: "-")
    }
}
