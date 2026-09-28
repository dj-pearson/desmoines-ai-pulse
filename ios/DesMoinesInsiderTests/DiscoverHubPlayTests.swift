import XCTest
@testable import DesMoinesInsider

/// IOS-DD-DISCOVER-19: the Discover hub links to the discovery games.
final class DiscoverHubPlayTests: XCTestCase {

    func testThereAreThreeGamesWithDistinctTitles() {
        let titles = PlayDestination.allCases.map(\.title)
        XCTAssertEqual(titles.count, 3)
        XCTAssertEqual(Set(titles).count, 3)
        XCTAssertFalse(titles.contains(where: \.isEmpty))
        XCTAssertFalse(PlayDestination.allCases.map(\.subtitle).contains(where: \.isEmpty))
    }

    func testDestinationSlugsAreUnchanged() {
        // Deep links resolve hub destinations by slug; the play row must not
        // have moved them.
        XCTAssertNotNil(DiscoverDestination(slug: "deals"))
        XCTAssertNotNil(DiscoverDestination(slug: "trip-planner"))
        XCTAssertEqual(DiscoverDestination.allCases.count, 10)
    }
}
