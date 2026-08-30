import XCTest
@testable import DesMoinesInsider

/// Pure-logic coverage for the IOS-ADS-014/015/016 monetization work. The
/// network-bound + SwiftUI pieces (viewability gate, offline flush, sponsored
/// rendering) are exercised by the macOS build + UI tests in CI; these lock the
/// cross-platform contracts that are cheap to assert in isolation.
@MainActor
final class AdsMonetizationTests: XCTestCase {

    // MARK: IOS-ADS-014 — inventory-class payload contract

    func testInventoryClassRawValuesMatchAnalyticsContract() {
        XCTAssertEqual(AdTrackingService.AdInventoryClass.paidCampaign.rawValue, "paid_campaign")
        XCTAssertEqual(AdTrackingService.AdInventoryClass.affiliate.rawValue, "affiliate")
        XCTAssertEqual(AdTrackingService.AdInventoryClass.sponsoredListing.rawValue, "sponsored_listing")
        XCTAssertEqual(AdTrackingService.AdInventoryClass.houseAd.rawValue, "house_ad")
    }

    // MARK: IOS-ADS-015 — surface keys must match the edge function

    func testSponsoredSurfaceRawValuesMatchEdgeFunction() {
        XCTAssertEqual(SponsoredPickService.Surface.askPulse.rawValue, "ask_pulse")
        XCTAssertEqual(SponsoredPickService.Surface.surpriseMe.rawValue, "surprise_me")
        XCTAssertEqual(SponsoredPickService.Surface.tripPlanner.rawValue, "trip_planner")
    }

    func testSurpriseMeCadenceNeverFiresOnFirstRoll() {
        // Cadence is "every Nth roll", so the first roll (count 1) is never sponsored.
        XCTAssertGreaterThan(AdConfig.surpriseMeSponsoredEveryNthRoll, 1)
        XCTAssertNotEqual(1 % AdConfig.surpriseMeSponsoredEveryNthRoll, 0)
    }

    func testSponsoredPickDecodesEdgeFunctionShape() throws {
        let json = """
        {
          "itemType": "restaurant",
          "itemId": "abc-123",
          "title": "Tacos El Sol",
          "reason": "A sponsored mexican spot locals are loving",
          "imageUrl": null,
          "campaignId": "camp-9"
        }
        """.data(using: .utf8)!
        let pick = try JSONDecoder().decode(SponsoredPickService.SponsoredPick.self, from: json)
        XCTAssertEqual(pick.itemType, "restaurant")
        XCTAssertEqual(pick.itemId, "abc-123")
        XCTAssertEqual(pick.campaignId, "camp-9")
        XCTAssertNil(pick.imageUrl)
        XCTAssertEqual(pick.id, "restaurant-abc-123")
    }

    // MARK: IOS-ADS-016 — advertiser portal deep-link

    func testAdvertiseURLForEventPrefillsListing() {
        let url = BusinessPromotion.advertiseURL(for: .event(id: "e1", name: "Jazz in the Park"))
        let comps = URLComponents(url: url, resolvingAgainstBaseURL: false)
        XCTAssertEqual(comps?.path, "/advertise")
        let items = Dictionary(uniqueKeysWithValues: (comps?.queryItems ?? []).map { ($0.name, $0.value) })
        XCTAssertEqual(items["listingType"] ?? nil, "event")
        XCTAssertEqual(items["listingId"] ?? nil, "e1")
        XCTAssertEqual(items["listingName"] ?? nil, "Jazz in the Park")
    }

    func testAdvertiseURLForRestaurantPrefillsListing() {
        let url = BusinessPromotion.advertiseURL(for: .restaurant(id: "r9", name: "Centro"))
        let comps = URLComponents(url: url, resolvingAgainstBaseURL: false)
        let items = Dictionary(uniqueKeysWithValues: (comps?.queryItems ?? []).map { ($0.name, $0.value) })
        XCTAssertEqual(items["listingType"] ?? nil, "restaurant")
        XCTAssertEqual(items["listingId"] ?? nil, "r9")
    }

    func testAdvertiseURLWithoutListingHasNoQuery() {
        let url = BusinessPromotion.advertiseURL(for: nil)
        let comps = URLComponents(url: url, resolvingAgainstBaseURL: false)
        XCTAssertEqual(comps?.path, "/advertise")
        XCTAssertTrue((comps?.queryItems ?? []).isEmpty)
    }
}
