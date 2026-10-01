import XCTest
@testable import DesMoinesInsider

/// IOS-DD-MONETIZATION-15: the renewal banner nagged every launch, told
/// web/Android subscribers their subscription had ended, and never aged out.
@MainActor
final class SubscriptionStatusBannerTests: XCTestCase {
    private let now = Date(timeIntervalSince1970: 1_790_000_000)

    private func days(_ n: Double) -> Date { now.addingTimeInterval(n * 86_400) }

    func testExpiredHiddenWhenEntitledElsewhere() {
        XCTAssertNil(SubscriptionStatusBanner.visibleState(.expired, expiry: days(-10), currentTier: .insider, now: now))
    }

    func testRecentlyExpiredFreeUserSeesWinBack() {
        XCTAssertEqual(
            SubscriptionStatusBanner.visibleState(.expired, expiry: days(-10), currentTier: .free, now: now),
            .expired
        )
    }

    func testLongExpiredAgesOut() {
        XCTAssertNil(SubscriptionStatusBanner.visibleState(.expired, expiry: days(-40), currentTier: .free, now: now))
        XCTAssertNil(SubscriptionStatusBanner.visibleState(.expired, expiry: nil, currentTier: .free, now: now))
    }

    func testExpiringSoonOnlyInTheLastWeek() {
        XCTAssertNil(SubscriptionStatusBanner.visibleState(.expiringSoon, expiry: days(30), currentTier: .insider, now: now))
        XCTAssertEqual(
            SubscriptionStatusBanner.visibleState(.expiringSoon, expiry: days(3), currentTier: .insider, now: now),
            .expiringSoon
        )
    }

    func testBillingProblemsAlwaysShow() {
        XCTAssertEqual(
            SubscriptionStatusBanner.visibleState(.billingRetry, expiry: nil, currentTier: .free, now: now),
            .billingRetry
        )
        XCTAssertEqual(
            SubscriptionStatusBanner.visibleState(.grace, expiry: nil, currentTier: .insider, now: now),
            .grace
        )
    }

    func testDismissalKeyChangesWithExpiry() {
        let a = SubscriptionStatusBanner.dismissalKey(stateKey: "expired", expiry: days(-1))
        let b = SubscriptionStatusBanner.dismissalKey(stateKey: "expired", expiry: days(-2))
        XCTAssertNotEqual(a, b, "A new lapse must be able to show again")
    }
}
