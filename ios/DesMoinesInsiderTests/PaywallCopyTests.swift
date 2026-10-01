import XCTest
@testable import DesMoinesInsider

/// Every paywall and storefront line must describe something iOS delivers
/// (IOS-DD-MONETIZATION-11/-12/-14/-21). Group 2 deleted a paywall that sold
/// a template string; this fails when a feature with no implementation, or a
/// promise nothing keeps, comes back.
@MainActor
final class PaywallCopyTests: XCTestCase {

    /// Phrases that sold features iOS does not have, or said something false.
    private static let banned = [
        "VIP-exclusive", "reservation", "SMS", "perks", "Concierge",
        "Early access", "Advanced filter", "insider tip", "journalism",
        "across all your devices",
    ]

    private static var presets: [PaywallContext] {
        [
            .unlimitedFavorites, .favoritesProgress(used: 2), .tripPlanner, .askPulse, .writeReviews,
            .savedSearches, .customAlerts, .onboarding, .winBack, .adFree,
            .generic(tier: .insider, feature: PremiumFeature.writeReviews.marketingBlurb),
            .generic(tier: .vip, feature: PremiumFeature.vipEvents.marketingBlurb),
        ] + PremiumFeature.allCases.map(\.paywallContext)
    }

    private func assertClean(_ text: String, _ label: String, file: StaticString = #filePath, line: UInt = #line) {
        for phrase in Self.banned {
            XCTAssertFalse(
                text.localizedCaseInsensitiveContains(phrase),
                "\(label) sells '\(phrase)': \(text)",
                file: file, line: line
            )
        }
        // "XP" as a word, case-sensitive: "experience" is fine, "2x XP" is not.
        XCTAssertNil(
            text.range(of: #"\bXP\b"#, options: .regularExpression),
            "\(label) sells an XP multiplier: \(text)",
            file: file, line: line
        )
    }

    func testTierFeatureListsSellOnlyWhatExists() {
        for tier in [SubscriptionTier.free, .insider, .vip] {
            for feature in tier.features {
                assertClean(feature, "\(tier.displayName) features")
            }
        }
    }

    func testPaywallPresetsSellOnlyWhatExists() {
        for context in Self.presets {
            assertClean(context.headline, "\(context.id) headline")
            assertClean(context.subheadline, "\(context.id) subheadline")
            for benefit in context.benefits {
                assertClean(benefit, "\(context.id) benefit")
            }
        }
    }

    func testUnofferedFeaturesAreNotMarketed() {
        for feature in PremiumFeature.allCases where !feature.isOffered {
            assertClean(feature.marketingBlurb, "\(feature.rawValue) blurb")
        }
        XCTAssertFalse(PremiumFeature.advancedFilters.isOffered, "Advanced filters are free on iOS")
        XCTAssertTrue(PremiumFeature.tripPlanner.isOffered)
    }

    // MARK: - IOS-DD-MONETIZATION-14: preselect a tier the user can buy

    func testInitialTierForFreeUserIsRecommended() {
        XCTAssertEqual(PaywallView.initialTier(recommended: .insider, current: .free), .insider)
    }

    func testInitialTierForInsiderIsVIP() {
        XCTAssertEqual(PaywallView.initialTier(recommended: .insider, current: .insider), .vip)
    }

    func testInitialTierForVIPIsNothing() {
        XCTAssertNil(PaywallView.initialTier(recommended: .insider, current: .vip))
    }

    func testTripPlannerSubheadlineForInsiderPointsAtVIP() {
        let text = PaywallView.subheadline(for: .tripPlanner, hasTrial: false, currentTier: .insider)
        XCTAssertTrue(text.contains("VIP is unlimited"))
        XCTAssertEqual(
            PaywallView.subheadline(for: .tripPlanner, hasTrial: false, currentTier: .free),
            PaywallContext.tripPlanner.subheadline
        )
    }

    // MARK: - IOS-DD-MONETIZATION-21: no trial promised without one

    func testOnboardingHeadlineWithoutTrialPromisesNothingFree() {
        let headline = PaywallView.headline(for: .onboarding, hasTrial: false)
        XCTAssertFalse(headline.localizedCaseInsensitiveContains("free"))
        let sub = PaywallView.subheadline(for: .onboarding, hasTrial: false, currentTier: .free)
        XCTAssertFalse(sub.localizedCaseInsensitiveContains("free trial"))
    }

    func testOnboardingHeadlineWithTrialIsTheContextHeadline() {
        XCTAssertEqual(PaywallView.headline(for: .onboarding, hasTrial: true), PaywallContext.onboarding.headline)
    }
}
