import XCTest
@testable import DesMoinesInsider

/// IOS-AUDIT-UX-054, testable via IOS-AUDIT-TEST-006's seam.
///
/// The claim being checked is about an intermediate state - that results stay on
/// screen WHILE a refresh runs. That cannot be observed unless the test can hold
/// the fetch open, which is exactly what the injected providers allow.
@MainActor
final class SearchRefreshTests: XCTestCase {

    /// A provider the test can hold open at a chosen point.
    private final class FakeSearch: EventSearchProviding, RestaurantSearchProviding,
                                    AttractionSearchProviding, @unchecked Sendable {
        var events: [Event] = []
        private(set) var eventFetchCount = 0

        /// When set, fetchEvents waits on it before returning.
        var gate: Gate?

        func fetchEvents(query: EventsService.EventsQuery) async throws -> EventsService.EventsResponse {
            eventFetchCount += 1
            await gate?.wait()
            return .init(events: events, totalCount: events.count, hasMore: false)
        }

        func fuzzySearchEvents(query: String, limit: Int) async throws -> [Event] { [] }

        func fetchRestaurants(
            query: RestaurantsService.RestaurantsQuery
        ) async throws -> RestaurantsService.RestaurantsResponse {
            .init(restaurants: [], totalCount: 0, hasMore: false)
        }

        func fuzzySearchRestaurants(query: String, limit: Int) async throws -> [Restaurant] { [] }

        func fetchAttractions(
            query: AttractionsService.AttractionsQuery
        ) async throws -> AttractionsService.AttractionsResponse {
            .init(attractions: [], totalCount: 0, hasMore: false)
        }
    }

    @MainActor
    private final class Gate {
        private var continuation: CheckedContinuation<Void, Never>?
        private var opened = false

        func wait() async {
            if opened { return }
            await withCheckedContinuation { continuation = $0 }
        }

        func open() {
            opened = true
            continuation?.resume()
            continuation = nil
        }
    }

    private func event(_ id: String) -> Event {
        let json = "{\"id\":\"\(id)\",\"title\":\"Event \(id)\",\"date\":\"2026-09-01\"}"
        // swiftlint:disable:next force_try
        return try! JSONDecoder().decode(Event.self, from: Data(json.utf8))
    }

    /// Types a query and waits out the 300ms debounce.
    private func seedResults(_ vm: SearchViewModel) async {
        vm.searchText = "jazz"
        try? await Task.sleep(for: .milliseconds(450))
    }

    // MARK: - The behaviour the story is about

    func testResultsStayVisibleWhileARefreshRuns() async {
        let fake = FakeSearch()
        fake.events = [event("1"), event("2")]
        let vm = SearchViewModel(events: fake, restaurants: fake, attractions: fake)
        await seedResults(vm)
        XCTAssertEqual(vm.eventResults.count, 2, "precondition: the first search populated")

        // Hold the refresh open and look at the screen mid-flight.
        let gate = Gate()
        fake.gate = gate
        let refresh = Task { await vm.refresh() }
        await Task.yield()

        XCTAssertEqual(vm.eventResults.count, 2, "the old results must still be on screen")
        XCTAssertTrue(vm.hasSearched, "clearResults would have dropped this too")

        gate.open()
        await refresh.value
        XCTAssertEqual(vm.eventResults.count, 2)
    }

    func testRefreshActuallyRefetches() async {
        // The opposite failure: keeping results visible by not searching at all.
        let fake = FakeSearch()
        fake.events = [event("1")]
        let vm = SearchViewModel(events: fake, restaurants: fake, attractions: fake)
        await seedResults(vm)
        let afterFirst = fake.eventFetchCount

        await vm.refresh()

        XCTAssertEqual(fake.eventFetchCount, afterFirst + 1)
    }

    func testRefreshPicksUpChangedResults() async {
        let fake = FakeSearch()
        fake.events = [event("1")]
        let vm = SearchViewModel(events: fake, restaurants: fake, attractions: fake)
        await seedResults(vm)

        fake.events = [event("1"), event("2"), event("3")]
        await vm.refresh()

        XCTAssertEqual(vm.eventResults.count, 3)
    }

    func testRefreshWithNoQueryDoesNothing() async {
        let fake = FakeSearch()
        let vm = SearchViewModel(events: fake, restaurants: fake, attractions: fake)

        await vm.refresh()

        XCTAssertEqual(fake.eventFetchCount, 0)
    }

    func testRefreshAwaitsTheSearchRatherThanReturningEarly() async {
        // The old refresh() was async only to satisfy .refreshable and returned
        // immediately, so the pull-to-refresh spinner ended before any request
        // finished and the list changed under the user afterwards.
        let fake = FakeSearch()
        fake.events = [event("1")]
        let vm = SearchViewModel(events: fake, restaurants: fake, attractions: fake)
        await seedResults(vm)

        fake.events = [event("1"), event("2")]
        await vm.refresh()

        XCTAssertEqual(vm.eventResults.count, 2, "results must be in place by the time refresh returns")
    }
}
