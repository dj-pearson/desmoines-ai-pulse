import Foundation

/// Unified search across events, restaurants, and attractions.
@MainActor
@Observable
final class SearchViewModel {
    // MARK: - State

    var searchText = "" {
        didSet { performSearch() }
    }

    private(set) var eventResults: [Event] = []
    private(set) var restaurantResults: [Restaurant] = []
    private(set) var attractionResults: [Attraction] = []
    private(set) var isSearching = false
    private(set) var hasSearched = false

    var selectedTab: SearchTab = .events

    enum SearchTab: String, CaseIterable, Identifiable {
        case events = "Events"
        case restaurants = "Restaurants"
        case attractions = "Attractions"

        var id: String { rawValue }

        var icon: String {
            switch self {
            case .events: return "calendar"
            case .restaurants: return "fork.knife"
            case .attractions: return "mappin.and.ellipse"
            }
        }
    }

    // MARK: - Search

    private var searchTask: Task<Void, Never>?

    private func performSearch() {
        searchTask?.cancel()

        guard !searchText.isEmpty else {
            clearResults()
            return
        }

        searchTask = Task {
            try? await Task.sleep(for: .milliseconds(300))
            guard !Task.isCancelled else { return }

            isSearching = true
            hasSearched = true

            async let events = searchEvents()
            async let restaurants = searchRestaurants()
            async let attractions = searchAttractions()

            let (e, r, a) = await (events, restaurants, attractions)
            eventResults = e
            restaurantResults = r
            attractionResults = a

            isSearching = false
        }
    }

    private func searchEvents() async -> [Event] {
        do {
            let response = try await EventsService.shared.fetchEvents(
                query: .init(searchText: searchText, limit: 20)
            )
            if response.events.isEmpty {
                return try await EventsService.shared.fuzzySearchEvents(query: searchText)
            }
            return response.events
        } catch {
            return []
        }
    }

    private func searchRestaurants() async -> [Restaurant] {
        do {
            let response = try await RestaurantsService.shared.fetchRestaurants(
                query: .init(searchText: searchText, limit: 20)
            )
            if response.restaurants.isEmpty {
                return try await RestaurantsService.shared.fuzzySearchRestaurants(query: searchText)
            }
            return response.restaurants
        } catch {
            return []
        }
    }

    private func searchAttractions() async -> [Attraction] {
        do {
            let response = try await AttractionsService.shared.fetchAttractions(
                query: .init(searchText: searchText, limit: 20)
            )
            return response.attractions
        } catch {
            return []
        }
    }

    // MARK: - Results

    var totalResults: Int {
        eventResults.count + restaurantResults.count + attractionResults.count
    }

    var isEmpty: Bool {
        hasSearched && totalResults == 0 && !isSearching
    }

    func clearResults() {
        eventResults = []
        restaurantResults = []
        attractionResults = []
        hasSearched = false
    }

    func clearSearch() {
        searchText = ""
        clearResults()
    }
}
