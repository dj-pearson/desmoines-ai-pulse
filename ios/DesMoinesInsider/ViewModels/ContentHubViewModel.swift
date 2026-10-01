import Foundation

/// Loads the curated content for a Music/Sports/Outdoors hub (IOS-PARITY-006):
/// upcoming themed events, themed attractions, and featured dining. Events are
/// the spine; the attraction + dining rails fail soft so one empty rail never
/// blanks the hub.
///
/// Events cover the next two weeks, split into Tonight / This weekend / Later
/// (IOS-DD-BROWSE-23). A quiet fortnight falls back to the next few rows on
/// any date, titled "Next up", so a hub is never an empty shell.
@MainActor
@Observable
final class ContentHubViewModel {
    let hub: ContentHub

    private(set) var events: [Event] = []
    private(set) var attractions: [Attraction] = []
    private(set) var dining: [Restaurant] = []
    private(set) var isLoading = true
    private(set) var errorMessage: String?
    /// `events` came from the no-horizon fallback, not the next 14 days.
    private(set) var isFallback = false
    private(set) var tonight: [Event] = []
    private(set) var weekend: [Event] = []
    private(set) var later: [Event] = []
    /// A completed, non-cancelled load (IOS-DD-BROWSE-20). The guard used to
    /// be emptiness, so a hub with nothing in it refetched on every appearance.
    private(set) var hasLoadedOnce = false

    private let eventsService = EventsService.shared
    private let attractionsService = AttractionsService.shared
    private let restaurantsService = RestaurantsService.shared
    private let cache = QueryCache.shared

    static let horizonDays = 14

    init(hub: ContentHub) { self.hub = hub }

    /// Per-hub cache key for the events spine (offline cold start, IOS-COMPLY-004).
    private var eventsCacheKey: String { "hub-events-\(hub.id)" }

    var isEmpty: Bool { events.isEmpty && attractions.isEmpty && dining.isEmpty }

    func loadInitialData() async {
        guard !hasLoadedOnce else { return }
        await refresh()
    }

    func refresh() async {
        isLoading = true
        errorMessage = nil

        async let eventsResult = loadEvents()
        async let attractionsResult: Void = loadAttractions()
        async let diningResult: Void = loadDining()
        let (outcome, _, _) = await (eventsResult, attractionsResult, diningResult)

        isLoading = false
        switch outcome {
        case .cancelled:
            // Leaving the screen mid-load is not a failure and not a load.
            return
        case .done(let error):
            errorMessage = error
            hasLoadedOnce = true
        }
    }

    /// Re-runs the Tonight / weekend / later split over the rows in hand, for
    /// a return to the foreground: 5 PM's "later" is 8 PM's "tonight".
    func repartition(now: Date = Date()) {
        let parts = ContentHub.partition(events, now: now)
        tonight = parts.tonight
        weekend = parts.weekend
        later = parts.later
    }

    enum EventsOutcome {
        /// Finished; the error to show, if any.
        case done(String?)
        case cancelled
    }

    private func loadEvents() async -> EventsOutcome {
        let isOffline = !NetworkMonitor.shared.isConnected

        // Offline cold start: serve the cached events spine (IOS-COMPLY-004).
        if events.isEmpty,
           let cached: [Event] = await cache.get(eventsCacheKey, allowStale: isOffline) {
            setEvents(cached, fallback: false)
        }
        if isOffline && !events.isEmpty { return .done(nil) }

        do {
            let until = DesMoinesTime.calendar.date(byAdding: .day, value: Self.horizonDays, to: Date())
            var rows = try await fetchHubEvents(limit: 60, until: until)
            var fallback = false
            if rows.isEmpty {
                rows = try await fetchHubEvents(limit: 5, until: nil)
                fallback = true
            }
            guard !Task.isCancelled else { return .cancelled }
            setEvents(rows, fallback: fallback)
            await cache.set(eventsCacheKey, value: rows)
            return .done(nil)
        } catch {
            if Task.isCancelled || FavoritesService.isCancellation(error) { return .cancelled }
            // Keep cached events on failure; only error when truly blank.
            return .done(events.isEmpty ? error.localizedDescription : nil)
        }
    }

    /// The hub's or-group, falling back to the one without `is_indoor` when
    /// the column is missing (42703) so Outdoors still loads on a backend
    /// behind 20260908000001.
    private func fetchHubEvents(limit: Int, until: Date?) async throws -> [Event] {
        do {
            return try await eventsService.fetchEventsByOrGroup(hub.eventOrGroup, limit: limit, until: until)
        } catch let error where FavoritesService.errorCode(error) == "42703" {
            guard let legacy = hub.eventOrGroupWithoutIndoorFlag else { throw error }
            return try await eventsService.fetchEventsByOrGroup(legacy, limit: limit, until: until)
        }
    }

    private func setEvents(_ rows: [Event], fallback: Bool) {
        events = rows
        isFallback = fallback
        repartition()
    }

    /// A failed or cancelled rail keeps what it had.
    private func loadAttractions() async {
        let types = hub.attractionTypes.map(\.rawValue)
        guard let rows = try? await attractionsService.fetchAttractions(types: types, limit: 12),
              !Task.isCancelled else { return }
        attractions = rows
    }

    private func loadDining() async {
        let query = RestaurantsService.RestaurantsQuery(isFeatured: true, limit: 10)
        guard let response = try? await restaurantsService.fetchRestaurants(query: query),
              !Task.isCancelled else { return }
        dining = response.restaurants
    }
}
