import XCTest
@testable import DesMoinesInsider

/// IOS-AUDIT-FEAT-037 -- the expiry and pruning rules.
///
/// Indexed events carried no expirationDate and nothing ever removed them, so a
/// Spotlight search surfaced last month's events indefinitely. CSSearchableIndex
/// cannot be driven from a unit test, so the decision is extracted as a pure
/// static and that is what these cover: which events get indexed, which get
/// deleted, and where the boundary falls.
final class SpotlightExpiryTests: XCTestCase {

    /// Decoded rather than memberwise-initialised: Event has thirty-odd stored
    /// properties and only id, title and date are required.
    private func event(id: String, date: String?, endDate: String? = nil) -> Event {
        var fields = ["\"id\":\"\(id)\"", "\"title\":\"Test \(id)\""]
        fields.append("\"date\":\"\(date ?? "")\"")
        if let endDate { fields.append("\"end_date\":\"\(endDate)\"") }
        let json = "{\(fields.joined(separator: ","))}"
        // swiftlint:disable:next force_try
        return try! JSONDecoder().decode(Event.self, from: Data(json.utf8))
    }

    private func iso(_ offsetHours: Double, from now: Date) -> String {
        let date = now.addingTimeInterval(offsetHours * 3600)
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime]
        return formatter.string(from: date)
    }

    // MARK: - Expiration

    func testExpirationIsTheEffectiveEndPlusGrace() throws {
        // A timed event with no end_date runs three hours (Event.isOver).
        let e = event(id: "timed", date: "2026-08-08T15:00:00Z")
        let start = try XCTUnwrap(e.parsedDate)
        XCTAssertEqual(
            SpotlightService.expiration(for: e),
            start.addingTimeInterval(3 * 3600 + SpotlightService.expiryGraceSeconds)
        )
    }

    func testAnUndatedEventHasNoExpiration() {
        XCTAssertNil(SpotlightService.expiration(for: event(id: "undated", date: nil)))
    }

    // MARK: - Multi-day events (IOS-DD-PLATFORM-08)

    /// Aug 8 10:00 CDT to Aug 10 22:00 CDT.
    private var festival: Event {
        event(id: "fest", date: "2026-08-08T15:00:00Z", endDate: "2026-08-11T03:00:00Z")
    }

    func testAFestivalIsFreshOnItsSecondDay() throws {
        // Aug 9, noon CDT.
        let now = try XCTUnwrap(ISO8601DateFormatter().date(from: "2026-08-09T17:00:00Z"))
        let (fresh, expired) = SpotlightService.partition([festival], now: now)
        XCTAssertEqual(fresh.map(\.id), ["fest"])
        XCTAssertTrue(expired.isEmpty)
    }

    func testAFestivalExpiresAfterItsEnd() throws {
        let end = try XCTUnwrap(festival.parsedEndDate)
        let expiry = try XCTUnwrap(SpotlightService.expiration(for: festival))
        XCTAssertGreaterThan(expiry, end)
    }

    func testATimedEventWithNoEndIsExpiredFourHoursIn() {
        let now = Date()
        let (fresh, expired) = SpotlightService.partition([event(id: "show", date: iso(-4, from: now))], now: now)
        XCTAssertTrue(fresh.isEmpty)
        XCTAssertEqual(expired, ["event-show"])
    }

    func testGraceIsNotZero() {
        // A user searching for the thing they are standing in front of should
        // still find it. The start time is often the only time the source
        // publishes, so the assumed duration runs short more often than long.
        XCTAssertGreaterThan(SpotlightService.expiryGraceSeconds, 0)
    }

    // MARK: - Partitioning

    func testFutureEventsAreIndexedAndPastOnesArePruned() {
        let now = Date()
        let events = [
            event(id: "future", date: iso(24, from: now)),
            event(id: "past", date: iso(-72, from: now)),
        ]

        let (fresh, expired) = SpotlightService.partition(events, now: now)

        XCTAssertEqual(fresh.map(\.id), ["future"])
        XCTAssertEqual(expired, ["event-past"])
    }

    func testPrunedIdentifiersMatchTheFormatSpotlightIndexedThemUnder() {
        // The delete only works if the identifier is byte-identical to the one
        // indexSearchableItems wrote. A mismatch fails silently - the item stays
        // in the index and nothing errors.
        let now = Date()
        let (_, expired) = SpotlightService.partition(
            [event(id: "abc-123", date: iso(-100, from: now))],
            now: now
        )
        XCTAssertEqual(expired, ["event-abc-123"])
    }

    func testAnEventStillRunningIsKept() {
        // Started two hours ago: inside the three hours a timed event with no
        // end_date is assumed to run (Event.isOver, IOS-DD-PLATFORM-08).
        let now = Date()
        let (fresh, expired) = SpotlightService.partition(
            [event(id: "tonight", date: iso(-2, from: now))],
            now: now
        )
        XCTAssertEqual(fresh.map(\.id), ["tonight"])
        XCTAssertTrue(expired.isEmpty)
    }

    func testAnUndatedEventIsIndexedAndNeverPruned() {
        // Guessing an expiry would delete a listing we cannot date, and an
        // undated event is the one a user is most likely to search for by name.
        let now = Date()
        let (fresh, expired) = SpotlightService.partition(
            [event(id: "undated", date: nil)],
            now: now
        )
        XCTAssertEqual(fresh.map(\.id), ["undated"])
        XCTAssertTrue(expired.isEmpty)
    }

    func testAnEmptyBatchProducesNoDelete() {
        // An empty identifier list must not reach deleteSearchableItems, which
        // is why indexEvents guards on it.
        let (fresh, expired) = SpotlightService.partition([], now: Date())
        XCTAssertTrue(fresh.isEmpty)
        XCTAssertTrue(expired.isEmpty)
    }
}
