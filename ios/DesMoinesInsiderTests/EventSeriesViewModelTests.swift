import XCTest
@testable import DesMoinesInsider

/// IOS-AUDIT-FEAT-046 slice 3: the series screen's load, error and retry.
@MainActor
final class EventSeriesViewModelTests: XCTestCase {

    private struct Outage: Error {}

    /// 15:00 UTC on 2026-10-01, the clock EventSeriesScheduleTests uses.
    private let now = DateParser.parse("2026-10-01T15:00:00Z")!

    private func def() throws -> EventSeriesDef {
        try XCTUnwrap(EventSeries.series(slug: "panda-fest"))
    }

    private func row(_ id: String, _ title: String, _ day: String) -> SeriesEventRow {
        var event = Event(id: id, title: title, date: "\(day)T23:00:00+00:00")
        event.eventStartUtc = event.date
        event.venue = "Water Works Park"
        return SeriesEventRow(event: event)
    }

    func testLoadBuildsTheScheduleFromTheSeriesRead() async throws {
        let rows = [row("a", "Panda Fest 2026", "2026-10-02")]
        let vm = EventSeriesViewModel(def: try def(), fetch: { _ in rows }, now: { [now] in now })
        XCTAssertTrue(vm.isLoading)
        await vm.load()
        XCTAssertFalse(vm.isLoading)
        XCTAssertNil(vm.loadError)
        XCTAssertEqual(vm.schedule?.current?.year, 2026)
        XCTAssertEqual(vm.currentHeading, "2026 dates")
    }

    func testNoEditionHeadsTheSectionWithTheUnannouncedYear() async throws {
        let vm = EventSeriesViewModel(def: try def(), fetch: { _ in [] }, now: { [now] in now })
        await vm.load()
        XCTAssertNil(vm.schedule?.current)
        XCTAssertEqual(vm.currentHeading, "2026 dates")
    }

    func testAFailedReadIsAnErrorNotAnEmptySeries() async throws {
        let vm = EventSeriesViewModel(def: try def(), fetch: { _ in throw Outage() }, now: { [now] in now })
        await vm.load()
        XCTAssertNotNil(vm.loadError)
        XCTAssertNil(vm.schedule)
        XCTAssertNil(vm.currentHeading)
    }

    func testRetryAfterAFailureClearsTheError() async throws {
        var fail = true
        let rows = [row("a", "Panda Fest 2026", "2026-10-02")]
        let vm = EventSeriesViewModel(def: try def(), fetch: { _ in
            if fail { throw Outage() }
            return rows
        }, now: { [now] in now })
        await vm.load()
        XCTAssertNotNil(vm.loadError)
        fail = false
        await vm.load()
        XCTAssertNil(vm.loadError)
        XCTAssertEqual(vm.schedule?.total, 1)
    }

    func testCancellationIsNotReportedAsAnError() async throws {
        let vm = EventSeriesViewModel(def: try def(), fetch: { _ in throw CancellationError() }, now: { [now] in now })
        await vm.load()
        XCTAssertNil(vm.loadError)
    }

    func testShareURLIsTheWebSeriesPage() throws {
        let vm = EventSeriesViewModel(def: try def())
        XCTAssertEqual(vm.shareURL.absoluteString, "https://desmoinesinsider.com/events/series/panda-fest")
    }
}
