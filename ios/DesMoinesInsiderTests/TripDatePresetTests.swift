import XCTest
@testable import DesMoinesInsider

/// IOS-DD-TRIP-PLANNER-14: one-tap ranges, computed in Central time.
final class TripDatePresetTests: XCTestCase {
    private func central(_ y: Int, _ m: Int, _ d: Int, _ h: Int = 0) -> Date {
        DesMoinesTime.calendar.date(from: DateComponents(year: y, month: m, day: d, hour: h))!
    }

    func testThisWeekendFromAWednesdayIsFridayToSunday() {
        let r = TripDatePreset.thisWeekend.range(now: central(2026, 9, 30, 12))
        XCTAssertEqual(r.start, central(2026, 10, 2))
        XCTAssertEqual(r.end, central(2026, 10, 4))
    }

    func testThisWeekendOnSaturdayStartsToday() {
        let r = TripDatePreset.thisWeekend.range(now: central(2026, 10, 3, 10))
        XCTAssertEqual(r.start, central(2026, 10, 3), "not the Friday that has passed")
        XCTAssertEqual(r.end, central(2026, 10, 4))
    }

    func testNextWeekendIsSevenDaysLater() {
        let r = TripDatePreset.nextWeekend.range(now: central(2026, 9, 30, 12))
        XCTAssertEqual(r.start, central(2026, 10, 9))
        XCTAssertEqual(r.end, central(2026, 10, 11))
    }

    func testTomorrowIsOneDay() {
        let r = TripDatePreset.tomorrow.range(now: central(2026, 9, 30, 23))
        XCTAssertEqual(r.start, central(2026, 10, 1))
        XCTAssertEqual(r.end, central(2026, 10, 1))
    }

    func testMatchingFindsThePreset() {
        let now = central(2026, 9, 30, 12)
        XCTAssertEqual(TripDatePreset.matching(start: central(2026, 10, 2, 9), end: central(2026, 10, 4, 9), now: now), .thisWeekend)
        XCTAssertNil(TripDatePreset.matching(start: central(2026, 10, 2), end: central(2026, 10, 3), now: now))
    }
}
