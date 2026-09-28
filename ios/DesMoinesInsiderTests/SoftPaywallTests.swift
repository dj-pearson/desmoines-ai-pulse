import XCTest
@testable import DesMoinesInsider

/// IOS-DD-MONETIZATION-13: the soft favorites paywall said "reached the free
/// limit of 3" after the second save, and a soft paywall requested from inside
/// a sheet burned the frequency cap without ever appearing.
@MainActor
final class SoftPaywallTests: XCTestCase {
    private var suiteName: String!
    private var defaults: UserDefaults!

    override func setUp() {
        super.setUp()
        suiteName = "SoftPaywallTests.\(UUID().uuidString)"
        defaults = UserDefaults(suiteName: suiteName)
        defaults.set(true, forKey: "hasCompletedOnboarding")
    }

    override func tearDown() {
        defaults.removePersistentDomain(forName: suiteName)
        defaults = nil
        super.tearDown()
    }

    func testProgressNudgeStatesUsage() {
        let context = PaywallContext.favoritesProgress(used: 2)
        XCTAssertTrue(context.subheadline.contains("2 of 3"), context.subheadline)
        XCTAssertEqual(context.id, "favorites_soft")
    }

    func testAtLimitCopyUsesTheRealLimit() {
        XCTAssertTrue(PaywallContext.unlimitedFavorites.subheadline
            .contains(String(SubscriptionTier.free.maxFavorites)))
    }

    func testSoftContextMapsFavoritesToProgress() {
        let context = MainTabView.softContext(for: "favorites_soft", userInfo: ["used": 2])
        XCTAssertEqual(context.id, "favorites_soft")
        XCTAssertTrue(context.subheadline.contains("2 of"))
        XCTAssertEqual(MainTabView.softContext(for: "trip_planner", userInfo: nil).id, "trip_planner")
    }

    func testEligibilityIsNotBurnedByAnUnshownRequest() {
        let service = SoftPaywallService.shared
        XCTAssertTrue(service.isEligible(defaults: defaults, isFree: true))
        // A request posts but, until recordPresentation runs from the sheet's
        // onAppear, nothing is written, so the user stays eligible.
        XCTAssertNil(defaults.object(forKey: "softPaywall.lastShownAt"))
        XCTAssertTrue(service.isEligible(defaults: defaults, isFree: true))
    }

    func testCooldownAppliesOnceShown() {
        let service = SoftPaywallService.shared
        defaults.set(Date(), forKey: "softPaywall.lastShownAt")
        defaults.set(1, forKey: "softPaywall.presentCount")
        XCTAssertFalse(service.isEligible(defaults: defaults, isFree: true))
        XCTAssertTrue(service.isEligible(
            defaults: defaults, isFree: true, now: Date().addingTimeInterval(8 * 86_400)))
    }

    func testPaidUsersAreNeverEligible() {
        XCTAssertFalse(SoftPaywallService.shared.isEligible(defaults: defaults, isFree: false))
    }
}
