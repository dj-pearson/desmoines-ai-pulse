import XCTest
@testable import DesMoinesInsider

/// Pure date-math coverage for IOS-PARITY-004. The networked fetch + SwiftUI
/// screen run in the CI macOS build; these lock the Fri–Sun window computation
/// (which mirrors the web /weekend curation) and the day bucketing.
final class WeekendTests: XCTestCase {

    /// Fixed UTC Gregorian calendar so the math is deterministic regardless of
    /// the CI machine's locale/timezone.
    private var calendar: Calendar {
        var c = Calendar(identifier: .gregorian)
        c.timeZone = TimeZone(identifier: "UTC")!
        return c
    }

    private func date(_ year: Int, _ month: Int, _ day: Int, hour: Int = 12) -> Date {
        var comps = DateComponents()
        comps.year = year; comps.month = month; comps.day = day; comps.hour = hour
        return calendar.date(from: comps)!
    }

    // MARK: Window always anchors to a Friday, with consecutive days

    func testWindowStartsOnFridayMidweek() {
        // 2026-06-03 is a Wednesday.
        let window = WeekendWindow.current(now: date(2026, 6, 3), calendar: calendar)
        XCTAssertEqual(calendar.component(.weekday, from: window.fridayStart), 6) // Friday
        // Friday → Sunday are consecutive; Monday is the exclusive end.
        XCTAssertEqual(window.saturdayStart, calendar.date(byAdding: .day, value: 1, to: window.fridayStart))
        XCTAssertEqual(window.sundayStart, calendar.date(byAdding: .day, value: 2, to: window.fridayStart))
        XCTAssertEqual(window.mondayStart, calendar.date(byAdding: .day, value: 3, to: window.fridayStart))
        // Upcoming weekend: Friday is 2026-06-05.
        XCTAssertEqual(calendar.component(.day, from: window.fridayStart), 5)
    }

    func testSaturdayAnchorsToCurrentWeekend() {
        // 2026-06-06 is a Saturday → this weekend's Friday is the day before (06-05).
        let window = WeekendWindow.current(now: date(2026, 6, 6), calendar: calendar)
        XCTAssertEqual(calendar.component(.weekday, from: window.fridayStart), 6)
        XCTAssertEqual(calendar.component(.day, from: window.fridayStart), 5)
    }

    func testSundayAnchorsToCurrentWeekend() {
        // 2026-06-07 is a Sunday → Friday is 06-05 (two days earlier).
        let window = WeekendWindow.current(now: date(2026, 6, 7), calendar: calendar)
        XCTAssertEqual(calendar.component(.day, from: window.fridayStart), 5)
        XCTAssertTrue(window.day(for: date(2026, 6, 7), calendar: calendar) == .sunday)
    }

    // MARK: Day bucketing

    func testDayForBucketsEachWeekendDay() {
        let window = WeekendWindow.current(now: date(2026, 6, 3), calendar: calendar)
        XCTAssertEqual(window.day(for: window.fridayStart, calendar: calendar), .friday)
        XCTAssertEqual(window.day(for: window.saturdayStart, calendar: calendar), .saturday)
        XCTAssertEqual(window.day(for: window.sundayStart, calendar: calendar), .sunday)
        // A weekday outside the window buckets to nil.
        XCTAssertNil(window.day(for: date(2026, 6, 3), calendar: calendar)) // Wednesday
    }

    func testDayTitlesAndOrder() {
        XCTAssertEqual(WeekendWindow.Day.allCases.map(\.title), ["Friday", "Saturday", "Sunday"])
    }
}
