import XCTest
import MapKit
@testable import DesMoinesInsider

/// IOS-DD-MAP-08: what the map draws alone and what it groups.
final class MapClusteringTests: XCTestCase {

    private let center = CLLocationCoordinate2D(latitude: 41.5868, longitude: -93.6250)

    private func region(span: Double) -> MKCoordinateRegion {
        MKCoordinateRegion(center: center, span: MKCoordinateSpan(latitudeDelta: span, longitudeDelta: span))
    }

    private func point(_ i: Int, dLat: Double, dLng: Double = 0) -> MapClustering.Point {
        MapClustering.Point(
            id: "p\(i)",
            coordinate: CLLocationCoordinate2D(latitude: center.latitude + dLat, longitude: center.longitude + dLng),
            kind: .restaurant
        )
    }

    private func clusters(_ items: [MapRenderItem]) -> [MapCluster] {
        items.compactMap { if case .cluster(let c) = $0 { return c } else { return nil } }
    }

    func testThirtyNearbyPointsAtCloseZoomAreAllSingles() {
        // Under the old 0.005-degree floor these were one cell forever.
        let points = (0..<30).map { point($0, dLat: Double($0) * 0.0001) }
        let items = MapClustering.items(points, region: region(span: 0.01))
        XCTAssertEqual(items.count, 30)
        XCTAssertTrue(clusters(items).isEmpty)
    }

    func testThirtyIdenticalCoordinatesAreOneClusterThatLists() {
        let points = (0..<30).map { point($0, dLat: 0) }
        let items = MapClustering.items(points, region: region(span: 0.01))
        let c = clusters(items)
        XCTAssertEqual(items.count, 1)
        XCTAssertEqual(c.first?.count, 30)
        XCTAssertEqual(c.first?.isSingleSpot, true)
        // Zoom can never split one spot, so it lists even when wide.
        XCTAssertTrue(MapClustering.shouldListMembers(c[0], latitudeSpan: 0.5))
    }

    func testAOneMemberBucketIsASinglePin() {
        let points = [point(0, dLat: 0.1), point(1, dLat: -0.1)]
        let items = MapClustering.items(points, region: region(span: 0.5), threshold: 1)
        XCTAssertEqual(items.count, 2)
        XCTAssertTrue(clusters(items).isEmpty)
    }

    func testPointsOffScreenDoNotCountTowardTheThreshold() {
        let inside = (0..<5).map { point($0, dLat: Double($0) * 0.001) }
        let outside = (5..<105).map { point($0, dLat: 5 + Double($0) * 0.001) }
        let items = MapClustering.items(inside + outside, region: region(span: 0.05))
        XCTAssertEqual(items.count, 5)
        XCTAssertTrue(clusters(items).isEmpty)
    }

    func testADenseViewClustersAndCountsKinds() {
        let points = (0..<80).map { point($0, dLat: Double($0 % 8) * 0.0001, dLng: Double($0 / 8) * 0.0001) }
        let items = MapClustering.items(points, region: region(span: 0.1))
        let c = clusters(items)
        XCTAssertFalse(c.isEmpty)
        XCTAssertEqual(c.map(\.count).reduce(0, +) + (items.count - c.count), 80)
        XCTAssertEqual(c.first?.kindCounts[.restaurant], c.first?.count)
    }

    func testLargeWideClustersZoomInsteadOfListing() {
        let points = (0..<40).map { point($0, dLat: Double($0) * 0.00001) }
        let c = clusters(MapClustering.items(points, region: region(span: 0.5), threshold: 10))
        XCTAssertEqual(c.count, 1)
        XCTAssertFalse(c[0].isSingleSpot)
        XCTAssertFalse(MapClustering.shouldListMembers(c[0], latitudeSpan: 0.5))
        XCTAssertTrue(MapClustering.shouldListMembers(c[0], latitudeSpan: 0.01))
    }

    func testClusterLabelNamesTheKinds() {
        let cluster = MapCluster(
            id: "c", coordinate: center, memberIds: ["a", "b", "c"], kinds: [.event, .restaurant],
            kindCounts: [.event: 1, .restaurant: 2]
        )
        XCTAssertEqual(cluster.accessibilityLabel, "3 places: 1 event, 2 restaurants, 0 places. Double-tap to list them.")
    }
}
