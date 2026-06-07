import Foundation

/// Loads the curated content for a Music/Sports/Outdoors hub (IOS-PARITY-006):
/// upcoming themed events, themed attractions, and featured dining. Events are
/// the spine; the attraction + dining rails fail soft so one empty rail never
/// blanks the hub.
@MainActor
@Observable
final class ContentHubViewModel {
    let hub: ContentHub

    private(set) var events: [Event] = []
    private(set) var attractions: [Attraction] = []
    private(set) var dining: [Restaurant] = []
    private(set) var isLoading = true
    private(set) var errorMessage: String?

    private let eventsService = EventsService.shared
    private let attractionsService = AttractionsService.shared
    private let restaurantsService = RestaurantsService.shared
    private let cache = QueryCache.shared

    init(hub: ContentHub) { self.hub = hub }

    /// Per-hub cache key for the events spine (offline cold start, IOS-COMPLY-004).
    private var eventsCacheKey: String { "hub-events-\(hub.id)" }

    var isEmpty: Bool { events.isEmpty && attractions.isEmpty && dining.isEmpty }

    func loadInitialData() async {
        guard isEmpty else { return }
        await refresh()
    }

    func refresh() async {
        isLoading = true
        errorMessage = nil

        async let eventsResult = loadEvents()
        async let attractionsResult = loadAttractions()
        async let diningResult = loadDining()
        let (eventsErr, _, _) = await (eventsResult, attractionsResult, diningResult)

        errorMessage = eventsErr
        isLoading = false
    }

    private func loadEvents() async -> String? {
        let isOffline = !NetworkMonitor.shared.isConnected

        // Offline cold start: serve the cached events spine (IOS-COMPLY-004).
        if events.isEmpty,
           let cached: [Event] = await cache.get(eventsCacheKey, allowStale: isOffline) {
            events = cached
        }
        if isOffline && !events.isEmpty { return nil }

        do {
            events = try await eventsService.fetchEventsByCategoryTerms(hub.eventTerms, limit: 20)
            await cache.set(eventsCacheKey, value: events)
            return nil
        } catch {
            // Keep cached events on failure; only error when truly blank.
            return events.isEmpty ? error.localizedDescription : nil
        }
    }

    private func loadAttractions() async {
        let types = hub.attractionTypes.map(\.rawValue)
        attractions = (try? await attractionsService.fetchAttractions(types: types, limit: 12)) ?? []
    }

    private func loadDining() async {
        let query = RestaurantsService.RestaurantsQuery(isFeatured: true, limit: 10)
        dining = (try? await restaurantsService.fetchRestaurants(query: query))?.restaurants ?? []
    }
}
