import XCTest
@testable import DesMoinesInsider

/// IOS-IA-006 — deterministic, consent-gated Home rail ordering.
final class HomeRailOrderingTests: XCTestCase {

    private func signals(
        consent: Bool = true,
        engaged: Bool = false,
        favEvents: Int = 0, favRestaurants: Int = 0, favAttractions: Int = 0,
        recentEvents: Int = 0, recentRestaurants: Int = 0, recentAttractions: Int = 0
    ) -> HomeRailOrdering.Signals {
        .init(
            consentGranted: consent, engaged: engaged,
            favoriteEvents: favEvents, favoriteRestaurants: favRestaurants, favoriteAttractions: favAttractions,
            recentEvents: recentEvents, recentRestaurants: recentRestaurants, recentAttractions: recentAttractions
        )
    }

    private let canonical = HomeRail.allCases

    func testGuestOrNoConsentGetsCanonicalOrder() {
        XCTAssertEqual(HomeRailOrdering.order(for: signals(consent: false, favRestaurants: 5)), canonical)
    }

    func testNoSignalGetsCanonicalOrder() {
        XCTAssertEqual(HomeRailOrdering.order(for: signals(consent: true)), canonical)
    }

    func testCanonicalStrategyAlwaysReturnsCanonical() {
        let order = HomeRailOrdering.order(for: signals(engaged: true, favRestaurants: 9), strategy: .canonical)
        XCTAssertEqual(order, canonical)
    }

    func testEngagedRestaurantAffinityLeadsWithForYouThenRestaurants() {
        let order = HomeRailOrdering.order(for: signals(engaged: true, favRestaurants: 4))
        XCTAssertEqual(order, [.forYou, .popularRestaurants, .featured, .thisWeekend, .trendingAttractions])
    }

    func testNotEngagedRestaurantAffinityLeadsWithRestaurantsThenForYou() {
        let order = HomeRailOrdering.order(for: signals(engaged: false, favRestaurants: 4))
        XCTAssertEqual(order, [.popularRestaurants, .forYou, .featured, .thisWeekend, .trendingAttractions])
    }

    func testAttractionAffinityBubblesAttractionsUp() {
        let order = HomeRailOrdering.order(for: signals(engaged: true, recentAttractions: 6))
        // Attractions become the top content type, after the For-You lead.
        XCTAssertEqual(order.first, .forYou)
        XCTAssertEqual(order[1], .trendingAttractions)
    }

    func testFavoritesOutweighRecentViews() {
        // 2 restaurant favorites (score 4) beat 3 attraction views (score 3).
        let order = HomeRailOrdering.order(for: signals(engaged: true, favRestaurants: 2, recentAttractions: 3))
        XCTAssertEqual(order[1], .popularRestaurants)
    }

    func testDeterministic() {
        let s = signals(engaged: true, favEvents: 1, favRestaurants: 2, recentAttractions: 1)
        XCTAssertEqual(HomeRailOrdering.order(for: s), HomeRailOrdering.order(for: s))
    }
}
