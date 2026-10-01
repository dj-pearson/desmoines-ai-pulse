import XCTest
import CoreLocation
import MapKit
@testable import DesMoinesInsider

/// IOS-AUDIT-PERF-027: the bounding box that lets a nearby query narrow BEFORE
/// its row limit.
///
/// The bug it exists to fix is not slowness, it is wrong answers: several nearby
/// queries took the first N rows and then filtered by distance in Swift, so
/// anything in radius past the cutoff was invisible and which rows survived
/// depended on whatever order the table returned.
final class GeoBoundingBoxTests: XCTestCase {

    /// Downtown Des Moines.
    private let lat = 41.5868
    private let lng = -93.6250

    func testBoxContainsItsCenter() {
        let box = GeoBoundingBox(centerLat: lat, centerLng: lng, radiusMiles: 30)
        XCTAssertTrue(box.contains(latitude: lat, longitude: lng))
    }

    func testLatitudeSpanIsAboutTwiceTheRadius() {
        let box = GeoBoundingBox(centerLat: lat, centerLng: lng, radiusMiles: 30)
        let spanMiles = (box.maxLat - box.minLat) * 69.0
        XCTAssertEqual(spanMiles, 60.0, accuracy: 0.01, "69 miles per degree of latitude, both ways")
    }

    /// The box must never be SMALLER than the circle, or it would exclude rows
    /// that are genuinely in radius -- the exact defect being fixed.
    func testBoxFullyEnclosesTheRadiusInEveryDirection() {
        let radius = 30.0
        let box = GeoBoundingBox(centerLat: lat, centerLng: lng, radiusMiles: radius)

        let northEdge = lat + radius / 69.0
        let southEdge = lat - radius / 69.0
        XCTAssertLessThanOrEqual(box.minLat, southEdge + 1e-9)
        XCTAssertGreaterThanOrEqual(box.maxLat, northEdge - 1e-9)

        // A point due east at exactly the radius must be inside the box.
        let milesPerLngDegree = 69.0 * cos(lat * .pi / 180)
        let eastEdge = lng + radius / milesPerLngDegree
        XCTAssertTrue(box.contains(latitude: lat, longitude: eastEdge - 1e-9))
    }

    func testLongitudeSpanWidensWithLatitude() {
        // Degrees of longitude get narrower toward the poles, so covering the same
        // mileage takes MORE degrees. A box computed with a constant 69 mi/degree
        // would be too narrow up north and would drop in-radius rows.
        let equatorial = GeoBoundingBox(centerLat: 0, centerLng: 0, radiusMiles: 30)
        let northern = GeoBoundingBox(centerLat: 60, centerLng: 0, radiusMiles: 30)

        let equatorialSpan = equatorial.maxLng - equatorial.minLng
        let northernSpan = northern.maxLng - northern.minLng
        XCTAssertGreaterThan(northernSpan, equatorialSpan * 1.9, "cos(60) = 0.5, so roughly twice as wide")
    }

    func testNearThePoleTheBoxIsClampedRatherThanInfinite() {
        // cos(90) is 0. Without the clamp the longitude delta divides by ~0 and the
        // box spans the planet, which would defeat the point of narrowing.
        let box = GeoBoundingBox(centerLat: 89.999, centerLng: 0, radiusMiles: 30)
        let span = box.maxLng - box.minLng
        XCTAssertTrue(span.isFinite)
        XCTAssertLessThan(span, 200.0, "clamped, not unbounded")
    }

    func testAPointWellOutsideTheRadiusIsExcluded() {
        let box = GeoBoundingBox(centerLat: lat, centerLng: lng, radiusMiles: 5)
        // Ames is roughly 30 miles north of downtown Des Moines.
        XCTAssertFalse(box.contains(latitude: 42.0308, longitude: -93.6319))
    }
}

/// IOS-DD-MAP-11: the map's own bound on where a pin may be.
final class MapPlausibleCoordinateTests: XCTestCase {

    private func plausible(_ lat: Double, _ lng: Double) -> Bool {
        GeoBoundingBox.isPlausibleMapCoordinate(CLLocationCoordinate2D(latitude: lat, longitude: lng))
    }

    func testNullIslandIsNotPlausible() {
        XCTAssertFalse(plausible(0, 0))
    }

    func testSeattleIsNotPlausible() {
        XCTAssertFalse(plausible(47.4, -122.3))
    }

    func testDowntownIsPlausible() {
        XCTAssertTrue(plausible(41.5868, -93.6250))
    }

    func testLeMarsInTheFarNorthwestIsPlausible() {
        XCTAssertTrue(plausible(42.79, -96.17))
    }

    func testANullIslandOutlierNoLongerStretchesTheSearchFit() async throws {
        let coords = [
            CLLocationCoordinate2D(latitude: 41.5868, longitude: -93.6250),
            CLLocationCoordinate2D(latitude: 41.6005, longitude: -93.6091),
            CLLocationCoordinate2D(latitude: 0, longitude: 0),
        ]
        let (inArea, outside) = MapViewModel.partitionForFit(coords)
        XCTAssertEqual(outside, 1)
        let fitted = await MapViewModel.regionFitting(coordinates: inArea)
        let region = try XCTUnwrap(fitted)
        XCTAssertLessThan(region.span.latitudeDelta, 1)
        XCTAssertLessThan(region.span.longitudeDelta, 1)
    }
}
