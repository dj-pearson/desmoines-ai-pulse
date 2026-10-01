import Foundation

/// ViewModel for the "This Weekend" guide (IOS-PARITY-004). Computes the Fri–Sun
/// window in Central time, fetches the weekend's events grouped by day, and
/// pulls featured dining + attractions picks — the same cross-type curation as
/// web /weekend. The guide's sections (picks, free, family) are derived from
/// the rows in hand by `WeekendGuide` (IOS-DD-BROWSE-06).
@MainActor
@Observable
final class WeekendViewModel {
    /// Central time, explicitly (IOS-DD-BROWSE-01), although the default is
    /// Central too.
    private(set) var window: WeekendWindow = .current(calendar: DesMoinesTime.calendar)
    private(set) var eventsByDay: [WeekendWindow.Day: [Event]] = [:]
    /// Runs that started before Friday and are still on (IOS-DD-BROWSE-04).
    private(set) var allWeekend: [Event] = []
    /// The fetch hit its row limit, so the count is a floor.
    private(set) var isTruncated = false
    private(set) var featuredRestaurants: [Restaurant] = []
    private(set) var featuredAttractions: [Attraction] = []
    private(set) var isLoading = true
    private(set) var errorMessage: String?

    private let events = EventsService.shared
    private let restaurants = RestaurantsService.shared
    private let attractions = AttractionsService.shared
    private let cache = QueryCache.shared

    /// How the events load ended. Cancellation is its own case so it is never
    /// shown as an error (IOS-DD-BROWSE-03).
    enum LoadOutcome: Equatable {
        case ok
        case failed(String)
        case cancelled
    }

    static let offlineMessage = "You're offline. This weekend's guide will load when you reconnect."

    /// One cache entry per weekend (IOS-DD-BROWSE-02). The single
    /// "weekend-events" key served last weekend's rows under this weekend's
    /// dates on the offline and error paths.
    nonisolated static func cacheKey(for w: WeekendWindow) -> String {
        let parts = DesMoinesTime.calendar.dateComponents([.year, .month, .day], from: w.fridayStart)
        return String(format: "weekend-events-%04d-%02d-%02d", parts.year ?? 0, parts.month ?? 0, parts.day ?? 0)
    }

    /// Total events across the weekend (for the header subtitle + empty check).
    var totalEvents: Int { eventsByDay.values.reduce(0) { $0 + $1.count } + allWeekend.count }

    var isEmpty: Bool {
        totalEvents == 0 && featuredRestaurants.isEmpty && featuredAttractions.isEmpty
    }

    /// Days that actually have events, in Fri→Sun order.
    var populatedDays: [WeekendWindow.Day] {
        WeekendWindow.Day.allCases.filter { !(eventsByDay[$0]?.isEmpty ?? true) }
    }

    /// Every row once: the running ones, then Friday to Sunday.
    var allEvents: [Event] {
        allWeekend + WeekendWindow.Day.allCases.flatMap { eventsByDay[$0] ?? [] }
    }

    var picks: [Event] { WeekendGuide.picks(allEvents, now: Date()) }
    var freeEvents: [Event] { WeekendGuide.free(allEvents, now: Date()) }
    var familyEvents: [Event] { WeekendGuide.family(allEvents, now: Date()) }

    /// Populated days split into what is still ahead and what is behind us.
    var dayOrder: (upcoming: [WeekendWindow.Day], past: [WeekendWindow.Day]) {
        let order = WeekendGuide.orderedDays(window: window, now: Date())
        let populated = Set(populatedDays)
        return (order.upcoming.filter { populated.contains($0) }, order.past.filter { populated.contains($0) })
    }

    /// A day's rows with the finished ones moved to the end.
    func dayEvents(_ day: WeekendWindow.Day) -> [Event] {
        WeekendGuide.sortForToday(eventsByDay[day] ?? [], now: Date())
    }

    /// Whether a load has completed, successfully or not.
    ///
    /// Emptiness cannot answer that question (IOS-AUDIT-UX-059). A weekend with
    /// genuinely no events looks exactly like a weekend that has not loaded, so
    /// loadInitialData re-ran the whole fetch on every appearance for anyone
    /// whose weekend happened to be empty - and the empty state could not tell
    /// the two apart either. Set when a load finishes, not on entry: a
    /// cancelled first load has not been attempted (IOS-DD-BROWSE-03).
    private(set) var hasLoadedOnce = false

    /// Loads once, and again whenever the weekend has moved on since the last
    /// load (IOS-DD-BROWSE-02): a view model kept alive on the Home stack from
    /// Sunday to Friday used to keep showing last weekend.
    func loadInitialData() async {
        let current = WeekendWindow.current(calendar: DesMoinesTime.calendar)
        guard !hasLoadedOnce || current != window else { return }
        await refresh()
    }

    func refresh() async {
        isLoading = true
        errorMessage = nil
        // Recompute the window so the screen "refreshes by current week". A
        // new weekend starts from nothing, so neither the offline nor the
        // error path can show rows from another weekend.
        let current = WeekendWindow.current(calendar: DesMoinesTime.calendar)
        if current != window {
            window = current
            eventsByDay = [:]
            allWeekend = []
            isTruncated = false
        }

        async let eventsResult = loadEvents()
        async let restaurantsResult: Void = loadFeaturedRestaurants()
        async let attractionsResult: Void = loadFeaturedAttractions()
        let (outcome, _, _) = await (eventsResult, restaurantsResult, attractionsResult)

        // Only the events query is fatal for the screen; the featured rails fail
        // soft (a missing rail shouldn't blank the whole guide).
        switch outcome {
        case .cancelled:
            // Leaving the screen mid-load is not a failure; the next
            // appearance loads again.
            hasLoadedOnce = false
            isLoading = false
            return
        case .ok:
            errorMessage = nil
        case .failed(let message):
            errorMessage = message
        }
        hasLoadedOnce = true
        isLoading = false
    }

    private func loadEvents() async -> LoadOutcome {
        let isOffline = !NetworkMonitor.shared.isConnected
        let target = window
        let key = Self.cacheKey(for: target)

        // Offline cold start: regroup this weekend's cached events (IOS-COMPLY-004).
        if totalEvents == 0,
           let cached: [Event] = await cache.get(key, allowStale: isOffline),
           target == window {
            apply(cached, truncated: false)
        }
        if isOffline && totalEvents > 0 { return .ok }

        do {
            let result = try await events.fetchWeekendEvents(window: target)
            // Superseded by a newer weekend, or the screen went away.
            guard !Task.isCancelled, target == window else { return .cancelled }
            apply(result.events, truncated: result.truncated)
            await cache.set(key, value: result.events)
            return .ok
        } catch {
            if Task.isCancelled || FavoritesService.isCancellation(error) { return .cancelled }
            // Keep any cached grouping; only surface the error on a true blank.
            guard totalEvents == 0 else { return .ok }
            return .failed(isOffline ? Self.offlineMessage : error.localizedDescription)
        }
    }

    /// Buckets events into the day map and the all-weekend list for the
    /// current window (IOS-DD-BROWSE-04).
    private func apply(_ all: [Event], truncated: Bool) {
        let buckets = WeekendGuide.bucket(all, window: window)
        eventsByDay = buckets.byDay
        allWeekend = buckets.allWeekend
        isTruncated = truncated
    }

    /// A failed rail keeps what it had; a cancelled one writes nothing.
    private func loadFeaturedRestaurants() async {
        let query = RestaurantsService.RestaurantsQuery(isFeatured: true, limit: 10)
        guard let response = try? await restaurants.fetchRestaurants(query: query),
              !Task.isCancelled else { return }
        featuredRestaurants = response.restaurants
    }

    private func loadFeaturedAttractions() async {
        let query = AttractionsService.AttractionsQuery(isFeatured: true, limit: 10)
        guard let response = try? await attractions.fetchAttractions(query: query),
              !Task.isCancelled else { return }
        featuredAttractions = response.attractions
    }
}
