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

    // MARK: - Filters

    var searchText = "" {
        didSet { if oldValue != searchText { resetAndFetch() } }
    }
    var selectedCategory: EventCategory? {
        didSet { if oldValue != selectedCategory { resetAndFetch() } }
    }
    var selectedDatePreset: DateFilterPreset? {
        didSet { if oldValue != selectedDatePreset { resetAndFetch() } }
    }
    var showFeaturedOnly = false {
        didSet { if oldValue != showFeaturedOnly { resetAndFetch() } }
    }
    var selectedCities: Set<String> = [] {
        didSet { if oldValue != selectedCities { resetAndFetch() } }
    }
    /// Sort order for the events list. IOS-DISCOVER-2026-003.
    var sortBy: EventSortOption = .soonest {
        didSet { if oldValue != sortBy { resetAndFetch() } }
    }

    /// Currently applied smart preset, if any. Cleared when the user changes
    /// any individual filter manually.
    var activePreset: EventPreset? = nil

    // Premium filters (Insider+ only)
    var showFreeOnly = false {
        didSet { if oldValue != showFreeOnly { resetAndFetch() } }
    }
    var maxDistance: Double? {
        didSet { if oldValue != maxDistance { resetAndFetch() } }
    }
    var minRating: Double? {
        didSet { if oldValue != minRating { resetAndFetch() } }
    }

    /// Set while a bulk update (`clearFilters` / `applyPreset`) mutates many
    /// filter properties at once, so each individual `didSet` skips its own
    /// debounced fetch. The bulk operation fires exactly one `resetAndFetch()`
    /// at the end (IOS-AUDIT-PERF-004).
    private var isBulkUpdating = false

    // MARK: - Pagination

    private var currentOffset = 0
    /// Count of RAW server rows fetched so far. Pagination offset is driven by
    /// this — not `events.count` — so the client-side premium maxDistance filter
    /// dropping rows can't desync the server offset (repeat/skip events).
    private var rawFetchedCount = 0
    private let pageSize = Config.defaultPageSize
    private var fetchTask: Task<Void, Never>?

    private let service = EventsService.shared
    private let cache = QueryCache.shared

    // MARK: - Initial Load

    func loadInitialData() async {
        guard events.isEmpty else { return }

        // Serve cached data immediately for instant cold start
        let cacheKey = eventsCacheKey()
        let isOffline = !NetworkMonitor.shared.isConnected

        if let cached: [Event] = await cache.get(cacheKey, allowStale: isOffline) {
            events = applyPremiumFilters(cached)
            isLoading = false
        }

        if let cachedFeatured: [Event] = await cache.get("featured-events", allowStale: isOffline) {
            featuredEvents = cachedFeatured
        }

        // Then fetch fresh data in the background (skip if offline and we have cache)
        if isOffline && !events.isEmpty { return }

        await fetchEvents(reset: true)
        await fetchFeaturedEvents()
    }

    func refresh() async {
        // Pull-to-refresh always bypasses cache
        await fetchEvents(reset: true)
        await fetchFeaturedEvents()
    }

    // MARK: - Fetch Events

    func fetchEvents(reset: Bool = false) async {
        if reset {
            currentOffset = 0
            rawFetchedCount = 0
            // Only show spinner if we have no cached data
            if events.isEmpty { isLoading = true }
        } else {
            isLoadingMore = true
        }
        errorMessage = nil

        do {
            var query = EventsService.EventsQuery()
            query.searchText = searchText.isEmpty ? nil : searchText
            query.category = selectedCategory?.rawValue
            query.isFeatured = showFeaturedOnly ? true : nil
            query.cities = selectedCities.isEmpty ? nil : Array(selectedCities)
            query.freeOnly = showFreeOnly
            query.sortBy = sortBy
            query.limit = pageSize
            query.offset = currentOffset

            if let preset = selectedDatePreset {
                let range = preset.dateRange
                query.dateStart = range.start
                query.dateEnd = range.end
            }

            let response = try await service.fetchEvents(query: query)
            guard !Task.isCancelled else { return }

            // Apply premium filters client-side
            let filtered = applyPremiumFilters(response.events)

            if reset {
                events = filtered
                // Cache the first page for offline/cold-start use
                let cacheKey = eventsCacheKey()
                await cache.set(cacheKey, value: response.events)
                // Keep Spotlight in sync with what the user is browsing so events
                // are discoverable in system search (IOS-AUDIT-FEAT-026).
                let toIndex = response.events
                Task { await SpotlightService.shared.indexEvents(toIndex) }
            } else {
                events.append(contentsOf: filtered)
            }

            totalCount = response.totalCount
            hasMore = response.hasMore
            // Advance the offset by RAW rows fetched, not the filtered display
            // count, so the premium maxDistance filter can't shift the window.
            rawFetchedCount += response.events.count
            currentOffset = rawFetchedCount
        } catch {
            // If offline and we have cached data, don't overwrite with an error
            if events.isEmpty {
                errorMessage = error.localizedDescription
            }
        }

        isLoading = false
        isLoadingMore = false
    }

    // MARK: - Load More

    func loadMoreIfNeeded(currentItem: Event?) async {
        guard let currentItem,
              hasMore,
              !isLoadingMore,
              let index = events.firstIndex(where: { $0.id == currentItem.id }),
              index >= events.count - 5 else { return }

        await fetchEvents(reset: false)
    }

    // MARK: - Featured Events

    private func fetchFeaturedEvents() async {
        do {
            let featured = try await service.fetchFeaturedEvents()
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

    private func eventsCacheKey() -> String {
        var parts = ["events"]
        if let cat = selectedCategory { parts.append("cat-\(cat.rawValue)") }
        if let preset = selectedDatePreset { parts.append("date-\(preset.rawValue)") }
        if showFeaturedOnly { parts.append("featured") }
        if !searchText.isEmpty { parts.append("q-\(searchText)") }
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
    /// changes. Sponsored listings are pulled to the front; organic order is
    /// otherwise preserved.
    private func recomputeArrangedEvents() {
        arrangedEvents = SponsoredArranger.arrange(events, isSponsored: { $0.isActivelySponsored })
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
        fetchTask = Task {
            try? await Task.sleep(for: .milliseconds(300))
            guard !Task.isCancelled else { return }
            await fetchEvents(reset: true)
        }
    }
}
