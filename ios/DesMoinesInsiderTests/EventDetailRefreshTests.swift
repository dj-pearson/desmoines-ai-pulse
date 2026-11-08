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
        /// What the archived second look returns; nil is "no archived row".
        var archived: Event?
        var archivedError: Error?
        private(set) var fetchCount = 0
        private(set) var archivedFetchCount = 0

        func fetchEvent(id: String) async throws -> Event {
            fetchCount += 1
            if let error { throw error }
            guard let event else { throw FakeError.noStub }
            return event
        }

        func fetchRelatedEvents(eventId: String, category: String, limit: Int) async throws -> [Event] {
            []
        }

        func fetchArchivedEvent(id: String) async throws -> Event? {
            archivedFetchCount += 1
            if let archivedError { throw archivedError }
            return archived
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

    // MARK: - No longer available (IOS-DD-EVENTS-02)

    /// PostgREST's "0 rows" answer to a `.single()`, shaped like PostgrestError.
    private struct NotFound: Error {
        let code: String? = "PGRST116"
        let message = "JSON object requested, multiple (or no) rows returned"
    }

    func testANotFoundRefreshMarksTheEventUnavailable() async {
        let fake = FakeEvents()
        fake.error = NotFound()
        let vm = EventDetailViewModel(service: fake)

        await vm.loadEvent(event(title: "Jazz Night"))

        XCTAssertTrue(vm.isUnavailable)
        XCTAssertNotNil(vm.event, "the prefetched content stays on screen")
    }

    func testAnOfflineRefreshDoesNotMarkItUnavailable() async {
        let fake = FakeEvents()
        fake.error = FakeError.offline
        let vm = EventDetailViewModel(service: fake)

        await vm.loadEvent(event(title: "Jazz Night"))

        XCTAssertFalse(vm.isUnavailable)
    }

    // MARK: - Archived past event (IOS-AUDIT-001)

    func testAnArchivedRowIsAPastEventNotUnavailable() async {
        // A series screen opens an archived past edition with its own row; the
        // visible re-read refuses it, and that used to read as "gone".
        let fake = FakeEvents()
        fake.error = NotFound()
        fake.archived = event(title: "Jazz Night", venue: "Noce")
        let vm = EventDetailViewModel(service: fake)

        await vm.loadEvent(event(title: "Jazz Night", venue: "Noce"))

        XCTAssertTrue(vm.isArchived)
        XCTAssertFalse(vm.isUnavailable)
        XCTAssertEqual(vm.event?.venue, "Noce")
    }

    func testTheArchivedRowReplacesAStalePrefetchedOne() async {
        let fake = FakeEvents()
        fake.error = NotFound()
        fake.archived = event(title: "Jazz Night", venue: "Noce")
        let vm = EventDetailViewModel(service: fake)

        await vm.loadEvent(event(title: "Jazz Night", venue: "TBA"))

        XCTAssertEqual(vm.event?.venue, "Noce")
    }

    func testNoArchivedRowStillMeansUnavailable() async {
        // Hidden, merged or deleted: the second look finds nothing.
        let fake = FakeEvents()
        fake.error = NotFound()
        let vm = EventDetailViewModel(service: fake)

        await vm.loadEvent(event(title: "Jazz Night"))

        XCTAssertEqual(fake.archivedFetchCount, 1)
        XCTAssertTrue(vm.isUnavailable)
        XCTAssertFalse(vm.isArchived)
    }

    func testAFailedArchivedLookFallsBackToUnavailable() async {
        let fake = FakeEvents()
        fake.error = NotFound()
        fake.archivedError = FakeError.offline
        let vm = EventDetailViewModel(service: fake)

        await vm.loadEvent(event(title: "Jazz Night"))

        XCTAssertTrue(vm.isUnavailable)
        XCTAssertFalse(vm.isArchived)
    }

    func testAnOfflineRefreshTakesNoSecondLook() async {
        // Only "no such row" asks whether the row was archived.
        let fake = FakeEvents()
        fake.error = FakeError.offline
        fake.archived = event(title: "Jazz Night")
        let vm = EventDetailViewModel(service: fake)

        await vm.loadEvent(event(title: "Jazz Night"))

        XCTAssertEqual(fake.archivedFetchCount, 0)
        XCTAssertFalse(vm.isArchived)
    }

    func testALiveRowIsNeverArchived() async {
        let fake = FakeEvents()
        fake.event = event(title: "Jazz Night")
        fake.archived = event(title: "Jazz Night")
        let vm = EventDetailViewModel(service: fake)

        await vm.loadEvent(event(title: "Jazz Night"))

        XCTAssertEqual(fake.archivedFetchCount, 0)
        XCTAssertFalse(vm.isArchived)
    }

    func testOpeningAnArchivedIdShowsItAsAPastEvent() async {
        // The by-id path (an /events/<id> link to an archived row) renders it
        // as a past event, as the web does, instead of an error.
        let fake = FakeEvents()
        fake.error = NotFound()
        fake.archived = event(id: "past-1", title: "Jazz Night")
        let vm = EventDetailViewModel(service: fake)

        await vm.loadEvent(id: "past-1")

        XCTAssertEqual(vm.event?.id, "past-1")
        XCTAssertTrue(vm.isArchived)
        XCTAssertFalse(vm.isUnavailable)
        XCTAssertNil(vm.errorMessage)
    }

    func testOpeningAMissingIdStillReportsIt() async {
        let fake = FakeEvents()
        fake.error = NotFound()
        let vm = EventDetailViewModel(service: fake)

        await vm.loadEvent(id: "gone-1")

        XCTAssertNil(vm.event)
        XCTAssertTrue(vm.isUnavailable)
        XCTAssertNotNil(vm.errorMessage)
    }

    // MARK: - Share (IOS-DD-EVENTS-15)

    func testTheShareLinkIsTheEventsPage() async {
        let fake = FakeEvents()
        fake.error = FakeError.offline
        let vm = EventDetailViewModel(service: fake)

        await vm.loadEvent(event(id: "abc-123", title: "Jazz Night"))

        XCTAssertEqual(vm.shareURL?.absoluteString, "https://desmoinesinsider.com/events/abc-123")
        XCTAssertTrue(vm.shareText.hasPrefix("Want to go? Jazz Night"))
    }
}
