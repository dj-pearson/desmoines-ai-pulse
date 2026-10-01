import XCTest
@testable import DesMoinesInsider

/// IOS-DD-DISCOVER-10: a swipe card's date is the Des Moines day with its
/// start time, and the card says Free and how soon.
///
/// The subtitle formatted in the device zone with no time, so an 11:30 PM
/// Saturday show read "Sun" on a phone set to Eastern.
final class SwipeItemFormattingTests: XCTestCase {

    private var savedZone: TimeZone!

    override func setUp() {
        super.setUp()
        savedZone = NSTimeZone.default
        NSTimeZone.default = TimeZone(identifier: "America/New_York")!
    }

    override func tearDown() {
        NSTimeZone.default = savedZone
        super.tearDown()
    }

    func testTheSubtitleIsTheDesMoinesDayAndTime() {
        let event = Event(id: "e1", title: "Late show", date: "2026-09-26T23:30:00-05:00")

        let subtitle = SwipeItem.event(event).subtitle

        XCTAssertTrue(subtitle.contains("Sat"), subtitle)
        XCTAssertFalse(subtitle.contains("Sun"), subtitle)
        XCTAssertTrue(subtitle.contains("11:30"), subtitle)
    }

    func testAnUntimedEventSaysTimeTBA() {
        var event = Event(id: "e2", title: "Market", date: "2026-09-26T12:00:00-05:00")
        event.timeTbd = true

        XCTAssertTrue(SwipeItem.event(event).subtitle.contains("Time TBA"))
    }

    func testAFreeEventCarriesAFreeBadge() {
        var event = Event(id: "e3", title: "Concert in the park", date: "2030-06-01T19:00:00-05:00")
        event.price = "Free"

        XCTAssertTrue(SwipeItem.event(event).badges.contains("Free"))
    }

    func testARestaurantWithNoHoursHasNoBadge() {
        // Unknown hours say nothing rather than guess.
        let restaurant = Restaurant(id: "r1", name: "Somewhere")

        XCTAssertEqual(SwipeItem.restaurant(restaurant).badges, [])
    }
}
