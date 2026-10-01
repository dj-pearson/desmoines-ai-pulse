import XCTest
@testable import DesMoinesInsider

/// IOS-DD-DISCOVER-20: the share text for a swiping run's likes.
final class SwipeRecapTests: XCTestCase {

    func testEachPickHasItsTitleAndWebLink() {
        let event = Event(id: "e1", title: "Jazz in July", date: "2026-07-10T19:00:00-05:00")
        let restaurant = Restaurant(id: "r1", name: "Fong's Pizza")

        let text = SwipeRecap.shareText([.event(event), .restaurant(restaurant)])

        XCTAssertTrue(text.contains("Jazz in July"))
        XCTAssertTrue(text.contains("Fong's Pizza"))
        XCTAssertTrue(text.contains("/events/e1"))
        XCTAssertTrue(text.contains("/restaurants/r1"))
        XCTAssertTrue(text.hasPrefix("My Des Moines picks:"))
    }

    func testAtMostTenPicksAreListed() {
        let items = (1...12).map { SwipeItem.restaurant(Restaurant(id: "r\($0)", name: "Place \($0)")) }

        let lines = SwipeRecap.shareText(items)
            .split(separator: "\n")
            .filter { $0.hasPrefix("- ") }

        XCTAssertEqual(lines.count, 10)
    }
}
