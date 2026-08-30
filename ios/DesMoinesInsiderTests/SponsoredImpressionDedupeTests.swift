import XCTest
@testable import DesMoinesInsider

/// IOS-AUDIT-TEST-003 AC2 - impression dedupe for get-sponsored-pick.
///
/// The dedupe key is COMPOSED from the same two fields get-sponsored-pick uses
/// to build SponsoredPick.id, so a rename on either side stops de-duplicating
/// and every re-appearance of a listing counts as a fresh impression. That is a
/// billing surface going silently wrong, which is why it is worth a test rather
/// than a comment.
///
/// These run against a private AdTrackingService instance rather than .shared,
/// so one test cannot burn a key another test asserts on.
@MainActor
final class SponsoredImpressionDedupeTests: XCTestCase {

    private var suite: UserDefaults!
    private var suiteName: String!
    private var savedConsent: Any?

    override func setUp() {
        super.setUp()
        suiteName = "SponsoredImpressionDedupeTests.\(UUID().uuidString)"
        suite = UserDefaults(suiteName: suiteName)
        savedConsent = UserDefaults.standard.object(forKey: "gdpr_consent_analytics")
        ConsentService.shared.analyticsConsent = true
    }

    override func tearDown() {
        suite.removePersistentDomain(forName: suiteName)
        if let savedConsent {
            UserDefaults.standard.set(savedConsent, forKey: "gdpr_consent_analytics")
        } else {
            UserDefaults.standard.removeObject(forKey: "gdpr_consent_analytics")
        }
        super.tearDown()
    }

    private func makeService() -> AdTrackingService {
        AdTrackingService(testDefaults: suite)
    }

    private func pick(itemType: String = "event", itemId: String = "e1") throws -> SponsoredPickService.SponsoredPick {
        let json = """
        {"itemType":"\(itemType)","itemId":"\(itemId)","title":"Jazz at Noce",
         "reason":"Because you like live music","imageUrl":null,"campaignId":"camp_1"}
        """
        return try JSONDecoder().decode(
            SponsoredPickService.SponsoredPick.self,
            from: Data(json.utf8)
        )
    }

    func testTheSameListingSeenTwiceIsCountedOnce() throws {
        let service = makeService()
        let pick = try pick()

        service.logSponsoredImpression(listingType: pick.itemType, listingId: pick.itemId, placement: "ask_pulse")
        service.logSponsoredImpression(listingType: pick.itemType, listingId: pick.itemId, placement: "ask_pulse")

        XCTAssertEqual(service.sponsoredImpressionKeyCountForTesting, 1)
    }

    func testADifferentListingIdIsADifferentImpression() throws {
        let service = makeService()

        service.logSponsoredImpression(listingType: "event", listingId: try pick(itemId: "e1").itemId)
        service.logSponsoredImpression(listingType: "event", listingId: try pick(itemId: "e2").itemId)

        XCTAssertEqual(service.sponsoredImpressionKeyCountForTesting, 2)
    }

    func testADifferentItemTypeIsADifferentImpression() throws {
        let service = makeService()

        // An event and a restaurant can share an id across tables, so itemType
        // has to be part of the key - the same reason SponsoredPick.id includes it.
        service.logSponsoredImpression(listingType: "event", listingId: "shared-id")
        service.logSponsoredImpression(listingType: "restaurant", listingId: "shared-id")

        XCTAssertEqual(service.sponsoredImpressionKeyCountForTesting, 2)
    }

    func testTheSameListingOnTwoSurfacesCountsTwice() throws {
        let service = makeService()
        let pick = try pick()

        // Placement is part of the key on purpose: a pick shown on Ask Pulse and
        // again on Surprise Me is two placements the advertiser paid for.
        service.logSponsoredImpression(listingType: pick.itemType, listingId: pick.itemId, placement: "ask_pulse")
        service.logSponsoredImpression(listingType: pick.itemType, listingId: pick.itemId, placement: "surprise_me")

        XCTAssertEqual(service.sponsoredImpressionKeyCountForTesting, 2)
    }

    func testTheKeyMatchesTheIdentityTheServerSends() throws {
        // Ties the dedupe to the contract: SponsoredPick.id is built from the
        // same pair. If one moves without the other, this fails.
        let pick = try pick(itemType: "restaurant", itemId: "r7")
        XCTAssertEqual(pick.id, "restaurant-r7")

        let service = makeService()
        service.logSponsoredImpression(listingType: "restaurant", listingId: "r7")
        service.logSponsoredImpression(listingType: pick.itemType, listingId: pick.itemId)

        XCTAssertEqual(service.sponsoredImpressionKeyCountForTesting, 1)
    }

    func testARefusedImpressionDoesNotBurnTheKey() throws {
        let service = makeService()
        let pick = try pick()

        ConsentService.shared.analyticsConsent = false
        service.logSponsoredImpression(listingType: pick.itemType, listingId: pick.itemId)
        XCTAssertEqual(service.sponsoredImpressionKeyCountForTesting, 0)

        // Accepting mid-session must not leave this listing permanently unlogged.
        ConsentService.shared.analyticsConsent = true
        service.logSponsoredImpression(listingType: pick.itemType, listingId: pick.itemId)
        XCTAssertEqual(service.sponsoredImpressionKeyCountForTesting, 1)
    }
}
