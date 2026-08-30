import XCTest
@testable import DesMoinesInsider

/// IOS-AUDIT-UX-058, testable at last via IOS-AUDIT-TEST-006's seam.
///
/// The behaviour under test is easy to implement in a way that looks right and
/// does nothing: the refresh has to reach the screen, has to not replace an
/// identical row, and has to stay quiet when it fails. None of that could be
/// asserted while EventDetailViewModel reached EventsService.shared directly.
@MainActor
final class EventDetailRefreshTests: XCTestCase {

    /// Returns what the test tells it to, and counts the calls.
    private final class FakeEvents: EventDetailProviding, @unchecked Sendable {
        var event: Event?
        var error: Error?
        private(set) var fetchCount = 0

        func fetchEvent(id: String) async throws -> Event {
            fetchCount += 1
            if let error { throw error }
            guard let event else { throw FakeError.noStub }
            return event
        }

        func fetchRelatedEvents(eventId: String, category: String, limit: Int) async throws -> [Event] {
            []
        }
    }

    private enum FakeError: Error { case noStub, offline }

    private func event(id: String = "e1", title: String, venue: String? = nil) -> Event {
        var fields = ["\"id\":\"\(id)\"", "\"title\":\"\(title)\"", "\"date\":\"2026-09-01\""]
        if let venue { fields.append("\"venue\":\"\(venue)\"") }
        // swiftlint:disable:next force_try
        return try! JSONDecoder().decode(Event.self, from: Data("{\(fields.joined(separator: ","))}".utf8))
    }

    // MARK: - The refresh reaches the screen

    func testAChangedRowReplacesThePrefetchedOne() async {
        let fake = FakeEvents()
        fake.event = event(title: "Jazz Night", venue: "Noce")
        let vm = EventDetailViewModel(service: fake)

        await vm.loadEvent(event(title: "Jazz Night", venue: "TBA"))

        XCTAssertEqual(vm.event?.venue, "Noce")
    }

    func testThePrefetchedRowIsShownBeforeTheRefreshReturns() async {
        // Not "eventually correct" - the prefetched row must be the value the
        // moment loadEvent is entered, because the screen is already visible.
        let fake = FakeEvents()
        fake.event = event(title: "Jazz Night", venue: "Noce")
        let vm = EventDetailViewModel(service: fake)

        let task = Task { await vm.loadEvent(self.event(title: "Jazz Night", venue: "TBA")) }
        await Task.yield()
        XCTAssertNotNil(vm.event, "the prefetched event must be assigned synchronously")
        await task.value
    }

    // MARK: - Content vs identity

    func testTwoRowsDifferingOnlyInAFieldAreSeenAsDifferentContent() {
        // Event implements == as id equality for navigation identity. Using it
        // here made the refresh discard every result it fetched, which is what
        // the failing test above found. This pins the distinction.
        let a = event(title: "Jazz Night", venue: "TBA")
        let b = event(title: "Jazz Night", venue: "Noce")
        XCTAssertEqual(a, b, "same id, so == says equal - that is the trap")
        XCTAssertTrue(EventDetailViewModel.contentDiffers(b, from: a))
    }

    func testAnUnchangedRowIsSeenAsUnchanged() {
        let a = event(title: "Jazz Night", venue: "Noce")
        XCTAssertFalse(EventDetailViewModel.contentDiffers(a, from: a))
    }

    func testNoPreviousRowCountsAsDifferent() {
        XCTAssertTrue(EventDetailViewModel.contentDiffers(event(title: "Jazz Night"), from: nil))
    }

    func testTheRefreshStillRunsWhenNothingChanged() async {
        // The skip is an optimisation on the ASSIGNMENT, not a reason to avoid
        // re-reading - otherwise a stale row would never be corrected.
        let prefetched = event(title: "Jazz Night", venue: "Noce")
        let fake = FakeEvents()
        fake.event = prefetched
        let vm = EventDetailViewModel(service: fake)

        await vm.loadEvent(prefetched)

        XCTAssertEqual(fake.fetchCount, 1)
    }

    // MARK: - It fails quietly

    func testAFailedRefreshKeepsThePrefetchedRow() async {
        // The user is looking at a complete event. Losing it because a
        // background re-read failed would be worse than a stale field.
        let prefetched = event(title: "Jazz Night", venue: "Noce")
        let fake = FakeEvents()
        fake.error = FakeError.offline
        let vm = EventDetailViewModel(service: fake)

        await vm.loadEvent(prefetched)

        XCTAssertEqual(vm.event, prefetched)
    }

    func testAFailedRefreshRaisesNoError() async {
        let fake = FakeEvents()
        fake.error = FakeError.offline
        let vm = EventDetailViewModel(service: fake)

        await vm.loadEvent(event(title: "Jazz Night"))

        XCTAssertNil(vm.errorMessage, "an error banner over working content is worse than the stale field")
    }

    // MARK: - Loading state

    func testTheLoadingFlagIsNotRaisedWhenContentIsAlreadyOnScreen() async {
        let fake = FakeEvents()
        fake.event = event(title: "Jazz Night")
        let vm = EventDetailViewModel(service: fake)

        await vm.loadEvent(event(title: "Jazz Night"))

        XCTAssertFalse(vm.isLoading)
        XCTAssertFalse(vm.isRefreshing, "should be cleared once the refresh settles")
    }
}
