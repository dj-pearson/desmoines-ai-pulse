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

    // MARK: - Dependencies

    private let events: EventSearchProviding
    private let restaurants: RestaurantSearchProviding
    private let attractions: AttractionSearchProviding

    /// Defaults to the shared services, so no call site changes. The
    /// parameters exist so a test can hold a search open and observe what is
    /// on screen while it runs - which is the only way IOS-AUDIT-UX-054's
    /// "results stay visible" can be asserted (IOS-AUDIT-TEST-006).
    init(
        events: EventSearchProviding = EventsService.shared,
        restaurants: RestaurantSearchProviding = RestaurantsService.shared,
        attractions: AttractionSearchProviding = AttractionsService.shared
    ) {
        self.events = events
        self.restaurants = restaurants
        self.attractions = attractions
    }

    // MARK: - Search

    private var searchTask: Task<Void, Never>?

    /// Debounced entry point. Runs on every keystroke via `searchText.didSet`.
    private func performSearch() {
        searchTask?.cancel()

        guard !searchText.isEmpty else {
            clearResults()
            return
        }

        // Enter the loading state immediately so the 300ms debounce window
        // shows a spinner instead of a blank screen (IOS-AUDIT-UX-020).
        isSearching = true

        // Capture the query once so every sub-search AND the history record use
        // the SAME term - searchText can change mid-flight and would otherwise
        // record/search a different value than the user typed.
        let query = searchText

        searchTask = Task { [weak self] in
            try? await Task.sleep(for: .milliseconds(300))
            guard !Task.isCancelled else { return }
            await self?.runSearch(query)
        }
    }

    /// Re-run the current query immediately: no debounce, and the results
    /// already on screen stay there until the new ones replace them
    /// (IOS-AUDIT-UX-054).
    ///
    /// The old `refresh()` did `clearResults()` and then reassigned searchText
    /// to itself to retrigger the didSet. That blanked the list, dropped
    /// `hasSearched`, and then waited out the 300ms debounce before the first
    /// request even left - so a pull-to-refresh flashed the empty state for a
    /// third of a second and then flashed the results back.
    ///
    /// It also returned before any of that finished, because it was `async`
    /// only to satisfy `.refreshable`. The pull-to-refresh spinner therefore
    /// ended immediately and the list changed under the user a moment later.
    /// This one awaits the work.
    func performSearchNow() async {
        // Cancelling first is what keeps AC3 true: a refresh landing while a
        // keystroke search is in flight replaces it rather than racing it.
        searchTask?.cancel()

        let query = searchText
        guard !query.isEmpty else { return }

        isSearching = true
        // Written out rather than as a one-liner: a single-expression closure
        // over `self?.runSearch(...)` infers Task<()?, Never>, which does not
        // match searchTask.
        let task = Task { [weak self] in
            guard let self else { return }
            await self.runSearch(query)
        }
        searchTask = task
        await task.value
    }

    /// The search itself, shared by the debounced and immediate paths so the
    /// two cannot drift.
    private func runSearch(_ query: String) async {
        hasSearched = true

        async let events = searchEvents(query)
        async let restaurants = searchRestaurants(query)
        async let attractions = searchAttractions(query)

        let (e, r, a) = await (events, restaurants, attractions)
        // Results are assigned in one go, only if this search is still the
        // current one. Nothing is cleared beforehand, so the previous results
        // remain visible for the whole request.
        guard !Task.isCancelled else { return }
        eventResults = e
        restaurantResults = r
        attractionResults = a

        isSearching = false

        // Record successful searches to history
        if !e.isEmpty || !r.isEmpty || !a.isEmpty {
            SearchHistoryService.shared.record(query)
        }
    }

    private func searchEvents(_ query: String) async -> [Event] {
        do {
            let response = try await events.fetchEvents(
                query: .init(searchText: query, limit: 20)
            )
            if response.events.isEmpty {
                return try await events.fuzzySearchEvents(query: query)
            }
            return response.events
        } catch {
            return []
        }
    }

    private func searchRestaurants(_ query: String) async -> [Restaurant] {
        do {
            let response = try await restaurants.fetchRestaurants(
                query: .init(searchText: query, limit: 20)
            )
            if response.restaurants.isEmpty {
                return try await restaurants.fuzzySearchRestaurants(query: query)
            }
            return response.restaurants
        } catch {
            return []
        }
    }

    private func searchAttractions(_ query: String) async -> [Attraction] {
        do {
            let response = try await attractions.fetchAttractions(
                query: .init(searchText: query, limit: 20)
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
        // Clearing the query cancels any in-flight search, so leave the loading
        // state too (IOS-AUDIT-UX-020).
        isSearching = false
    }

    func clearSearch() {
        searchText = ""
        clearResults()
    }

    /// Pull-to-refresh. Kept as the name the views already call.
    func refresh() async {
        await performSearchNow()
    }
}
