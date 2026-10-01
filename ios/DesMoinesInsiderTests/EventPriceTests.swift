import XCTest
@testable import DesMoinesInsider

/// IOS-DD-EVENTS-06: one definition of free, the web's fixtures
/// (src/lib/eventPrice.ts isFreePrice).
final class EventPriceTests: XCTestCase {

    func testFree() {
        XCTAssertEqual(Event.isFreePrice("Free"), true)
        XCTAssertEqual(Event.isFreePrice("FREE admission"), true)
        XCTAssertEqual(Event.isFreePrice("$0"), true)
        XCTAssertEqual(Event.isFreePrice("0"), true)
    }

    func testNotFree() {
        XCTAssertEqual(Event.isFreePrice("$0-$25"), false)
        XCTAssertEqual(Event.isFreePrice("$25; kids under 5 free"), false)
        XCTAssertEqual(Event.isFreePrice("Free parking, $40 tickets"), false)
        XCTAssertEqual(Event.isFreePrice("$15"), false)
    }

    func testNotListedIsNotFree() {
        XCTAssertNil(Event.isFreePrice(nil))
        XCTAssertNil(Event.isFreePrice(""))
        XCTAssertNil(Event.isFreePrice("   "))
    }
}
