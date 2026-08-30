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
    private func event(id: String, date: String?) -> Event {
        var fields = ["\"id\":\"\(id)\"", "\"title\":\"Test \(id)\""]
        fields.append("\"date\":\"\(date ?? "")\"")
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

    func testExpirationIsTheAssumedEndPlusGrace() {
        let start = Date(timeIntervalSince1970: 1_000_000)
        XCTAssertEqual(
            SpotlightService.expiration(for: start),
            start.addingTimeInterval(SpotlightService.assumedDurationSeconds
                + SpotlightService.expiryGraceSeconds)
        )
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

    func testAnEventStillInsideItsGraceIsKept() {
        // Started three hours ago: past its assumed two-hour end, inside the
        // six-hour grace.
        let now = Date()
        let (fresh, expired) = SpotlightService.partition(
            [event(id: "tonight", date: iso(-3, from: now))],
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
