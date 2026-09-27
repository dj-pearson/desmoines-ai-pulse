import XCTest
@testable import DesMoinesInsider

/// IOS-DD-TRIP-PLANNER-09/13: trip days and stop times are Des Moines
/// wall-clock values whatever zone the phone is in.
final class TripScheduleTests: XCTestCase {
    private var savedTimeZone: TimeZone!
    private let enUS = Locale(identifier: "en_US")

    override func setUp() {
        super.setUp()
        savedTimeZone = NSTimeZone.default
        // A phone in Mountain time: an hour off Central all year.
        NSTimeZone.default = TimeZone(identifier: "America/Denver")!
    }

    override func tearDown() {
        NSTimeZone.default = savedTimeZone
        super.tearDown()
    }

    private func item(_ id: String, day: Int, order: Int, start: String?, end: String? = nil, minutes: Int? = nil) -> TripPlanItem {
        var fields = [#""item_id":"\#(id)""#, #""day_number":\#(day)"#, #""order_index":\#(order)"#, #""item_type":"custom""#]
        if let start { fields.append(#""start_time":"\#(start)""#) }
        if let end { fields.append(#""end_time":"\#(end)""#) }
        if let minutes { fields.append(#""duration_minutes":\#(minutes)"#) }
        let json = "{" + fields.joined(separator: ",") + "}"
        // swiftlint:disable:next force_try
        return try! JSONDecoder().decode(TripPlanItem.self, from: Data(json.utf8))
    }

    private func iso(_ s: String) -> Date {
        ISO8601DateFormatter().date(from: s)!
    }

    func testStopTimeIsCentralNotTheDeviceZone() throws {
        let start = try XCTUnwrap(TripSchedule.tripDay("2026-10-03"))
        let windows = TripSchedule.calendarWindows(tripStart: start, items: [item("a", day: 1, order: 0, start: "18:00:00")])
        XCTAssertEqual(windows.first?.start, iso("2026-10-03T23:00:00Z"))
        XCTAssertEqual(windows.first?.end, iso("2026-10-04T00:00:00Z"), "no end_time or duration: 60 minutes")
    }

    func testEndTimeIsUsedWhenItParses() throws {
        let start = try XCTUnwrap(TripSchedule.tripDay("2026-10-03"))
        let windows = TripSchedule.calendarWindows(
            tripStart: start,
            items: [item("a", day: 1, order: 0, start: "18:00:00", end: "19:30:00", minutes: 45)]
        )
        let w = try XCTUnwrap(windows.first)
        XCTAssertEqual(w.end.timeIntervalSince(w.start), 90 * 60)
    }

    func testAfterMidnightStopRollsToTheNextDay() throws {
        let start = try XCTUnwrap(TripSchedule.tripDay("2026-10-03"))
        let windows = TripSchedule.calendarWindows(tripStart: start, items: [
            item("show", day: 1, order: 0, start: "22:00"),
            item("late", day: 1, order: 1, start: "00:30"),
        ])
        XCTAssertEqual(windows.count, 2)
        XCTAssertEqual(windows[1].start, iso("2026-10-04T05:30:00Z"))
    }

    func testUnparseableTimeIsOmitted() throws {
        let start = try XCTUnwrap(TripSchedule.tripDay("2026-10-03"))
        let windows = TripSchedule.calendarWindows(tripStart: start, items: [
            item("a", day: 1, order: 0, start: "abc"),
            item("b", day: 1, order: 1, start: nil),
            item("c", day: 1, order: 2, start: "09:00"),
        ])
        XCTAssertEqual(windows.map(\.item.itemId), ["c"])
    }

    func testDayTitleNamesTheDate() {
        let title = TripSchedule.dayTitle(day: 2, tripStart: "2026-10-03", locale: enUS)
        XCTAssertTrue(title.hasPrefix("Day 2 - "), title)
        XCTAssertTrue(title.contains("Oct 4"), title)
        XCTAssertEqual(TripSchedule.dayTitle(day: 3, tripStart: "not a date"), "Day 3")
    }

    func testTimeRange() {
        let range = TripSchedule.timeRange(start: "10:30:00", end: "11:45:00", locale: enUS)
        XCTAssertNotNil(range)
        XCTAssertTrue(range?.contains("10:30") ?? false, range ?? "")
        XCTAssertTrue(range?.contains("11:45") ?? false, range ?? "")
        XCTAssertNil(TripSchedule.timeRange(start: nil, end: nil))
    }

    func testTimeDisplayIsPlainSpaced() {
        XCTAssertEqual(TripSchedule.timeDisplay("14:30:00", locale: enUS), "2:30 PM")
    }
}
