import XCTest
@testable import DesMoinesInsider

/// IOS-DD-MAP-10: one message per map state.
final class MapOverlayStateTests: XCTestCase {

    private func resolve(
        failed: Set<MapCluster.Kind> = [],
        raw: [MapCluster.Kind: Int] = [.event: 3, .restaurant: 2, .attraction: 1],
        visible: Int = 6,
        chip: MapTimeChip = .anytime,
        quick: Bool = false,
        enabled: Set<MapCluster.Kind> = Set(MapCluster.Kind.allCases),
        isSearch: Bool = false,
        query: String = "",
        zoomIn: Bool = false
    ) -> MapOverlayState {
        MapViewModel.resolveOverlay(
            failedKinds: failed, rawCounts: raw, visibleCount: visible, timeChip: chip,
            quickFiltersOn: quick, enabledKinds: enabled, isSearch: isSearch, query: query, needsZoomIn: zoomIn
        )
    }

    func testEverythingLoadedAndVisibleIsNone() {
        XCTAssertEqual(resolve(), MapOverlayState.none)
    }

    func testAllThreeFailingIsOffline() {
        XCTAssertEqual(resolve(failed: Set(MapCluster.Kind.allCases)), .offline)
    }

    func testOneFailingIsPartial() {
        XCTAssertEqual(resolve(failed: [.restaurant]), .partial(failedKinds: [.restaurant]))
    }

    func testNothingNearbyIsEmptyArea() {
        XCTAssertEqual(resolve(raw: [:], visible: 0), .emptyArea)
    }

    func testNothingFoundForASearchNamesTheQuery() {
        XCTAssertEqual(resolve(raw: [:], visible: 0, isSearch: true, query: "zzz"), .noResults(query: "zzz"))
    }

    func testRowsHiddenByTheTimeFilterAreFilteredOut() {
        XCTAssertEqual(
            resolve(visible: 0, chip: .at8pm),
            .filteredOut(hiddenByTime: true, hiddenByQuickFilters: false, hiddenKinds: [])
        )
    }

    func testRowsHiddenByTogglesNameTheKinds() {
        XCTAssertEqual(
            resolve(raw: [.event: 0, .restaurant: 4], visible: 0, enabled: [.event, .attraction]),
            .filteredOut(hiddenByTime: false, hiddenByQuickFilters: false, hiddenKinds: [.restaurant])
        )
    }

    func testQuickFiltersAreReported() {
        XCTAssertEqual(
            resolve(visible: 0, quick: true),
            .filteredOut(hiddenByTime: false, hiddenByQuickFilters: true, hiddenKinds: [])
        )
    }

    func testTooWideIsZoomIn() {
        XCTAssertEqual(resolve(zoomIn: true), .zoomIn)
    }
}
