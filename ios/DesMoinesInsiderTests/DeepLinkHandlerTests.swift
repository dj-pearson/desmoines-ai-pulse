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

    func testValidEventCustomScheme() {
        let url = URL(string: "dsminsider://event/550e8400-e29b-41d4-a716-446655440000")!
        let result = handler.handle(url)
        XCTAssertTrue(result)

        let dest = handler.consumeDestination()
        XCTAssertEqual(dest, .event(id: "550e8400-e29b-41d4-a716-446655440000"))
    }

    func testHomeTabCustomScheme() {
        let url = URL(string: "dsminsider://home")!
        let result = handler.handle(url)
        XCTAssertTrue(result)

        let dest = handler.consumeDestination()
        XCTAssertEqual(dest, .tab(.home))
    }

    func testInvalidIDCustomSchemeFallsBackToTab() {
        let url = URL(string: "dsminsider://restaurant/malicious-input")!
        let result = handler.handle(url)
        XCTAssertTrue(result)

        let dest = handler.consumeDestination()
        XCTAssertEqual(dest, .tab(.restaurants)) // Invalid restaurant ID falls back to restaurants tab
    }

    // MARK: - Consume

    func testConsumeDestinationClearsIt() {
        let url = URL(string: "dsminsider://home")!
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
