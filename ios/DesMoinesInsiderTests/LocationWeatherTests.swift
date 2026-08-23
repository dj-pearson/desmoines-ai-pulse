import XCTest
import CoreLocation
@testable import DesMoinesInsider

/// IOS-AUDIT-BUG-015 -- the two decisions behind stale location and wrong-city
/// weather.
///
/// Neither CLLocationManager nor the network can be driven from a unit test, so
/// what is covered is the logic that decides whether cached data may be served.
/// That is where both bugs lived: the code did the right thing once it decided
/// to ask, and the wrong thing when it decided it did not need to.
final class LocationWeatherTests: XCTestCase {

    // MARK: - Authorization

    func testOnlyTheTwoGrantedStatesAllowLocation() {
        XCTAssertTrue(LocationService.isAuthorized(.authorizedWhenInUse))
        XCTAssertTrue(LocationService.isAuthorized(.authorizedAlways))
    }

    func testRevokedAndUndecidedStatesDoNot() {
        // .denied is the one this story is about: the cache shortcut used to run
        // before this check, so a revoked user kept getting coordinates.
        XCTAssertFalse(LocationService.isAuthorized(.denied))
        XCTAssertFalse(LocationService.isAuthorized(.restricted))
        XCTAssertFalse(LocationService.isAuthorized(.notDetermined))
    }

    // MARK: - Freshness

    func testAFixJustTakenIsFresh() {
        let now = Date()
        XCTAssertTrue(LocationService.isFresh(now, now: now))
    }

    func testAFixInsideTheWindowIsFresh() {
        let now = Date()
        let taken = now.addingTimeInterval(-(LocationService.cacheLifetime - 1))
        XCTAssertTrue(LocationService.isFresh(taken, now: now))
    }

    func testAFixAtTheWindowIsNotFresh() {
        // Boundary is exclusive, so the window cannot quietly become 301s.
        let now = Date()
        let taken = now.addingTimeInterval(-LocationService.cacheLifetime)
        XCTAssertFalse(LocationService.isFresh(taken, now: now))
    }

    func testAFixTimestampedInTheFutureIsStillFresh() {
        // A backwards clock adjustment produces this. Treating it as stale
        // would throw away a fix taken seconds ago and ask CoreLocation again,
        // which is worse than using it - so this is deliberate, and pinned so
        // the next person can see it was decided rather than overlooked.
        let now = Date()
        XCTAssertTrue(LocationService.isFresh(now.addingTimeInterval(60), now: now))
    }

    // MARK: - Weather proximity

    private func snapshot(lat: Double, lon: Double) -> WeatherService.Snapshot {
        WeatherService.Snapshot(
            temperatureF: 72,
            conditionsRaw: "clear",
            fetchedAt: Date(),
            latitude: lat,
            longitude: lon
        )
    }

    private let desMoines = CLLocationCoordinate2D(latitude: 41.5868, longitude: -93.6250)
    private let chicago = CLLocationCoordinate2D(latitude: 41.8781, longitude: -87.6298)

    func testASnapshotFromTheSamePlaceIsNear() {
        XCTAssertTrue(snapshot(lat: 41.5868, lon: -93.6250).isNear(desMoines))
    }

    func testASnapshotFromAnotherCityIsNot() {
        // The whole bug: with no network this snapshot was returned as the user's
        // current weather.
        XCTAssertFalse(snapshot(lat: 41.5868, lon: -93.6250).isNear(chicago))
    }

    func testTheThresholdIsLooseEnoughForAnotherNeighbourhood() {
        // Weather is city-scale. A stop across town must not force a refetch.
        let acrossTown = CLLocationCoordinate2D(latitude: 41.6100, longitude: -93.6500)
        XCTAssertTrue(snapshot(lat: 41.5868, lon: -93.6250).isNear(acrossTown))
    }

    func testProximityIsCheckedOnBothAxes() {
        // Same latitude, far longitude. A check that ORs the two axes, or only
        // tests one, passes this by accident.
        let sameLatFarLon = CLLocationCoordinate2D(latitude: 41.5868, longitude: -90.0)
        XCTAssertFalse(snapshot(lat: 41.5868, lon: -93.6250).isNear(sameLatFarLon))

        let farLatSameLon = CLLocationCoordinate2D(latitude: 45.0, longitude: -93.6250)
        XCTAssertFalse(snapshot(lat: 41.5868, lon: -93.6250).isNear(farLatSameLon))
    }
}
