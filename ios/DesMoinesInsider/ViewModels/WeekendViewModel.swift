import Foundation

/// ViewModel for the "This Weekend" guide (IOS-PARITY-004). Computes the Fri–Sun
/// window, fetches the weekend's events grouped by day, and pulls featured
/// dining + attractions picks — the same cross-type curation as web /weekend.
@MainActor
@Observable
final class WeekendViewModel {
    private(set) var window: WeekendWindow = .current()
    private(set) var eventsByDay: [WeekendWindow.Day: [Event]] = [:]
    private(set) var featuredRestaurants: [Restaurant] = []
    private(set) var featuredAttractions: [Attraction] = []
    private(set) var isLoading = true
    private(set) var errorMessage: String?

    private let events = EventsService.shared
    private let restaurants = RestaurantsService.shared
    private let attractions = AttractionsService.shared
    private let cache = QueryCache.shared
    private static let eventsCacheKey = "weekend-events"

    /// Total events across the weekend (for the header subtitle + empty check).
    var totalEvents: Int { eventsByDay.values.reduce(0) { $0 + $1.count } }

    var isEmpty: Bool {
        totalEvents == 0 && featuredRestaurants.isEmpty && featuredAttractions.isEmpty
    }

    /// Days that actually have events, in Fri→Sun order.
    var populatedDays: [WeekendWindow.Day] {
        WeekendWindow.Day.allCases.filter { !(eventsByDay[$0]?.isEmpty ?? true) }
    }

    func loadInitialData() async {
        guard eventsByDay.isEmpty, featuredRestaurants.isEmpty, featuredAttractions.isEmpty else { return }
        await refresh()
    }

    func refresh() async {
        isLoading = true
        errorMessage = nil
        // Recompute the window so the screen "refreshes by current week".
        window = .current()

        async let eventsResult = loadEvents()
        async let restaurantsResult = loadFeaturedRestaurants()
        async let attractionsResult = loadFeaturedAttractions()
        let (eventsErr, _, _) = await (eventsResult, restaurantsResult, attractionsResult)

        // Only the events query is fatal for the screen; the featured rails fail
        // soft (a missing rail shouldn't blank the whole guide).
        errorMessage = eventsErr
        isLoading = false
    }

    /// Returns an error message on failure (events are the core of the screen).
    private func loadEvents() async -> String? {
        let isOffline = !NetworkMonitor.shared.isConnected

        // Offline cold start: regroup the last cached weekend events (IOS-COMPLY-004).
        if eventsByDay.isEmpty,
           let cached: [Event] = await cache.get(Self.eventsCacheKey, allowStale: isOffline) {
            group(cached)
        }
        if isOffline && !eventsByDay.isEmpty { return nil }

        do {
            let all = try await events.fetchEventsInRange(start: window.fridayStart, end: window.mondayStart)
            group(all)
            await cache.set(Self.eventsCacheKey, value: all)
            return nil
        } catch {
            // Keep any cached grouping; only surface the error on a true blank.
            return eventsByDay.isEmpty ? error.localizedDescription : nil
        }
    }

    /// Buckets events into the Fri→Sun day map for the current window.
    private func group(_ all: [Event]) {
        var grouped: [WeekendWindow.Day: [Event]] = [:]
        for event in all {
            guard let date = event.parsedDate, let day = window.day(for: date) else { continue }
            grouped[day, default: []].append(event)
        }
        eventsByDay = grouped
    }

    private func loadFeaturedRestaurants() async {
        let query = RestaurantsService.RestaurantsQuery(isFeatured: true, limit: 10)
        if let response = try? await restaurants.fetchRestaurants(query: query) {
            featuredRestaurants = response.restaurants
        } else {
            featuredRestaurants = []
        }
    }

    private func loadFeaturedAttractions() async {
        let query = AttractionsService.AttractionsQuery(isFeatured: true, limit: 10)
        if let response = try? await attractions.fetchAttractions(query: query) {
            featuredAttractions = response.attractions
        } else {
            featuredAttractions = []
        }
    }
}
