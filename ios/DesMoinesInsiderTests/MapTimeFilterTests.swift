import XCTest
@testable import DesMoinesInsider

/// IOS-DD-MAP-07: the map's time chips in Des Moines time.
final class MapTimeFilterTests: XCTestCase {

    private let iso = ISO8601DateFormatter()

    private func central(_ year: Int, _ month: Int, _ day: Int, _ hour: Int, _ minute: Int = 0) -> Date {
        MapFixtures.central(year, month, day, hour, minute)
    }

    // (a) Saturday targets

    func testOnSaturdayAfternoonTheChipIsTonight() {
        let now = central(2026, 9, 26, 15)
        XCTAssertEqual(MapTimeChip.saturday.label(now: now), "This Sat")
        XCTAssertEqual(MapTimeChip.saturday.window(now: now)?.start, central(2026, 9, 26, 18))
    }

    func testOnSaturdayLateTheChipIsNextWeek() {
        let now = central(2026, 9, 26, 23)
        XCTAssertEqual(MapTimeChip.saturday.label(now: now), "Next Sat")
        XCTAssertEqual(MapTimeChip.saturday.window(now: now)?.start, central(2026, 10, 3, 18))
        XCTAssertEqual(MapTimeChip.saturday.window(now: now)?.end, central(2026, 10, 4, 2))
    }

    func testOnAWeekdayTheChipIsTheComingSaturday() {
        let now = central(2026, 9, 29, 10) // Tuesday
        XCTAssertEqual(MapTimeChip.saturday.label(now: now), "Sat night")
        XCTAssertEqual(MapTimeChip.saturday.window(now: now)?.start, central(2026, 10, 3, 18))
    }

    // (b) DST

    func testEightPMOnTheDSTStartDayBeginsAtSevenCDT() {
        // 2026-03-08 is the spring-forward Sunday. 19:00 CDT is 00:00Z on the 9th.
        let now = central(2026, 3, 8, 10)
        let window = MapTimeChip.at8pm.window(now: now)
        XCTAssertEqual(window?.start, iso.date(from: "2026-03-09T00:00:00Z"))
    }

    // (c) overlap

    func testAnEventRunningFromFiveToElevenMatchesEightPM() {
        let now = central(2026, 9, 29, 12)
        let e = MapFixtures.event("e", start: central(2026, 9, 29, 17), end: central(2026, 9, 29, 23))
        let window = MapTimeChip.at8pm.window(now: now)!
        XCTAssertTrue(MapTimeChip.eventMatches(e, window: window))
    }

    // (d) untimed rows go by day

    func testAnUntimedEventMatchesItsOwnDayOnly() {
        // 00:31:58Z on Sep 30 is the 19:31:58 no-time marker on Sep 29.
        let e = Event(id: "u", title: "Untimed", date: "2026-09-30T00:31:58Z")
        XCTAssertFalse(e.hasSpecificTime)
        let sameDay = MapTimeChip.at10pm.window(now: central(2026, 9, 29, 12))!
        let nextDay = MapTimeChip.at10pm.window(now: central(2026, 9, 30, 12))!
        XCTAssertTrue(MapTimeChip.eventMatches(e, window: sameDay))
        XCTAssertFalse(MapTimeChip.eventMatches(e, window: nextDay))
    }

    // (e) device zone does not matter

    func testAPhoneInLosAngelesStillGetsEightPMCentral() {
        let saved = NSTimeZone.default
        NSTimeZone.default = TimeZone(identifier: "America/Los_Angeles")!
        defer { NSTimeZone.default = saved }

        let now = central(2026, 9, 29, 12)
        XCTAssertEqual(MapTimeChip.at8pm.probeTime(now: now), iso.date(from: "2026-09-30T01:00:00Z"))
        XCTAssertEqual(MapTimeChip.at8pm.window(now: now)?.start, iso.date(from: "2026-09-30T00:00:00Z"))
    }

    // (f) tonight runs to 04:00

    func testTonightBeforeMidnightRunsToFourTomorrow() {
        let window = MapTimeChip.tonight.window(now: central(2026, 9, 29, 23, 30))
        XCTAssertEqual(window?.end, central(2026, 9, 30, 4))
    }

    func testTonightAfterMidnightRunsToFourToday() {
        let window = MapTimeChip.tonight.window(now: central(2026, 9, 30, 0, 30))
        XCTAssertEqual(window?.end, central(2026, 9, 30, 4))
    }

    // (g) now is three hours

    func testNowExcludesAnEventFiveHoursAway() {
        let now = central(2026, 9, 29, 14)
        let e = MapFixtures.event("e", start: now.addingTimeInterval(5 * 3600))
        XCTAssertFalse(MapTimeChip.eventMatches(e, window: MapTimeChip.now.window(now: now)!))
    }

    func testNowIncludesAnEventAlreadyUnderWay() {
        let now = central(2026, 9, 29, 20)
        let e = MapFixtures.event("e", start: central(2026, 9, 29, 19))
        XCTAssertTrue(MapTimeChip.eventMatches(e, window: MapTimeChip.now.window(now: now)!))
    }

    // Chip set

    func testPassedHourChipsAreNotOffered() {
        let chips = MapTimeChip.available(now: central(2026, 9, 29, 19))
        XCTAssertFalse(chips.contains(.at6pm))
        XCTAssertTrue(chips.contains(.at8pm))
        XCTAssertTrue(chips.contains(.at10pm))
        XCTAssertTrue(chips.contains(.anytime))
        XCTAssertTrue(chips.contains(.saturday))
    }

    func testAnytimeHasNoWindow() {
        XCTAssertNil(MapTimeChip.anytime.window(now: Date()))
        XCTAssertNil(MapTimeChip.anytime.probeTime(now: Date()))
    }
}
