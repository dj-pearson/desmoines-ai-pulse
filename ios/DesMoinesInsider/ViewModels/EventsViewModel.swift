import Foundation
import CoreLocation

/// ViewModel for the home/events feed. Handles fetching, filtering, and pagination.
@MainActor
@Observable
final class EventsViewModel {
    // MARK: - State

    private(set) var events: [Event] = [] {
        didSet { recomputeArrangedEvents() }
    }
    /// Sponsored-arranged view of `events`, cached so the arrangement
    /// (SponsoredArranger.arrange) runs only when `events` changes — not on
    /// every SwiftUI body pass (IOS-AUDIT-PERF-010).
    private(set) var arrangedEvents: [Event] = []
    private(set) var featuredEvents: [Event] = []
    private(set) var isLoading = false
    private(set) var isLoadingMore = false
    private(set) var hasMore = false
    private(set) var totalCount = 0
    private(set) var errorMessage: String?

    /// A filter change is fetching while the previous results are still on
    /// screen (IOS-DD-EVENTS-09). Distinct from isLoading, which means there is
    /// nothing to show yet.
    private(set) var isRefiltering = false
    /// The last reset failed while older rows were on screen, so what is shown
    /// may not match the chips. Cleared by the next successful reset.
    private(set) var lastFetchFailed = false
    /// At least one reset has finished, successfully or not. A rail uses it to
    /// tell "not loaded yet" from "loaded and empty" (IOS-DD-EVENTS-12).
    private(set) var hasLoadedOnce = false
    /// The rows are the fuzzy "did you mean" fallback for a search with no
    /// exact hits (IOS-DD-EVENTS-19).
    private(set) var isFuzzyFallback = false
    /// The rows came from the on-disk cache while offline and have not been
    /// replaced by a live fetch, so reconnecting should reload them.
    private(set) var servedFromStaleCache = false

    // MARK: - Filters
    //
    // Every filter except the sort clears `activePreset` when the user changes
    // it, so a preset chip never stays lit over filters it no longer describes
    // - and tapping it then re-applies instead of wiping everything
    // (IOS-DD-EVENTS-10). Bulk updates set the preset themselves.

    var searchText = "" {
        didSet { filterChanged(oldValue != searchText) }
    }
    var selectedCategory: EventCategory? {
        didSet { filterChanged(oldValue != selectedCategory) }
    }
    var selectedDatePreset: DateFilterPreset? {
        didSet { filterChanged(oldValue != selectedDatePreset) }
    }
    var showFeaturedOnly = false {
        didSet { filterChanged(oldValue != showFeaturedOnly) }
    }
    var selectedCities: Set<String> = [] {
        didSet { filterChanged(oldValue != selectedCities) }
    }
    /// Sort order for the events list. IOS-DISCOVER-2026-003. Not a filter, so
    /// it leaves the active preset alone.
    var sortBy: EventSortOption = .soonest {
        didSet { if oldValue != sortBy { resetAndFetch() } }
    }

    /// Currently applied smart preset, if any. Cleared when the user changes
    /// any individual filter manually.
    var activePreset: EventPreset? = nil

    // Premium filters (Insider+ only)
    var showFreeOnly = false {
        didSet { filterChanged(oldValue != showFreeOnly) }
    }
    var maxDistance: Double? {
        didSet { filterChanged(oldValue != maxDistance) }
    }
    var minRating: Double? {
        didSet { filterChanged(oldValue != minRating) }
    }

    /// Set while a bulk update (`clearFilters` / `applyPreset`) mutates many
    /// filter properties at once, so each individual `didSet` skips its own
    /// debounced fetch. The bulk operation fires exactly one `resetAndFetch()`
    /// at the end (IOS-AUDIT-PERF-004).
    private var isBulkUpdating = false

    private func filterChanged(_ changed: Bool) {
        guard changed else { return }
        if !isBulkUpdating { activePreset = nil }
        resetAndFetch()
    }

    // MARK: - Pagination

    /// Count of RAW server rows fetched so far. Pagination offset is driven by
    /// this — not `events.count` — so the client-side premium maxDistance filter
    /// dropping rows can't desync the server offset (repeat/skip events).
    private var rawFetchedCount = 0
    /// Rows in the first page, the only part the sponsored arrangement touches
    /// (IOS-DD-EVENTS-13).
    private var firstPageCount = 0
    private let pageSize = Config.defaultPageSize
    private var fetchTask: Task<Void, Never>?

    /// Bumped by every reset. A fetch that finds it changed when its await
    /// returns belongs to an older filter and throws its result away
    /// (IOS-DD-EVENTS-03).
    private var generation = 0
    /// The in-flight load-more, owned here so a reset can cancel it. It used to
    /// run in a per-row `.task` nothing could cancel, so a page fetched for the
    /// old filter appended under the new one.
    private var loadMoreTask: Task<Void, Never>?

    private let service: EventFeedProviding
    private let loadsFeatured: Bool
    private let cache = QueryCache.shared

    /// - Parameters:
    ///   - initialDatePreset: applied before the first load, without a fetch,
    ///     so a rail's VM starts on its own window instead of loading the
    ///     unfiltered feed first (IOS-DD-EVENTS-12).
    ///   - loadsFeatured: false for a rail's VM, which never shows the
    ///     featured rail and should not fetch it.
    init(
        service: EventFeedProviding = EventsService.shared,
        initialDatePreset: DateFilterPreset? = nil,
        loadsFeatured: Bool = true
    ) {
        self.service = service
        self.loadsFeatured = loadsFeatured
        // Bulk-guarded so, whether or not an observer runs during init, it
        // neither schedules a fetch nor touches the preset.
        isBulkUpdating = true
        selectedDatePreset = initialDatePreset
        isBulkUpdating = false
    }

    // MARK: - Initial Load

    func loadInitialData() async {
        guard events.isEmpty else { return }

        // Serve cached data immediately for instant cold start
        let cacheKey = eventsCacheKey()
        let isOffline = !NetworkMonitor.shared.isConnected

        if let cached: [Event] = await cache.get(cacheKey, allowStale: isOffline) {
            let filtered = applyPremiumFilters(cached)
            firstPageCount = filtered.count
            events = filtered
            isLoading = false
        }

        if loadsFeatured, let cachedFeatured: [Event] = await cache.get("featured-events", allowStale: isOffline) {
            featuredEvents = cachedFeatured
        }

        // Then fetch fresh data in the background (skip if offline and we have cache)
        if isOffline && !events.isEmpty {
            servedFromStaleCache = true
            hasLoadedOnce = true
            return
        }

        await fetchEvents(reset: true)
        if loadsFeatured { await fetchFeaturedEvents() }
    }

    func refresh() async {
        // A pending debounced fetch would land after this one and replace it.
        fetchTask?.cancel()
        // Pull-to-refresh always bypasses cache
        await fetchEvents(reset: true)
        if loadsFeatured { await fetchFeaturedEvents() }
    }

    // MARK: - Fetch Events

    func fetchEvents(reset: Bool = false) async {
        if reset {
            generation += 1
            loadMoreTask?.cancel()
            loadMoreTask = nil
            // The cancelled load-more no longer owns this flag (its generation
            // is stale), so clear it here.
            isLoadingMore = false
            // Only show the skeleton if there is nothing on screen.
            if events.isEmpty { isLoading = true } else { isRefiltering = true }
        } else {
            isLoadingMore = true
        }
        errorMessage = nil

        let gen = generation
        let offset = reset ? 0 : rawFetchedCount
        // Only the current generation may clear the flags; a stale fetch
        // leaves them to the one that replaced it. Covers every exit,
        // cancellation included - the old `guard !Task.isCancelled` returned
        // with isLoading still true.
        defer {
            if gen == generation {
                if reset {
                    isLoading = false
                    isRefiltering = false
                    hasLoadedOnce = true
                } else {
                    isLoadingMore = false
                }
            }
        }

        let query = currentQuery(offset: offset)
        let searchForFallback = searchText

        do {
            let response = try await service.fetchEvents(query: query)
            guard gen == generation else { return }

            // Apply premium filters client-side
            let filtered = applyPremiumFilters(response.events)

            if reset {
                // Nothing matched a search: offer the fuzzy "did you mean" rows
                // rather than a dead end (IOS-DD-EVENTS-19). Only for a bare
                // search, so a filter the user set is never silently dropped.
                if response.events.isEmpty,
                   searchForFallback.count >= 3,
                   activeFilterCount == 1,
                   let fuzzy = try? await service.fuzzySearchEvents(query: searchForFallback, limit: pageSize),
                   gen == generation,
                   !fuzzy.isEmpty {
                    isFuzzyFallback = true
                    firstPageCount = fuzzy.count
                    events = fuzzy
                    totalCount = fuzzy.count
                    hasMore = false
                    rawFetchedCount = fuzzy.count
                    lastFetchFailed = false
                    servedFromStaleCache = false
                    return
                }
                guard gen == generation else { return }

                isFuzzyFallback = false
                firstPageCount = filtered.count
                events = filtered
                lastFetchFailed = false
                servedFromStaleCache = false
            } else {
                // A row can shift pages between requests (a new event, an
                // edit); never show it twice. HomeView's ForEach is keyed on id.
                let existing = Set(events.map(\.id))
                events.append(contentsOf: filtered.filter { !existing.contains($0.id) })
            }

            totalCount = response.totalCount
            hasMore = response.hasMore
            // Advance by RAW rows fetched from the offset this request used, not
            // by +=: two overlapping requests used to both add, skipping a page.
            rawFetchedCount = offset + response.events.count

            if reset {
                // Cache the first page for offline/cold-start use. Last, so the
                // await cannot interleave with the state updates above.
                let toCache = response.events
                // Keep Spotlight in sync with what the user is browsing so events
                // are discoverable in system search (IOS-AUDIT-FEAT-026).
                Task { await SpotlightService.shared.indexEvents(toCache) }
                await cache.set(eventsCacheKey(), value: toCache)
            }
        } catch {
            guard gen == generation else { return }
            // A cancelled request is not an error the user did anything about.
            if Self.isCancellation(error) { return }
            // Always recorded now (IOS-DD-EVENTS-09). It used to be set only
            // when the list was empty, so the stale-data banner could never
            // show and a failed refilter left old rows under new chips silently.
            errorMessage = error.localizedDescription
            if reset && !events.isEmpty { lastFetchFailed = true }
        }
    }

    /// The query for the current filters.
    private func currentQuery(offset: Int) -> EventsService.EventsQuery {
        var query = EventsService.EventsQuery()
        query.searchText = searchText.isEmpty ? nil : searchText
        query.category = selectedCategory?.rawValue
        query.isFeatured = showFeaturedOnly ? true : nil
        query.cities = selectedCities.isEmpty ? nil : Array(selectedCities)
        query.freeOnly = showFreeOnly
        query.sortBy = sortBy
        query.limit = pageSize
        query.offset = offset

        if let preset = selectedDatePreset {
            let range = preset.dateRange
            query.dateStart = range.start
            query.dateEnd = range.end
        }
        return query
    }

    /// CancellationError, or URLSession's own cancellation.
    static func isCancellation(_ error: Error) -> Bool {
        if error is CancellationError { return true }
        if let urlError = error as? URLError, urlError.code == .cancelled { return true }
        return false
    }

    // MARK: - Load More

    /// Starts the next page when `currentItem` is within five rows of the end
    /// of what is rendered. Synchronous: the task is owned here so a reset can
    /// cancel it (IOS-DD-EVENTS-03). Indexes `arrangedEvents`, which is what
    /// HomeView renders, not `events`.
    func loadMoreIfNeeded(currentItem: Event?) {
        guard let currentItem,
              hasMore,
              !isLoadingMore,
              !isFuzzyFallback,
              let index = arrangedEvents.firstIndex(where: { $0.id == currentItem.id }),
              index >= arrangedEvents.count - 5 else { return }

        isLoadingMore = true
        loadMoreTask = Task { [weak self] in
            // Cancelled by a reset before it ran: fetching now would use the
            // new filters with the old list's offset.
            guard !Task.isCancelled else { return }
            await self?.fetchEvents(reset: false)
        }
    }

    // MARK: - Featured Events

    private func fetchFeaturedEvents() async {
        do {
            let featured = try await service.fetchFeaturedEvents(limit: 10)
            featuredEvents = featured
            await cache.set("featured-events", value: featured)
        } catch {
            // Keep existing cached featured events on failure
            if featuredEvents.isEmpty {
                featuredEvents = []
            }
        }
    }

    // MARK: - Cache Key

    /// Every filter that changes the rows is in the key (IOS-DD-EVENTS-08).
    /// Free, area and distance used to be missing, so "Free only" wrote under
    /// the unfiltered key and a cold start or offline launch served free
    /// events as the whole feed. The prefix moved to "events2" so entries
    /// written under the old key are never read.
    func eventsCacheKey() -> String {
        var parts = ["events2"]
        if let cat = selectedCategory { parts.append("cat-\(cat.rawValue)") }
        if let preset = selectedDatePreset { parts.append("date-\(preset.rawValue)") }
        if showFeaturedOnly { parts.append("featured") }
        if !searchText.isEmpty { parts.append("q-\(searchText)") }
        if showFreeOnly { parts.append("free") }
        if !selectedCities.isEmpty { parts.append("city-" + selectedCities.sorted().joined(separator: "|")) }
        if let maxDistance { parts.append("dist-\(maxDistance)") }
        parts.append("s-\(sortBy.rawValue)")
        return parts.joined(separator: "-")
    }

    // MARK: - Filter Management

    var activeFilterCount: Int {
        var count = 0
        if selectedCategory != nil { count += 1 }
        if selectedDatePreset != nil { count += 1 }
        if showFeaturedOnly { count += 1 }
        if !searchText.isEmpty { count += 1 }
        if showFreeOnly { count += 1 }
        if !selectedCities.isEmpty { count += 1 }
        if maxDistance != nil { count += 1 }
        if minRating != nil { count += 1 }
        return count
    }

    func clearFilters() {
        // Coalesce the many property mutations into a single debounced fetch
        // (IOS-AUDIT-PERF-004).
        isBulkUpdating = true
        selectedCategory = nil
        selectedDatePreset = nil
        showFeaturedOnly = false
        searchText = ""
        showFreeOnly = false
        selectedCities = []
        maxDistance = nil
        minRating = nil
        activePreset = nil
        isBulkUpdating = false
        resetAndFetch()
    }

    // MARK: - Smart Presets

    /// Applies a bundled set of event filters in one tap. Tapping the same
    /// preset again clears all filters.
    func applyPreset(_ preset: EventPreset) {
        if activePreset == preset {
            clearFilters()
            return
        }
        // Coalesce the bundled mutations into a single debounced fetch
        // (IOS-AUDIT-PERF-004).
        isBulkUpdating = true
        selectedCategory = preset.category
        selectedDatePreset = preset.datePreset
        showFeaturedOnly = preset.featured
        showFreeOnly = preset.free
        selectedCities = []
        maxDistance = nil
        minRating = nil
        searchText = ""
        activePreset = preset
        isBulkUpdating = false
        resetAndFetch()
    }

    // MARK: - Sponsored Arrangement (IOS-AUDIT-PERF-010)

    /// Recomputes `arrangedEvents` off the render path whenever `events`
    /// changes. Sponsored listings are pulled to the front of the FIRST page
    /// only; later pages keep server order, so a sponsored row arriving in
    /// page 3 can no longer jump to the top above the user's scroll position
    /// (IOS-DD-EVENTS-13).
    private func recomputeArrangedEvents() {
        let headCount = min(firstPageCount, events.count)
        let head = Array(events.prefix(headCount))
        arrangedEvents = SponsoredArranger.arrange(head, isSponsored: { $0.isActivelySponsored })
            + events.dropFirst(headCount)
    }

    // MARK: - Premium Filters (applied client-side)

    private func applyPremiumFilters(_ events: [Event]) -> [Event] {
        var result = events

        // `showFreeOnly` is now server-side; keep maxDistance + minRating client-side

        if let maxDistance, let userLocation = LocationService.shared.userLocation {
            result = result.filter { event in
                guard let coord = event.coordinate else { return true }
                let eventLocation = CLLocation(latitude: coord.latitude, longitude: coord.longitude)
                let distanceMiles = userLocation.distance(from: eventLocation) / 1609.34
                return distanceMiles <= maxDistance
            }
        }

        // minRating is available for future use when events have ratings
        return result
    }

    // MARK: - Debounced Search

    private func resetAndFetch() {
        // Bulk updates (clearFilters / applyPreset) mutate many properties in
        // one go; suppress their per-property fetches and fire one at the end.
        guard !isBulkUpdating else { return }
        fetchTask?.cancel()
        // Anything in flight was asked for the old filters: retire it now, not
        // 300ms from now, so it cannot land during the debounce. The fetch
        // below bumps the generation again and owns the flags from here.
        generation += 1
        loadMoreTask?.cancel()
        loadMoreTask = nil
        isLoadingMore = false
        fetchTask = Task { [weak self] in
            try? await Task.sleep(for: .milliseconds(300))
            guard !Task.isCancelled else { return }
            await self?.fetchEvents(reset: true)
        }
    }
}
