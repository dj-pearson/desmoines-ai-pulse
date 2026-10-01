import XCTest
@testable import DesMoinesInsider

/// IOS-DD-MAP-12: the list alternative's order.
final class MapListTests: XCTestCase {

    private func item(_ id: String, miles: Double?, start: Date? = nil) -> MapListItem {
        MapListItem(
            id: id,
            destination: .attraction(MapFixtures.attraction(id)),
            title: id,
            cardData: ContentCardData(id: id, title: id, imageUrl: nil),
            distanceMiles: miles,
            distanceText: miles.map { "\($0) mi" },
            start: start
        )
    }

    func testNearestFirst() {
        let sorted = MapViewModel.sortListItems([item("far", miles: 3), item("near", miles: 0.2)], chip: .anytime)
        XCTAssertEqual(sorted.map(\.id), ["near", "far"])
    }

    func testUnknownDistanceGoesLast() {
        let sorted = MapViewModel.sortListItems(
            [item("unknown", miles: nil), item("far", miles: 3), item("near", miles: 0.2)],
            chip: .anytime
        )
        XCTAssertEqual(sorted.map(\.id), ["near", "far", "unknown"])
    }

    func testTonightOrdersByStartTime() {
        let early = MapFixtures.central(2026, 9, 29, 19)
        let late = MapFixtures.central(2026, 9, 29, 22)
        let sorted = MapViewModel.sortListItems(
            [item("near-late", miles: 0.1, start: late), item("far-early", miles: 5, start: early)],
            chip: .tonight
        )
        XCTAssertEqual(sorted.map(\.id), ["far-early", "near-late"])
    }

    func testRowLabelIncludesDistance() {
        XCTAssertEqual(item("Park", miles: 0.5).accessibilityLabel, "Park, 0.5 mi")
    }
}
