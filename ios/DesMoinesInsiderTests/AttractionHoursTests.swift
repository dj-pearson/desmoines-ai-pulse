import XCTest
@testable import DesMoinesInsider

/// IOS-DD-BROWSE-10: attractions.hours, ported from src/lib/attractionHours.ts.
/// Saturday 2026-10-03 is the reference day; every time is Central.
final class AttractionHoursTests: XCTestCase {

    private func ct(_ day: Int, _ hour: Int, _ minute: Int = 0) -> Date {
        DesMoinesTime.calendar.date(from: DateComponents(year: 2026, month: 10, day: day, hour: hour, minute: minute))!
    }

    private func week(_ json: String) throws -> AttractionHours.Week {
        try JSONDecoder().decode(AttractionHours.Week.self, from: Data(json.utf8))
    }

    private let nineToFive = #"{"open":"09:00","close":"17:00"}"#

    // MARK: parseClock

    func testParseClock() {
        XCTAssertEqual(AttractionHours.parseClock("09:00"), 540)
        XCTAssertEqual(AttractionHours.parseClock("9:00"), 540)
        XCTAssertEqual(AttractionHours.parseClock("17:30"), 1050)
        XCTAssertEqual(AttractionHours.parseClock("24:00"), 1440)
        XCTAssertEqual(AttractionHours.parseClock("9am"), 540)
        XCTAssertEqual(AttractionHours.parseClock("9:30 PM"), 1290)
        XCTAssertEqual(AttractionHours.parseClock("12am"), 0)
        XCTAssertNil(AttractionHours.parseClock("noon"))
        XCTAssertNil(AttractionHours.parseClock("9"))
        XCTAssertNil(AttractionHours.parseClock("25:00"))
    }

    // MARK: status

    func testOpenSaturdayMorning() throws {
        let w = try week(#"{"sat":\#(nineToFive)}"#)
        guard case .open = AttractionHours.status(week: w, at: ct(3, 10)) else {
            return XCTFail("expected open")
        }
    }

    func testClosingSoonAt1630() throws {
        let w = try week(#"{"sat":\#(nineToFive)}"#)
        guard case .closingSoon = AttractionHours.status(week: w, at: ct(3, 16, 30)) else {
            return XCTFail("expected closing soon")
        }
    }

    func testMissingDayDropsTheNextOpening() throws {
        // Every day but Wednesday; closed Saturday evening. The next opening
        // could be on the day nobody entered, so it is not named.
        let days = ["mon", "tue", "thu", "fri", "sat", "sun"].map { "\"\($0)\":\(nineToFive)" }.joined(separator: ",")
        let w = try week("{\(days)}")
        XCTAssertEqual(AttractionHours.status(week: w, at: ct(3, 18)), .closed(nextOpensAt: nil))
    }

    func testCompleteWeekNamesTheNextOpening() throws {
        let days = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"].map { "\"\($0)\":\(nineToFive)" }.joined(separator: ",")
        let w = try week("{\(days)}")
        XCTAssertEqual(AttractionHours.status(week: w, at: ct(3, 18)), .closed(nextOpensAt: "tomorrow 9 AM"))
    }

    func testUnknownWhenTodayIsMissing() throws {
        let w = try week(#"{"mon":\#(nineToFive)}"#)
        XCTAssertEqual(AttractionHours.status(week: w, at: ct(3, 10)), .unknown)
    }

    func testUnknownWithNoHours() {
        XCTAssertEqual(AttractionHours.status(week: nil, at: ct(3, 10)), .unknown)
    }

    func testClosedStringIsClosed() throws {
        let w = try week(#"{"mon":"closed"}"#)
        // 2026-10-05 is a Monday.
        XCTAssertEqual(AttractionHours.status(week: w, at: ct(5, 12)), .closed(nextOpensAt: nil))
    }

    func testOvernightFridayIsOpenEarlySaturday() throws {
        let w = try week(#"{"fri":{"open":"18:00","close":"02:00"}}"#)
        XCTAssertTrue(AttractionHours.status(week: w, at: ct(3, 1)).isOpen)
    }

    // MARK: decoding

    func testOneMalformedDayKeepsTheOthers() throws {
        let w = try week(#"{"mon":\#(nineToFive),"tue":{"open":"whenever"},"wed":42,"thu":false,"fri":{"closed":true},"sat":null}"#)
        XCTAssertEqual(w.value(for: "mon"), .open(open: "09:00", close: "17:00"))
        XCTAssertEqual(w.value(for: "tue"), .missing)
        XCTAssertEqual(w.value(for: "wed"), .missing)
        XCTAssertEqual(w.value(for: "thu"), .closed)
        XCTAssertEqual(w.value(for: "fri"), .closed)
        XCTAssertEqual(w.value(for: "sat"), .closed)
        XCTAssertEqual(w.value(for: "sun"), .missing)
    }

    func testWeeklyRowsStartMondayAndMarkToday() throws {
        let w = try week(#"{"sat":\#(nineToFive),"sun":"closed"}"#)
        let rows = AttractionHours.weeklyRows(w, now: ct(3, 10))
        XCTAssertEqual(rows.map(\.label).first, "Monday")
        XCTAssertEqual(rows.count, 7)
        XCTAssertEqual(rows.first { $0.isToday }?.label, "Saturday")
        XCTAssertEqual(rows.first { $0.label == "Saturday" }?.text, "9 AM - 5 PM")
        XCTAssertEqual(rows.first { $0.label == "Sunday" }?.text, "Closed")
        XCTAssertNil(rows.first { $0.label == "Monday" }?.text)
    }
}
