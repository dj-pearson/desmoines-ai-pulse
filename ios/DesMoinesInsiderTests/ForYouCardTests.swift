import XCTest
@testable import DesMoinesInsider

/// IOS-DD-EVENTS-20: the For You / Trending card's text.
final class ForYouCardTests: XCTestCase {

    func testTrendingNowIsNotRepeatedUnderItsOwnHeader() {
        XCTAssertNil(ForYouCard.visibleReason("Trending now"))
        XCTAssertNil(ForYouCard.visibleReason(nil))
    }

    func testARealReasonIsShown() {
        XCTAssertEqual(ForYouCard.visibleReason("Because you liked Music"), "Because you liked Music")
    }

    func testSecondaryLineWithVenueOnly() {
        XCTAssertEqual(ForYouCard.secondaryLine(date: nil, venue: "Wooly's"), "Wooly's")
    }

    func testSecondaryLineIsNilWithNothingToSay() {
        XCTAssertNil(ForYouCard.secondaryLine(date: nil, venue: "  "))
    }

    func testSecondaryLineJoinsDateAndVenue() {
        let line = ForYouCard.secondaryLine(date: "2026-10-04T00:00:00Z", venue: "Wooly's")
        XCTAssertNotNil(line)
        XCTAssertTrue(line?.hasSuffix(" - Wooly's") == true, line ?? "")
    }
}
