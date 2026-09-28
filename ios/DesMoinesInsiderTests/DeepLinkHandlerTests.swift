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
        // "not-a-uuid" is now a well-formed event slug (IOS-DD-PLATFORM-01);
        // a segment that cannot be a slug still falls back.
        let url = URL(string: "https://desmoinesinsider.com/events/Bad%20Slug")!
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
        // A type with no detail destination must not crash or route to the
        // wrong screen.
        XCTAssertFalse(handler.handleSpotlightIdentifier("neighborhood-550e8400-e29b-41d4-a716-446655440000"))
        XCTAssertNil(handler.consumeDestination())
    }

    // MARK: - Hotels and articles (IOS-DD-GUIDES-22)

    func testSpotlightHotelRoutes() {
        let id = "550e8400-e29b-41d4-a716-446655440000"
        XCTAssertTrue(handler.handleSpotlightIdentifier("hotel-\(id)"))
        XCTAssertEqual(handler.consumeDestination(), .hotel(id: id))
    }

    func testSpotlightArticleRoutes() {
        let id = "550e8400-e29b-41d4-a716-446655440000"
        XCTAssertTrue(handler.handleSpotlightIdentifier("article-\(id)"))
        XCTAssertEqual(handler.consumeDestination(), .article(id: id))
    }

    func testStaySlugUniversalLink() {
        XCTAssertTrue(handler.handle(URL(string: "https://desmoinesinsider.com/stay/surety-hotel")!))
        XCTAssertEqual(handler.consumeDestination(), .hotel(id: "surety-hotel"))
    }

    func testArticlesSlugUniversalLink() {
        XCTAssertTrue(handler.handle(URL(string: "https://desmoinesinsider.com/articles/best-patios-2026")!))
        XCTAssertEqual(handler.consumeDestination(), .article(id: "best-patios-2026"))
    }

    func testBadArticleSegmentFallsBackToArticlesHub() {
        XCTAssertTrue(handler.handle(URL(string: "https://desmoinesinsider.com/articles/Not%20A%20Slug")!))
        XCTAssertEqual(handler.consumeDestination(), .discover(.articles))
    }

    // MARK: - destination(for:) (IOS-DD-GUIDES-21)

    func testDestinationForURLDoesNotSetPending() {
        let url = URL(string: "https://desmoinesinsider.com/restaurants/zombie-burger")!
        XCTAssertEqual(handler.destination(for: url), .restaurant(id: "zombie-burger"))
        XCTAssertNil(handler.pendingDestination)
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

    // MARK: - Event slugs (IOS-DD-PLATFORM-01)

    private func dest(_ path: String) -> DeepLinkHandler.Destination? {
        handler.destination(for: URL(string: "https://desmoinesinsider.com\(path)")!)
    }

    func testEventSlugOpensTheEvent() {
        XCTAssertEqual(dest("/events/jazz-in-the-park-2026-09-08"), .event(id: "jazz-in-the-park-2026-09-08"))
    }

    func testEventUUIDStillOpensTheEvent() {
        let id = "550e8400-e29b-41d4-a716-446655440000"
        XCTAssertEqual(dest("/events/\(id)"), .event(id: id))
    }

    func testEventLandingPages() {
        XCTAssertEqual(dest("/events/today"), .search(query: "today"))
        XCTAssertEqual(dest("/events/free"), .search(query: "free events"))
        XCTAssertEqual(dest("/events/west-des-moines"), .search(query: "events in west des moines"))
        XCTAssertEqual(dest("/events/this-weekend"), .discover(.weekend))
        XCTAssertEqual(dest("/events/near-me"), .tab(.home))
        XCTAssertEqual(dest("/events/june-2026"), .tab(.home))
        XCTAssertEqual(dest("/events/Bad%20Slug"), .tab(.home))
    }

    // MARK: - Nothing claimed strands the user (IOS-DD-PLATFORM-02)

    func testEveryClaimedPathRoutes() {
        let paths = [
            "/search", "/search?q=brunch", "/search/advanced",
            "/attractions", "/attractions/science-center-of-iowa",
            "/stay", "/stay/hotel-x", "/weekend", "/deals", "/best-of", "/best-of/brunch",
            "/music", "/sports", "/outdoors",
            "/neighborhoods", "/neighborhoods/east-village",
            "/events", "/events/today", "/restaurants", "/restaurants/open-now",
            "/restaurants/dietary/vegan", "/trip-planner", "/articles", "/articles/foo",
        ]
        for path in paths {
            XCTAssertNotNil(dest(path), path)
        }
    }

    func testSearchQueryLinkSearches() {
        XCTAssertEqual(dest("/search?q=brunch"), .search(query: "brunch"))
        XCTAssertEqual(dest("/search?q=%20%20"), .tab(.search))
        XCTAssertEqual(dest("/search/advanced"), .tab(.search))
    }

    func testSearchQueryIsCapped() {
        let long = String(repeating: "a", count: 300)
        XCTAssertEqual(dest("/search?q=\(long)"), .search(query: String(repeating: "a", count: 120)))
    }

    func testUnknownFirstPartyPageOpensOnTheWeb() {
        let url = URL(string: "https://desmoinesinsider.com/some-unknown-page")!
        XCTAssertEqual(handler.destination(for: url), .web(url))
        let bare = URL(string: "https://desmoinesinsider.com/attractions")!
        XCTAssertEqual(handler.destination(for: bare), .web(bare))
    }

    // MARK: - Exact host (IOS-DD-PLATFORM-10)

    func testLookAlikeHostsAndHttpAreRejected() {
        let id = "550e8400-e29b-41d4-a716-446655440000"
        XCTAssertNil(handler.destination(for: URL(string: "https://desmoinesinsider.com.attacker.net/events/\(id)")!))
        XCTAssertNil(handler.destination(for: URL(string: "https://evildesmoinesinsider.com/events/\(id)")!))
        XCTAssertNil(handler.destination(for: URL(string: "http://desmoinesinsider.com/events/\(id)")!))
    }

    func testHostMatchIgnoresCase() {
        let id = "550e8400-e29b-41d4-a716-446655440000"
        XCTAssertEqual(handler.destination(for: URL(string: "https://WWW.DesMoinesInsider.com/events/\(id)")!), .event(id: id))
    }

    func testAnArticleAboutAuthCallbacksIsNotAnAuthCallback() {
        XCTAssertTrue(handler.handle(URL(string: "https://desmoinesinsider.com/articles/auth-callback-explained")!))
        XCTAssertEqual(handler.consumeDestination(), .article(id: "auth-callback-explained"))
    }

    func testTheRealAuthCallbackIsLeftToSupabase() {
        XCTAssertFalse(handler.handle(URL(string: "\(Config.appBundleId)://auth-callback?code=x")!))
        XCTAssertNil(handler.consumeDestination())
    }
}
