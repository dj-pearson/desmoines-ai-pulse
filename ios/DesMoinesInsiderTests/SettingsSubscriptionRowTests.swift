import XCTest
@testable import DesMoinesInsider

/// Settings > Account > Subscription presents PlansLinkView, which picks the
/// screen with PlansLinkScreen (IOS-AUDIT-011). It always opened the StoreKit
/// store, where a web or Google Play subscriber could buy a second plan.
/// vitest iosSubscriptionStoreEntry.test.ts checks that SettingsView presents
/// PlansLinkView and not SubscriptionView; these check what that view shows.
final class SettingsSubscriptionRowTests: XCTestCase {

    func testFreeUserGetsTheStore() {
        XCTAssertEqual(PlansLinkScreen.screen(tier: .free, hasAppStoreSubscription: false), .store)
    }

    func testAppStoreSubscriberGetsTheStoreToChangeTheirPlan() {
        XCTAssertEqual(PlansLinkScreen.screen(tier: .insider, hasAppStoreSubscription: true), .store)
        XCTAssertEqual(PlansLinkScreen.screen(tier: .vip, hasAppStoreSubscription: true), .store)
    }

    func testWebOrPlaySubscriberIsToldWhereThePlanIsBilled() {
        // No App Store subscription, but a paid tier from Stripe or Google
        // Play: the store would sell them a duplicate plan.
        XCTAssertEqual(PlansLinkScreen.screen(tier: .insider, hasAppStoreSubscription: false), .planInfo)
        XCTAssertEqual(PlansLinkScreen.screen(tier: .vip, hasAppStoreSubscription: false), .planInfo)
    }
}
