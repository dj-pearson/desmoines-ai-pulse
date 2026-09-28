import XCTest
@testable import DesMoinesInsider

/// IOS-DD-SEARCH-06 and -14: Siri intents become structured search filters,
/// and Ask Pulse runs without a spoken query.
@MainActor
final class PulseIntentRoutingTests: XCTestCase {

    func testFindRestaurantsUsesAreaAndOpenNowAsFilters() throws {
        let pending = PulseIntentDispatcher.Pending.findRestaurants(
            cuisine: "Italian", area: "East Village", openNow: true
        )
        let route = try XCTUnwrap(pending.searchRoute)
        XCTAssertEqual(route.text, "Italian")
        XCTAssertEqual(route.filters.areas, [.eastVillage])
        XCTAssertTrue(route.filters.openNow)
        XCTAssertEqual(route.tab, .restaurants)
    }

    func testUnknownAreaBecomesAKeyword() throws {
        let pending = PulseIntentDispatcher.Pending.findRestaurants(
            cuisine: "Tacos", area: "Beaverdale", openNow: false
        )
        let route = try XCTUnwrap(pending.searchRoute)
        XCTAssertEqual(route.text, "Tacos Beaverdale")
        XCTAssertTrue(route.filters.areas.isEmpty)
    }

    func testFindEventsMapsCategoryAndPreset() throws {
        let pending = PulseIntentDispatcher.Pending.findEvents(category: "Music", datePreset: "this weekend")
        let route = try XCTUnwrap(pending.searchRoute)
        XCTAssertEqual(route.filters.category, .music)
        XCTAssertEqual(route.filters.datePreset, .thisWeekend)
        XCTAssertEqual(route.text, "")
        XCTAssertEqual(route.tab, .events)
    }

    func testUnknownCategoryIsSearchedAsAWord() throws {
        let pending = PulseIntentDispatcher.Pending.findEvents(category: "Jazz", datePreset: nil)
        let route = try XCTUnwrap(pending.searchRoute)
        XCTAssertNil(route.filters.category)
        XCTAssertEqual(route.text, "Jazz")
    }

    func testTonightPayloadIsTheTonightFilter() throws {
        let pending = PulseIntentDispatcher.Pending.findEvents(category: nil, datePreset: "tonight")
        let route = try XCTUnwrap(pending.searchRoute)
        XCTAssertEqual(route.filters.datePreset, .tonight)
        XCTAssertFalse(route.filters.isEmpty, "an empty search field must still search")
    }

    func testLongParametersAreCapped() throws {
        let long = String(repeating: "a", count: 500)
        let pending = PulseIntentDispatcher.Pending.findRestaurants(cuisine: long, area: nil, openNow: false)
        let route = try XCTUnwrap(pending.searchRoute)
        XCTAssertEqual(route.text.count, 100)
    }

    func testAskPulseHasNoSearchRoute() {
        XCTAssertNil(PulseIntentDispatcher.Pending.askPulse(query: "x").searchRoute)
    }

    func testAskPulseDefaultsWhenNoQuery() {
        XCTAssertEqual(AskPulseIntent.resolvedQuery(nil), AskPulseIntent.defaultPrompt)
        XCTAssertEqual(AskPulseIntent.resolvedQuery("   "), AskPulseIntent.defaultPrompt)
    }

    func testAskPulseQueryIsCapped() {
        XCTAssertEqual(AskPulseIntent.resolvedQuery(String(repeating: "a", count: 500)).count, 300)
    }

    // MARK: - Search links (IOS-DD-PLATFORM-02)

    func testSearchTextRoutesToEventsWithTheText() throws {
        let route = try XCTUnwrap(PulseIntentDispatcher.Pending.searchText("jazz").searchRoute)
        XCTAssertEqual(route.text, "jazz")
        XCTAssertEqual(route.tab, .events)
        XCTAssertTrue(route.filters.isEmpty)
    }
}
