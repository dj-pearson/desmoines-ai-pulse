import XCTest
@testable import DesMoinesInsider

// DeepLinkHandler is @MainActor (@Observable singleton), so the test case is too
// — its `handle(_:)` / `consumeDestination()` are main-actor isolated.
@MainActor
final class DeepLinkHandlerTests: XCTestCase {

    private var handler: DeepLinkHandler!

    override func setUp() async throws {
        handler = DeepLinkHandler.shared
        // Consume any pending destination from previous tests
        _ = handler.consumeDestination()
    }

    // MARK: - Universal Links

    func testValidEventUniversalLink() {
        let url = URL(string: "https://desmoinesinsider.com/events/550e8400-e29b-41d4-a716-446655440000")!
        let result = handler.handle(url)
        XCTAssertTrue(result)

        let dest = handler.consumeDestination()
        XCTAssertEqual(dest, .event(id: "550e8400-e29b-41d4-a716-446655440000"))
    }

    func testValidRestaurantUniversalLink() {
        let url = URL(string: "https://desmoinesinsider.com/restaurants/550e8400-e29b-41d4-a716-446655440000")!
        let result = handler.handle(url)
        XCTAssertTrue(result)

        let dest = handler.consumeDestination()
        XCTAssertEqual(dest, .restaurant(id: "550e8400-e29b-41d4-a716-446655440000"))
    }

    // MARK: - Restaurant slugs (IOS-DD-RESTAURANTS-09)

    func testRestaurantSlugUniversalLinkOpensTheRestaurant() {
        let url = URL(string: "https://desmoinesinsider.com/restaurants/zombie-burger-drink-lab")!
        XCTAssertTrue(handler.handle(url))
        XCTAssertEqual(handler.consumeDestination(), .restaurant(id: "zombie-burger-drink-lab"))
    }

    func testRestaurantLandingPageOpensTheTab() {
        let url = URL(string: "https://desmoinesinsider.com/restaurants/open-now")!
        XCTAssertTrue(handler.handle(url))
        XCTAssertEqual(handler.consumeDestination(), .tab(.restaurants))
    }

    func testMalformedRestaurantSlugOpensTheTab() {
        let url = URL(string: "https://desmoinesinsider.com/restaurants/Bad%20Slug")!
        XCTAssertTrue(handler.handle(url))
        XCTAssertEqual(handler.consumeDestination(), .tab(.restaurants))
    }

    // MARK: - Attraction slugs (IOS-DD-BROWSE-12)

    func testAttractionSlugUniversalLinkOpensTheAttraction() {
        let url = URL(string: "https://desmoinesinsider.com/attractions/blank-park-zoo")!
        XCTAssertTrue(handler.handle(url))
        XCTAssertEqual(handler.consumeDestination(), .attraction(id: "blank-park-zoo"))
    }

    func testAttractionUUIDUniversalLinkStillWorks() {
        let id = "550e8400-e29b-41d4-a716-446655440000"
        XCTAssertTrue(handler.handle(URL(string: "https://desmoinesinsider.com/attractions/\(id)")!))
        XCTAssertEqual(handler.consumeDestination(), .attraction(id: id))
    }

    func testMalformedAttractionSlugsFallBackToHome() {
        for path in ["Bad%20Slug", "a--b", String(repeating: "a", count: 121)] {
            let url = URL(string: "https://desmoinesinsider.com/attractions/\(path)")!
            XCTAssertTrue(handler.handle(url), path)
            XCTAssertEqual(handler.consumeDestination(), .tab(.home), path)
        }
    }

    func testAttractionLinkIdBounds() {
        XCTAssertEqual(DeepLinkHandler.attractionLinkId(String(repeating: "a", count: 120)), String(repeating: "a", count: 120))
        XCTAssertNil(DeepLinkHandler.attractionLinkId(String(repeating: "a", count: 121)))
        XCTAssertNil(DeepLinkHandler.attractionLinkId("-zoo"))
    }

    func testInvalidIDUniversalLinkFallsBackToTab() {
        let url = URL(string: "https://desmoinesinsider.com/events/not-a-uuid")!
        let result = handler.handle(url)
        XCTAssertTrue(result)

        let dest = handler.consumeDestination()
        XCTAssertEqual(dest, .tab(.home)) // Invalid event ID falls back to home
    }

    // MARK: - Spotlight (IOS-AUDIT-FEAT-027)

    func testSpotlightEventIdentifierRoutes() {
        let id = "550e8400-e29b-41d4-a716-446655440000"
        XCTAssertTrue(handler.handleSpotlightIdentifier("event-\(id)"))
        XCTAssertEqual(handler.consumeDestination(), .event(id: id))
    }

    func testSpotlightRestaurantIdentifierRoutes() {
        let id = "550e8400-e29b-41d4-a716-446655440000"
        XCTAssertTrue(handler.handleSpotlightIdentifier("restaurant-\(id)"))
        XCTAssertEqual(handler.consumeDestination(), .restaurant(id: id))
    }

    func testSpotlightUnknownTypeIsNotRouted() {
        // article/hotel have no detail destination yet — must not crash or
        // route to the wrong screen.
        XCTAssertFalse(handler.handleSpotlightIdentifier("article-550e8400-e29b-41d4-a716-446655440000"))
        XCTAssertNil(handler.consumeDestination())
    }

    // MARK: - Custom Scheme

    // These build the URL from `Config.appBundleId` rather than a literal. They
    // previously used a "dsminsider://" scheme that appears nowhere else in the
    // project — Info.plist registers only "com.desmoines.aipulse" — so every
    // custom-scheme case parsed to nil and the four tests below failed.

    func testValidEventCustomScheme() {
        let url = URL(string: "\(Config.appBundleId)://event/550e8400-e29b-41d4-a716-446655440000")!
        let result = handler.handle(url)
        XCTAssertTrue(result)

        let dest = handler.consumeDestination()
        XCTAssertEqual(dest, .event(id: "550e8400-e29b-41d4-a716-446655440000"))
    }

    func testHomeTabCustomScheme() {
        let url = URL(string: "\(Config.appBundleId)://home")!
        let result = handler.handle(url)
        XCTAssertTrue(result)

        let dest = handler.consumeDestination()
        XCTAssertEqual(dest, .tab(.home))
    }

    func testInvalidIDCustomSchemeFallsBackToTab() {
        let url = URL(string: "\(Config.appBundleId)://restaurant/malicious-input")!
        let result = handler.handle(url)
        XCTAssertTrue(result)

        let dest = handler.consumeDestination()
        XCTAssertEqual(dest, .tab(.restaurants)) // Invalid restaurant ID falls back to restaurants tab
    }

    // MARK: - Consume

    func testConsumeDestinationClearsIt() {
        let url = URL(string: "\(Config.appBundleId)://home")!
        _ = handler.handle(url)

        let first = handler.consumeDestination()
        XCTAssertNotNil(first)

        let second = handler.consumeDestination()
        XCTAssertNil(second)
    }

    // MARK: - Unknown URLs

    func testUnknownHostReturnsFalse() {
        let url = URL(string: "https://unknown.com/events/550e8400-e29b-41d4-a716-446655440000")!
        let result = handler.handle(url)
        XCTAssertFalse(result)
    }
}
