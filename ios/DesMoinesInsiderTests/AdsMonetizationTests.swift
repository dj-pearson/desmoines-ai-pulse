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
          "reason": "Sponsored · Mexican",
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
    // MARK: IOS-DD-MONETIZATION-07 — track-ad-event contract

    /// Keys the edge function destructures (supabase/functions/track-ad-event).
    /// page_url and referrer_url are web-only.
    private static let trackAdEventKeys: Set<String> = [
        "kind", "campaign_id", "creative_id", "placement_type", "session_id",
        "client_event_id", "page_url", "referrer_url", "impression_id",
    ]

    func testTrackPayloadKeysMatchEdgeFunction() throws {
        let payload = AdTrackingService.TrackPayload(
            kind: "impression",
            campaign_id: UUID().uuidString,
            creative_id: UUID().uuidString,
            placement_type: "below_fold",
            session_id: "session_1",
            client_event_id: UUID().uuidString,
            impression_id: UUID().uuidString
        )
        let data = try JSONEncoder().encode(payload)
        let object = try XCTUnwrap(JSONSerialization.jsonObject(with: data) as? [String: Any])
        let keys = Set(object.keys)
        XCTAssertEqual(keys, [
            "kind", "campaign_id", "creative_id", "placement_type", "session_id",
            "client_event_id", "impression_id",
        ])
        XCTAssertTrue(keys.isSubset(of: Self.trackAdEventKeys),
                      "Every key must be one track-ad-event reads: \(keys.subtracting(Self.trackAdEventKeys))")
    }

    func testRowEnqueuedDuringFlushSurvives() {
        // "late" was appended while the flush awaited; only sent/dropped keys go.
        let remaining = AdTrackingService.remainingAfterFlush(["a", "b", "late"], done: ["a", "b"])
        XCTAssertEqual(remaining, ["late"])
        XCTAssertEqual(AdTrackingService.remainingAfterFlush(["a", "b"], done: ["a"]), ["b"],
                       "A row that failed stays queued")
    }

    // MARK: IOS-DD-MONETIZATION-08 — interstitial trigger

    func testInterstitialNeverAskedForProgrammaticOrPaid() {
        XCTAssertTrue(MainTabView.shouldAskForInterstitial(isFree: true, programmatic: false))
        XCTAssertFalse(MainTabView.shouldAskForInterstitial(isFree: true, programmatic: true),
                       "A deep link or Siri intent switching tabs is not the user browsing")
        XCTAssertFalse(MainTabView.shouldAskForInterstitial(isFree: false, programmatic: false),
                       "Paid tiers are ad-free")
    }

    // MARK: IOS-DD-MONETIZATION-09 — one unit per slot

    func testUnsoldSlotRotation() {
        XCTAssertEqual(AdBannerView.fallbackUnit(ordinal: 0, hasAffiliate: true), .affiliate)
        XCTAssertEqual(AdBannerView.fallbackUnit(ordinal: 1, hasAffiliate: true), .affiliate)
        XCTAssertEqual(AdBannerView.fallbackUnit(ordinal: 2, hasAffiliate: true), .house)
        XCTAssertEqual(AdBannerView.fallbackUnit(ordinal: 0, hasAffiliate: false), .house)
    }

    // MARK: IOS-DD-MONETIZATION-10 — house ads sell only what exists

    func testHouseAdCopySellsNothingUnoffered() {
        let banned = ["advanced filter", "insider tip", "across all your devices", "journalism"]
        for copy in HouseAdCopy.all {
            let text = (copy.subhead + " " + copy.cta).lowercased()
            for phrase in banned {
                XCTAssertFalse(text.contains(phrase), "\(copy.id) sells '\(phrase)'")
            }
        }
    }

    func testHouseAdsOpenTheirOwnPaywall() {
        let contexts = Dictionary(uniqueKeysWithValues: HouseAdCopy.all.map { ($0.id, $0.context.id) })
        XCTAssertEqual(contexts["ad_free"], PaywallContext.adFree.id)
        XCTAssertEqual(contexts["trip_planner"], PaywallContext.tripPlanner.id)
        XCTAssertEqual(contexts["unlimited_saves"], PaywallContext.unlimitedFavorites.id)
    }

    // MARK: IOS-DD-MONETIZATION-19 — sponsored picks open natively

    func testSponsoredPickOpensNativeDetail() {
        func pick(_ type: String) -> SponsoredPickService.SponsoredPick {
            SponsoredPickService.SponsoredPick(
                itemType: type, itemId: "id-1", title: "T", reason: "Sponsored", imageUrl: nil, campaignId: "c"
            )
        }
        XCTAssertEqual(SponsoredPickCard.presentation(for: pick("event"))?.id, "event-id-1")
        XCTAssertEqual(SponsoredPickCard.presentation(for: pick("restaurant"))?.id, "restaurant-id-1")
        XCTAssertNil(SponsoredPickCard.presentation(for: pick("hotel")))
    }
}
