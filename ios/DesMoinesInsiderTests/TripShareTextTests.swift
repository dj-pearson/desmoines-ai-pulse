import XCTest
@testable import DesMoinesInsider

/// IOS-DD-TRIP-PLANNER-07: share is plain text, built on the device.
final class TripShareTextTests: XCTestCase {
    private func item(_ id: String, day: Int, title: String, start: String?, location: String?) -> TripPlanItem {
        var fields = [#""item_id":"\#(id)""#, #""day_number":\#(day)"#, #""order_index":0"#, #""item_type":"custom""#, #""title":"\#(title)""#]
        if let start { fields.append(#""start_time":"\#(start)""#) }
        if let location { fields.append(#""location":"\#(location)""#) }
        let json = "{" + fields.joined(separator: ",") + "}"
        // swiftlint:disable:next force_try
        return try! JSONDecoder().decode(TripPlanItem.self, from: Data(json.utf8))
    }

    private func text() -> String {
        TripShareText.make(
            title: "A Des Moines weekend",
            startDate: "2026-10-03",
            itemsByDay: [
                2: [item("b", day: 2, title: "Brunch", start: nil, location: nil)],
                1: [item("a", day: 1, title: "Breakfast at Hessen Haus", start: "09:00:00", location: "101 Locust St")],
            ],
            locale: Locale(identifier: "en_US")
        )
    }

    func testDaysAreInOrder() throws {
        let s = text()
        let day1 = try XCTUnwrap(s.range(of: "Day 1"))
        let day2 = try XCTUnwrap(s.range(of: "Day 2"))
        XCTAssertLessThan(day1.lowerBound, day2.lowerBound)
        XCTAssertTrue(s.hasPrefix("A Des Moines weekend"))
    }

    func testStopLines() {
        let s = text()
        XCTAssertTrue(s.contains("9:00 AM  Breakfast at Hessen Haus - 101 Locust St"), s)
        XCTAssertTrue(s.contains("Time TBA  Brunch\n"), s)
        XCTAssertFalse(s.contains("Brunch - "), s)
    }

    func testSaysTheTimeZone() {
        XCTAssertTrue(text().contains("Central"))
    }
}
