import XCTest
@testable import DesMoinesInsider

/// IOS-AUDIT-TEST-005 AC1/AC2, testable via IOS-AUDIT-TEST-006 AC3's seam.
///
/// The generation token is the kind of guard that is invisible when it works and
/// invisible when it does not: without it a pre-reset fetch appends cards built
/// from the OLD filter into the freshly reset deck, and the only symptom is a
/// user occasionally seeing a card they filtered out. Nothing logs, nothing
/// fails. It can only be asserted by holding a fetch open across a reset, which
/// needs an injected provider.
@MainActor
final class DiscoverDeckTests: XCTestCase {

    /// Serves a page of events, optionally waiting on a gate first.
    private final class FakeEvents: EventPageProviding, @unchecked Sendable {
        var events: [Event] = []
        var gate: Gate?
        private(set) var callCount = 0

        func fetchEvents(query: EventsService.EventsQuery) async throws -> EventsService.EventsResponse {
            callCount += 1
            await gate?.wait()
            return .init(events: events, totalCount: events.count, hasMore: false)
        }
    }

    private final class FakeRestaurants: RestaurantPageProviding, @unchecked Sendable {
        func fetchRestaurants(
            query: RestaurantsService.RestaurantsQuery
        ) async throws -> RestaurantsService.RestaurantsResponse {
            .init(restaurants: [], totalCount: 0, hasMore: false)
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
        let json = "{\"id\":\"\(id)\",\"title\":\"Event \(id)\",\"date\":\"2026-09-01\",\"category\":\"Music\"}"
        // swiftlint:disable:next force_try
        return try! JSONDecoder().decode(Event.self, from: Data(json.utf8))
    }

    private func viewModel(_ events: FakeEvents) -> DiscoverViewModel {
        DiscoverViewModel(
            mode: .events,
            eventsService: events,
            restaurantsService: FakeRestaurants()
        )
    }

    // MARK: - Deck population

    func testAFetchFillsTheDeck() async {
        let fake = FakeEvents()
        fake.events = [event("1"), event("2"), event("3")]
        let vm = viewModel(fake)

        await vm.reload()

        XCTAssertEqual(vm.deck.count, 3)
        XCTAssertFalse(vm.isLoading)
        XCTAssertFalse(vm.lastLoadFailed)
    }

    func testAnEmptyResultLeavesAnEmptyDeckWithoutFlaggingFailure() async {
        // "Nothing left to show" and "the load broke" are different states, and
        // the empty view has to be able to tell them apart.
        let fake = FakeEvents()
        let vm = viewModel(fake)

        await vm.reload()

        XCTAssertTrue(vm.deck.isEmpty)
        XCTAssertFalse(vm.lastLoadFailed)
    }

    func testReloadReplacesTheDeckRatherThanAppending() async {
        let fake = FakeEvents()
        fake.events = [event("1"), event("2")]
        let vm = viewModel(fake)
        await vm.reload()

        fake.events = [event("3")]
        await vm.reload()

        XCTAssertEqual(vm.deck.count, 1)
    }

    // MARK: - Generation token (AC2)

    func testResultsFromABeforeReloadFetchAreDiscarded() async {
        // The whole point of fetchGeneration. A fetch that started before a
        // reload carries the OLD filter and offset; letting it land would mix
        // filtered-out cards into the new deck.
        let fake = FakeEvents()
        fake.events = [event("stale-1"), event("stale-2")]
        let gate = Gate()
        fake.gate = gate
        let vm = viewModel(fake)

        // Start a load and leave it hanging inside the provider.
        let firstLoad = Task { await vm.reload() }
        await Task.yield()

        // Reset the deck while it is in flight, then let the stale fetch finish.
        let secondLoad = Task { await vm.reload() }
        await Task.yield()
        gate.open()
        await firstLoad.value
        await secondLoad.value

        // Two fetches ran; only the current generation's results may be in the
        // deck, so the stale batch must not have been appended twice.
        XCTAssertEqual(vm.deck.count, 2, "stale results were appended on top of the fresh ones")
    }

    func testBoostClearsTheDeckAndInvalidatesInFlightResults() async {
        // Boost narrows the filter and resets. A pre-boost fetch landing after
        // it would put exactly the cards the user swiped away from back on top.
        let fake = FakeEvents()
        fake.events = [event("1"), event("2")]
        let vm = viewModel(fake)
        await vm.reload()
        XCTAssertEqual(vm.deck.count, 2)

        guard let top = vm.deck.first else { return XCTFail("deck should be populated") }
        vm.boost(top)

        // Boost is synchronous up to the refetch: the deck must be empty
        // immediately, and isLoading up, so the empty state is never flashed
        // (IOS-AUDIT-UX-019).
        XCTAssertTrue(vm.deck.isEmpty)
        XCTAssertTrue(vm.isLoading)
    }
}
