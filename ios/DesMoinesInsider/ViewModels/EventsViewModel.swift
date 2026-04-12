import Foundation
import CoreLocation

/// ViewModel for the home/events feed. Handles fetching, filtering, and pagination.
@MainActor
@Observable
final class EventsViewModel {
    // MARK: - State

    private(set) var events: [Event] = []
    private(set) var featuredEvents: [Event] = []
    private(set) var isLoading = false
    private(set) var isLoadingMore = false
    private(set) var hasMore = false
    private(set) var totalCount = 0
    private(set) var errorMessage: String?

    // MARK: - Filters

    var searchText = "" {
        didSet { resetAndFetch() }
    }
    var selectedCategory: EventCategory? {
        didSet { resetAndFetch() }
    }
    var selectedDatePreset: DateFilterPreset? {
        didSet { resetAndFetch() }
    }
    var showFeaturedOnly = false {
        didSet { resetAndFetch() }
    }
    var selectedCities: Set<String> = [] {
        didSet { resetAndFetch() }
    }

    /// Currently applied smart preset, if any. Cleared when the user changes
    /// any individual filter manually.
    var activePreset: EventPreset? = nil

    // Premium filters (Insider+ only)
    var showFreeOnly = false {
        didSet { resetAndFetch() }
    }
    var maxDistance: Double? {
        didSet { resetAndFetch() }
    }
    var minRating: Double? {
        didSet { resetAndFetch() }
    }

    // MARK: - Pagination

    private var currentOffset = 0
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
            } else {
                events.append(contentsOf: filtered)
            }

            totalCount = response.totalCount
            hasMore = response.hasMore
            currentOffset = events.count
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
        selectedCategory = nil
        selectedDatePreset = nil
        showFeaturedOnly = false
        searchText = ""
        showFreeOnly = false
        selectedCities = []
        maxDistance = nil
        minRating = nil
        activePreset = nil
    }

    // MARK: - Smart Presets

    /// Applies a bundled set of event filters in one tap. Tapping the same
    /// preset again clears all filters.
    func applyPreset(_ preset: EventPreset) {
        if activePreset == preset {
            clearFilters()
            return
        }
        selectedCategory = preset.category
        selectedDatePreset = preset.datePreset
        showFeaturedOnly = preset.featured
        showFreeOnly = preset.free
        selectedCities = []
        maxDistance = nil
        minRating = nil
        searchText = ""
        activePreset = preset
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
        fetchTask?.cancel()
        fetchTask = Task {
            try? await Task.sleep(for: .milliseconds(300))
            guard !Task.isCancelled else { return }
            await fetchEvents(reset: true)
        }
    }
}
