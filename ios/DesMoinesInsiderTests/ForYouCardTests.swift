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

    // MARK: - Sponsored label (WEB-FEAT-034)

    private func decode(_ extra: String) throws -> ForYouService.Recommendation {
        let json = #"{"id":"6f1c2c1e-6a1b-4c9e-9f0a-2b7f1d3c4e5a","title":"Jazz in July","venue":"Wooly's""# + extra + "}"
        return try JSONDecoder().decode(ForYouService.Recommendation.self, from: Data(json.utf8))
    }

    func testV2RowDecodesTheSponsoredFlags() throws {
        let rec = try decode(#","is_sponsored":true,"sponsored_until":"2099-01-01T00:00:00Z""#)
        XCTAssertEqual(rec.isSponsored, true)
        XCTAssertEqual(rec.sponsoredUntil, "2099-01-01T00:00:00Z")
        XCTAssertTrue(rec.isActivelySponsored())
    }

    func testV1AndTrendingRowsCarryNoFlagsAndStayUnlabelled() throws {
        let rec = try decode("")
        XCTAssertNil(rec.isSponsored)
        XCTAssertFalse(rec.isActivelySponsored())
        XCTAssertEqual(ForYouCard.accessibilityText(for: rec), "Jazz in July. Wooly's")
    }

    func testVoiceOverLeadsWithSponsoredWhileTheSponsorshipRuns() throws {
        let rec = try decode(#","is_sponsored":true,"sponsored_until":null"#)
        XCTAssertEqual(ForYouCard.accessibilityText(for: rec), "Sponsored. Jazz in July. Wooly's")
    }

    func testALapsedSponsorshipDropsTheLabel() throws {
        let rec = try decode(#","is_sponsored":true,"sponsored_until":"2026-11-01T00:00:00Z""#)
        let after = ISO8601DateFormatter().date(from: "2026-11-15T00:00:00Z")!
        let before = ISO8601DateFormatter().date(from: "2026-10-15T00:00:00Z")!
        XCTAssertFalse(rec.isActivelySponsored(now: after))
        XCTAssertEqual(ForYouCard.accessibilityText(for: rec, now: after), "Jazz in July. Wooly's")
        XCTAssertTrue(rec.isActivelySponsored(now: before))
    }

    func testAnUnsponsoredV2RowIsNotLabelled() throws {
        let rec = try decode(#","is_sponsored":false,"sponsored_until":null"#)
        XCTAssertFalse(rec.isActivelySponsored())
    }
}
