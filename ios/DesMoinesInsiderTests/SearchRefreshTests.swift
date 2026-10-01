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
        var restaurants: [Restaurant] = []
        var attractions: [Attraction] = []
        var fuzzyEvents: [Event] = []
        var eventsHasMore = false
        var eventError: Error?
        var restaurantError: Error?
        var attractionError: Error?
        private(set) var eventFetchCount = 0
        private(set) var lastEventsQuery: EventsService.EventsQuery?

        /// When set, fetchEvents waits on it before returning.
        var gate: Gate?

        func fetchEvents(query: EventsService.EventsQuery) async throws -> EventsService.EventsResponse {
            eventFetchCount += 1
            lastEventsQuery = query
            await gate?.wait()
            if let eventError { throw eventError }
            return .init(events: events, totalCount: events.count, hasMore: eventsHasMore)
        }

        func fuzzySearchEvents(query: String, limit: Int) async throws -> [Event] { fuzzyEvents }

        func fetchRestaurants(
            query: RestaurantsService.RestaurantsQuery
        ) async throws -> RestaurantsService.RestaurantsResponse {
            if let restaurantError { throw restaurantError }
            return .init(restaurants: restaurants, totalCount: restaurants.count, hasMore: false)
        }

        func fuzzySearchRestaurants(query: String, limit: Int) async throws -> [Restaurant] { [] }

        func fetchAttractions(
            query: AttractionsService.AttractionsQuery
        ) async throws -> AttractionsService.AttractionsResponse {
            if let attractionError { throw attractionError }
            return .init(attractions: attractions, totalCount: attractions.count, hasMore: false)
        }
    }

    private struct Boom: Error {}

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

    // MARK: - Failure is not "No Results" (IOS-DD-SEARCH-03)

    private func failing(_ fake: FakeSearch) {
        fake.eventError = Boom()
        fake.restaurantError = Boom()
        fake.attractionError = Boom()
    }

    func testFailureIsNotReportedAsNoResults() async {
        let fake = FakeSearch()
        failing(fake)
        let vm = SearchViewModel(events: fake, restaurants: fake, attractions: fake)
        vm.searchText = "jazz"
        await vm.performSearchNow()
        XCTAssertFalse(vm.isEmpty)
        XCTAssertTrue(vm.allFailed)
    }

    func testPartialFailureMarksOnlyThatTab() async {
        let fake = FakeSearch()
        fake.eventError = Boom()
        fake.restaurants = [Restaurant(id: "r1", name: "Jazz Bistro")]
        let vm = SearchViewModel(events: fake, restaurants: fake, attractions: fake)
        vm.searchText = "jazz"
        await vm.performSearchNow()
        XCTAssertEqual(vm.failedTabs, [.events])
        XCTAssertEqual(vm.restaurantResults.count, 1)
        XCTAssertFalse(vm.allFailed)
    }

    func testWhitespaceQueryDoesNotSearch() async {
        let fake = FakeSearch()
        let vm = SearchViewModel(events: fake, restaurants: fake, attractions: fake)
        vm.searchText = "   "
        try? await Task.sleep(for: .milliseconds(400))
        XCTAssertEqual(fake.eventFetchCount, 0)
        XCTAssertFalse(vm.hasSearched)
    }

    func testFailedRefreshKeepsPreviousResults() async {
        let fake = FakeSearch()
        fake.events = [event("1"), event("2")]
        let vm = SearchViewModel(events: fake, restaurants: fake, attractions: fake)
        await seedResults(vm)
        XCTAssertEqual(vm.eventResults.count, 2)

        failing(fake)
        await vm.refresh()
        XCTAssertEqual(vm.eventResults.count, 2, "an outage must not blank what was on screen")
        XCTAssertTrue(vm.allFailed)
    }

    // MARK: - History on intent (IOS-DD-SEARCH-04)

    func testSearchAloneDoesNotRecordHistory() async {
        SearchHistoryService.shared.clearAll()
        defer { SearchHistoryService.shared.clearAll() }
        let fake = FakeSearch()
        fake.events = [event("1")]
        let vm = SearchViewModel(events: fake, restaurants: fake, attractions: fake)
        vm.searchText = "jazz"
        await vm.performSearchNow()
        XCTAssertTrue(SearchHistoryService.shared.recentSearches.isEmpty)
    }

    func testCommitRecordsTrimmedQuery() async {
        SearchHistoryService.shared.clearAll()
        defer { SearchHistoryService.shared.clearAll() }
        let fake = FakeSearch()
        fake.events = [event("1")]
        let vm = SearchViewModel(events: fake, restaurants: fake, attractions: fake)
        vm.searchText = "  jazz  "
        await vm.performSearchNow()
        vm.commitToHistory()
        XCTAssertEqual(SearchHistoryService.shared.recentSearches, ["jazz"])
    }

    func testCommitIsOffWhenRecordsHistoryIsFalse() async {
        SearchHistoryService.shared.clearAll()
        defer { SearchHistoryService.shared.clearAll() }
        let fake = FakeSearch()
        fake.events = [event("1")]
        let vm = SearchViewModel(events: fake, restaurants: fake, attractions: fake)
        vm.recordsHistory = false
        vm.searchText = "jazz"
        await vm.performSearchNow()
        vm.commitToHistory()
        XCTAssertTrue(SearchHistoryService.shared.recentSearches.isEmpty)
    }

    // MARK: - Words as filters (IOS-DD-SEARCH-05)

    func testFreeEventsSendsFreeOnlyAndNoText() async throws {
        let fake = FakeSearch()
        let vm = SearchViewModel(events: fake, restaurants: fake, attractions: fake)
        vm.searchText = "Free events"
        await vm.performSearchNow()
        let query = try XCTUnwrap(fake.lastEventsQuery)
        XCTAssertTrue(query.freeOnly)
        XCTAssertNil(query.searchText)
    }

    func testTonightSendsTheTonightWindow() async throws {
        let fake = FakeSearch()
        let vm = SearchViewModel(events: fake, restaurants: fake, attractions: fake)
        vm.searchText = "jazz tonight"
        await vm.performSearchNow()
        let query = try XCTUnwrap(fake.lastEventsQuery)
        let expected = DateFilterPreset.tonight.range(now: Date())
        XCTAssertEqual(query.searchText, "jazz")
        XCTAssertEqual(try XCTUnwrap(query.dateStart).timeIntervalSince1970, expected.start.timeIntervalSince1970, accuracy: 5)
        XCTAssertEqual(try XCTUnwrap(query.dateEnd).timeIntervalSince1970, expected.end.timeIntervalSince1970, accuracy: 5)
    }

    func testFiltersAloneRunASearch() async {
        let fake = FakeSearch()
        let vm = SearchViewModel(events: fake, restaurants: fake, attractions: fake)
        vm.filters = SearchFilters(datePreset: .tonight)
        await vm.performSearchNow()
        XCTAssertEqual(fake.eventFetchCount, 1)
        XCTAssertTrue(vm.hasSearched)
    }

    // MARK: - Tabs, fuzzy, more (IOS-DD-SEARCH-07)

    func testTabWithResultsIsSelected() async {
        let fake = FakeSearch()
        fake.restaurants = [Restaurant(id: "r1", name: "Ramen Bar")]
        let vm = SearchViewModel(events: fake, restaurants: fake, attractions: fake)
        vm.searchText = "ramen"
        await vm.performSearchNow()
        XCTAssertEqual(vm.selectedTab, .restaurants)
    }

    func testUserPickedTabSticks() async {
        let fake = FakeSearch()
        fake.restaurants = [Restaurant(id: "r1", name: "Ramen Bar")]
        let gate = Gate()
        fake.gate = gate
        let vm = SearchViewModel(events: fake, restaurants: fake, attractions: fake)
        vm.searchText = "ramen"
        let search = Task { await vm.performSearchNow() }
        await Task.yield()
        vm.selectTab(.attractions)
        gate.open()
        await search.value
        XCTAssertEqual(vm.selectedTab, .attractions)
    }

    func testFuzzyFallbackIsFlagged() async {
        let fake = FakeSearch()
        fake.fuzzyEvents = [event("1")]
        let vm = SearchViewModel(events: fake, restaurants: fake, attractions: fake)
        vm.searchText = "concrt"
        await vm.performSearchNow()
        XCTAssertEqual(vm.fuzzyTabs, [.events])
        XCTAssertEqual(vm.eventResults.count, 1)
    }

    func testHasMoreIsKept() async {
        let fake = FakeSearch()
        fake.events = [event("1")]
        fake.eventsHasMore = true
        let vm = SearchViewModel(events: fake, restaurants: fake, attractions: fake)
        vm.searchText = "jazz"
        await vm.performSearchNow()
        XCTAssertEqual(vm.hasMore[.events], true)
    }

    // MARK: - Equal assignments (IOS-DD-SEARCH-15)

    func testAssigningSameTextDoesNotRefetch() async {
        let fake = FakeSearch()
        fake.events = [event("1")]
        let vm = SearchViewModel(events: fake, restaurants: fake, attractions: fake)
        vm.searchText = "jazz"
        try? await Task.sleep(for: .milliseconds(400))
        vm.searchText = "jazz"
        try? await Task.sleep(for: .milliseconds(400))
        XCTAssertEqual(fake.eventFetchCount, 1)
    }
}
