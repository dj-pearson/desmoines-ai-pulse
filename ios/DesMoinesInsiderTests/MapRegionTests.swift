import XCTest
import MapKit
@testable import DesMoinesInsider

/// IOS-DD-MAP-05 / 15: "Search this area" and coarse coordinates.
final class MapRegionTests: XCTestCase {

    private func region(lat: Double = 41.5868, lng: Double = -93.6250, span: Double = 0.1) -> MKCoordinateRegion {
        MKCoordinateRegion(
            center: CLLocationCoordinate2D(latitude: lat, longitude: lng),
            span: MKCoordinateSpan(latitudeDelta: span, longitudeDelta: span)
        )
    }

    func testASmallPanDoesNotOfferSearchThisArea() {
        let last = region()
        XCTAssertFalse(MapViewModel.shouldOfferSearchThisArea(current: region(lat: 41.5868 + 0.01), last: last))
    }

    func testAFortyPercentPanOffersIt() {
        let last = region()
        XCTAssertTrue(MapViewModel.shouldOfferSearchThisArea(current: region(lat: 41.5868 + 0.04), last: last))
        XCTAssertTrue(MapViewModel.shouldOfferSearchThisArea(current: region(lng: -93.6250 - 0.04), last: last))
    }

    func testZoomingOutTwiceOffersIt() {
        XCTAssertTrue(MapViewModel.shouldOfferSearchThisArea(current: region(span: 0.2), last: region()))
        XCTAssertTrue(MapViewModel.shouldOfferSearchThisArea(current: region(span: 0.05), last: region()))
        XCTAssertFalse(MapViewModel.shouldOfferSearchThisArea(current: region(span: 0.15), last: region()))
    }

    func testRadiusIsClampedBetweenOneAndThirtyMiles() {
        XCTAssertEqual(MapViewModel.radiusMiles(for: region(span: 0.001)), 1)
        XCTAssertEqual(MapViewModel.radiusMiles(for: region(span: 2)), 30)
        XCTAssertEqual(MapViewModel.radiusMiles(for: region(span: 0.2)), 0.2 * 69 / 2 * 1.2, accuracy: 1e-9)
    }

    func testCoordinatesAreRoundedToTwoDecimals() {
        XCTAssertEqual(LocationPrivacy.coarse(41.58678), 41.59, accuracy: 1e-9)
        XCTAssertEqual(LocationPrivacy.coarse(-93.62534), -93.63, accuracy: 1e-9)
    }

    func testSearchQueryIsTrimmedAndCapped() {
        XCTAssertEqual(MapViewModel.normalizedQuery("  jazz \n"), "jazz")
        XCTAssertEqual(MapViewModel.normalizedQuery(String(repeating: "a", count: 500)).count, 100)
    }
}
