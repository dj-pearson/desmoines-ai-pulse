import XCTest
@testable import DesMoinesInsider

/// IOS-AUDIT-TEST-003 -- response-envelope contracts for the AI and monetization
/// edge functions.
///
/// These decode with a DEFAULT JSONDecoder and camelCase fixtures because that
/// is exactly what production does: no keyDecodingStrategy is set anywhere in
/// the app, and supabase-swift's functions client decodes with a plain decoder.
/// A fixture written in snake_case would pass a test that production fails.
///
/// The failure this locks down is specific: a renamed or removed field in an
/// edge function does not break the build, does not throw at the call site in
/// any visible way, and reaches a shipped binary that then silently shows an
/// empty screen. version-check and validate-ios-receipt were already covered;
/// these are the other three.
final class EdgeContractTests: XCTestCase {

    private func decode<T: Decodable>(_ type: T.Type, _ json: String) throws -> T {
        try JSONDecoder().decode(type, from: Data(json.utf8))
    }

    // MARK: - discover-chat

    func testDiscoverChatEnvelopeDecodes() throws {
        let json = """
        {
          "picks": [
            {"itemType": "event", "itemId": "e1", "reason": "Live jazz tonight"},
            {"itemType": "restaurant", "itemId": "r1", "reason": "Two blocks away"}
          ],
          "followUpSuggestions": ["something quieter", "cheaper options"],
          "usage": {"remaining": 4, "tier": "free"}
        }
        """
        let response = try decode(AskPulseService.Response.self, json)

        XCTAssertEqual(response.picks.count, 2)
        XCTAssertEqual(response.picks.first?.itemType, .event)
        XCTAssertEqual(response.followUpSuggestions, ["something quieter", "cheaper options"])
        XCTAssertEqual(response.usage?.remaining.displayString, "4 left today")
    }

    func testDiscoverChatAcceptsUnlimitedAsAString() throws {
        // The backend sends either an Int or the literal "unlimited" for the same
        // field. A decoder that only handled one would fail for exactly one tier.
        let json = """
        {"picks": [], "followUpSuggestions": [], "usage": {"remaining": "unlimited", "tier": "vip"}}
        """
        let response = try decode(AskPulseService.Response.self, json)
        XCTAssertEqual(response.usage?.remaining.displayString, "unlimited")
    }

    func testDiscoverChatSurvivesAMissingUsageBlock() throws {
        // usage is optional in the envelope, so an older function version that
        // omits it must still yield picks rather than throwing.
        let json = """
        {"picks": [{"itemType": "attraction", "itemId": "a1", "reason": "Indoors"}],
         "followUpSuggestions": []}
        """
        let response = try decode(AskPulseService.Response.self, json)
        XCTAssertEqual(response.picks.count, 1)
        XCTAssertNil(response.usage)
    }

    func testDiscoverChatRejectsAnUnknownItemType() {
        // ItemType is a closed enum. A new server-side type must fail loudly
        // here rather than reaching a switch that silently renders nothing.
        let json = """
        {"picks": [{"itemType": "hotel", "itemId": "h1", "reason": "x"}], "followUpSuggestions": []}
        """
        XCTAssertThrowsError(try decode(AskPulseService.Response.self, json))
    }

    // MARK: - get-sponsored-pick

    func testSponsoredPickDecodes() throws {
        let json = """
        {
          "itemType": "restaurant",
          "itemId": "r-42",
          "title": "Zombie Burger",
          "reason": "Sponsored by the restaurant",
          "imageUrl": "https://example.com/z.jpg",
          "campaignId": "c-7"
        }
        """
        let pick = try decode(SponsoredPickService.SponsoredPick.self, json)

        XCTAssertEqual(pick.itemId, "r-42")
        XCTAssertEqual(pick.campaignId, "c-7")
        // The id the ad-tracking dedupe keys on. If itemType or itemId is
        // renamed, this composite silently changes and every impression is
        // counted as a new one.
        XCTAssertEqual(pick.id, "restaurant-r-42")
    }

    func testSponsoredPickAllowsAMissingImage() throws {
        let json = """
        {"itemType": "event", "itemId": "e1", "title": "T", "reason": "R", "campaignId": "c1"}
        """
        XCTAssertNil(try decode(SponsoredPickService.SponsoredPick.self, json).imageUrl)
    }

    func testSponsoredPickRequiresTheCampaignId() {
        // Without it nothing can be billed or attributed, so a response missing
        // it must not decode into a renderable pick.
        let json = """
        {"itemType": "event", "itemId": "e1", "title": "T", "reason": "R"}
        """
        XCTAssertThrowsError(try decode(SponsoredPickService.SponsoredPick.self, json))
    }

    // MARK: - generate-itinerary

    func testItineraryFailureEnvelopeDecodes() throws {
        // The failure path is the one that matters: generate() reads `success`
        // and `error` to decide whether to throw, so a rename here turns a
        // reported failure into a silent empty trip.
        let json = """
        {"success": false, "error": "Model timed out"}
        """
        let response = try decode(TripPlannerService.GenerateResponse.self, json)

        XCTAssertFalse(response.success)
        XCTAssertEqual(response.error, "Model timed out")
        XCTAssertNil(response.tripPlan)
    }

    func testItinerarySuccessEnvelopeRequiresSuccessFlag() {
        // `success` is non-optional. A function that stops sending it fails here
        // rather than at the guard in generate(), which reads it as false and
        // throws generationFailed(nil) - an error with no message.
        let json = """
        {"error": null}
        """
        XCTAssertThrowsError(try decode(TripPlannerService.GenerateResponse.self, json))
    }
}
