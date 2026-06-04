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

    init(hub: ContentHub) { self.hub = hub }

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
        do {
            events = try await eventsService.fetchEventsByCategoryTerms(hub.eventTerms, limit: 20)
            return nil
        } catch {
            events = []
            return error.localizedDescription
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
