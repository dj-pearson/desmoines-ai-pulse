import XCTest
@testable import DesMoinesInsider

/// IOS-DD-RESTAURANTS-01: open status from hours_json, in Central time.
///
/// Every instant is built with DesMoinesTime.calendar, so the result does not
/// depend on the zone of the machine running the tests.
final class RestaurantHoursTests: XCTestCase {

    // MARK: - Builders

    /// Tue 2026-09-29, Sat 2026-10-03 and Sun 2026-10-04 are the days used.
    private func central(_ month: Int, _ day: Int, _ hour: Int, _ minute: Int = 0) -> Date {
        DesMoinesTime.calendar.date(from: DateComponents(year: 2026, month: month, day: day, hour: hour, minute: minute))!
    }

    private func period(_ openDay: Int, _ openHour: Int, _ closeDay: Int?, _ closeHour: Int) -> StoredHours.Period {
        StoredHours.Period(open: .init(day: openDay, hour: openHour), close: .init(day: closeDay, hour: closeHour))
    }

    /// Mon-Fri 11:00-22:00.
    private var weekdayHours: StoredHours {
        StoredHours(periods: (1...5).map { period($0, 11, $0, 22) })
    }

    private func status(_ hours: StoredHours?, at date: Date, business: String? = nil, lifecycle: String? = nil) -> OpenStatus {
        RestaurantHours.status(hours: hours, businessStatus: business, lifecycle: lifecycle, at: date)
    }

    // MARK: - Evaluation

    func testOpenMidDay() {
        let s = status(weekdayHours, at: central(9, 29, 12))
        XCTAssertEqual(s, .open(closesAt: "10 PM"))
        XCTAssertEqual(s.line, "Open until 10 PM")
    }

    func testClosingSoonInTheLastHour() {
        let s = status(weekdayHours, at: central(9, 29, 21, 15))
        XCTAssertEqual(s, .closingSoon(closesAt: "10 PM"))
        XCTAssertEqual(s.line, "Closes at 10 PM")
    }

    func testClosedAfterHoursNamesTomorrowsOpening() {
        let s = status(weekdayHours, at: central(9, 29, 22, 30))
        XCTAssertEqual(s, .closed(nextOpensAt: "tomorrow 11 AM"))
        XCTAssertEqual(s.line, "Closed, opens tomorrow 11 AM")
    }

    func testPastMidnightHoursCountOnTheNextDay() {
        // Friday 17:00 to Saturday 02:00, asked at Saturday 01:00.
        let hours = StoredHours(periods: [period(5, 17, 6, 2)])
        let s = status(hours, at: central(10, 3, 1))
        XCTAssertTrue(s.isOpen)
        XCTAssertEqual(s.closesAt, "2 AM")
    }

    func testSaturdayNightWrapsIntoSunday() {
        // Saturday 20:00 to Sunday 02:00, asked at Sunday 01:00.
        let hours = StoredHours(periods: [period(6, 20, 0, 2)])
        let s = status(hours, at: central(10, 4, 1))
        XCTAssertTrue(s.isOpen)
        XCTAssertEqual(s.closesAt, "2 AM")
    }

    func testAPeriodWithNoCloseIsUnknown() {
        let hours = StoredHours(periods: [StoredHours.Period(open: .init(day: 1, hour: 0), close: nil)])
        XCTAssertEqual(status(hours, at: central(9, 29, 12)), .unknown)
    }

    func testNoHoursIsUnknownAndHasNoLine() {
        XCTAssertEqual(status(nil, at: central(9, 29, 12)), .unknown)
        XCTAssertEqual(status(StoredHours(), at: central(9, 29, 12)), .unknown)
        XCTAssertNil(OpenStatus.unknown.line)
    }

    func testPermanentlyClosedBeatsOpenHours() {
        XCTAssertEqual(status(weekdayHours, at: central(9, 29, 12), business: "CLOSED_PERMANENTLY"), .closed(nextOpensAt: nil))
    }

    func testAnUnvisitableLifecycleIsClosed() {
        XCTAssertEqual(status(weekdayHours, at: central(9, 29, 12), lifecycle: "opening_soon"), .closed(nextOpensAt: nil))
    }

    func testClockLabels() {
        XCTAssertEqual(RestaurantHours.formatClockLabel(0), "midnight")
        XCTAssertEqual(RestaurantHours.formatClockLabel(12 * 60), "noon")
        XCTAssertEqual(RestaurantHours.formatClockLabel(22 * 60 + 30), "10:30 PM")
        XCTAssertEqual(RestaurantHours.formatClockLabel(24 * 60), "midnight")
    }

    // MARK: - Decoding

    private func decode(_ json: String) throws -> Restaurant {
        try JSONDecoder().decode(Restaurant.self, from: Data(json.utf8))
    }

    func testAValidHoursJsonDecodes() throws {
        let r = try decode("""
        {"id":"r1","name":"Place","hours_json":{"version":1,"periods":[{"open":{"day":2,"hour":11,"minute":0},"close":{"day":2,"hour":22,"minute":0}}],"weekdayDescriptions":["Tuesday: 11:00 AM - 10:00 PM"]}}
        """)
        XCTAssertEqual(r.hoursJson?.periods.count, 1)
        XCTAssertEqual(r.hoursJson?.weekdayDescriptions.first, "Tuesday: 11:00 AM - 10:00 PM")
        XCTAssertEqual(r.isOpenNow(at: central(9, 29, 12)), true)
    }

    func testGarbageHoursJsonStillDecodesTheRow() throws {
        let r = try decode(#"{"id":"r1","name":"Place","hours_json":"garbage"}"#)
        XCTAssertEqual(r.hoursJson?.periods.isEmpty, true)
        XCTAssertNil(r.isOpenNow())
    }

    func testMalformedPeriodsStillDecodeTheRow() throws {
        let r = try decode(#"{"id":"r1","name":"Place","hours_json":{"periods":[{"open":"x"}]}}"#)
        XCTAssertNil(r.isOpenNow())
    }
}
