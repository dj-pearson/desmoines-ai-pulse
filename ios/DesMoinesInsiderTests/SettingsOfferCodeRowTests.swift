import XCTest
@testable import DesMoinesInsider

/// Settings > Account > Redeem Offer Code is shown only where the store is
/// (IOS-AUDIT-012). It was shown to every signed-in user, and an App Store
/// offer code redeemed by someone billed through Stripe or Google Play starts
/// a second, App Store-billed plan. vitest iosSubscriptionStoreEntry.test.ts
/// checks that SettingsView gates the row on this; these check the rule.
final class SettingsOfferCodeRowTests: XCTestCase {

    private func offersCode(_ tier: SubscriptionTier, appStore: Bool) -> Bool {
        PlansLinkScreen.screen(tier: tier, hasAppStoreSubscription: appStore).offersCodeRedemption
    }

    func testFreeUserCanRedeemACode() {
        XCTAssertTrue(offersCode(.free, appStore: false))
    }

    func testAppStoreSubscriberCanRedeemACode() {
        // A code changes or extends the plan the App Store already bills.
        XCTAssertTrue(offersCode(.insider, appStore: true))
        XCTAssertTrue(offersCode(.vip, appStore: true))
    }

    func testWebOrPlaySubscriberIsNotOfferedACode() {
        XCTAssertFalse(offersCode(.insider, appStore: false))
        XCTAssertFalse(offersCode(.vip, appStore: false))
    }

    func testTheRuleFollowsTheScreen() {
        XCTAssertTrue(PlansLinkScreen.store.offersCodeRedemption)
        XCTAssertFalse(PlansLinkScreen.planInfo.offersCodeRedemption)
    }
}
