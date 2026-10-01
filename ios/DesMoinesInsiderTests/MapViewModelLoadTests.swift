import XCTest
import CoreLocation
@testable import DesMoinesInsider

/// IOS-DD-MAP-04 / 06 / 10 / 15: when the map loads, around what, and what a
/// failure leaves on screen.
@MainActor
final class MapViewModelLoadTests: XCTestCase {

    private func make(
        _ loader: FakeMapLoader,
        // Optional, built in the body: a default argument is evaluated outside
        // main-actor isolation and FakeMapLocation is @MainActor (Xcode 26).
        location: FakeMapLocation? = nil
    ) -> MapViewModel {
        MapViewModel(
            loader: loader,
            location: location ?? FakeMapLocation(latitude: MapFixtures.downtownLat, longitude: MapFixtures.downtownLng)
        )
    }

    private func hasAtMostTwoDecimals(_ value: Double) -> Bool {
        abs(value * 100 - (value * 100).rounded()) < 1e-6
    }

    // MARK: - Reappearance (IOS-DD-MAP-04)

    func testReappearingKeepsASearchAndDoesNotReload() async {
        let loader = FakeMapLoader()
        loader.events = [MapFixtures.event("nearby", start: Date().addingTimeInterval(3600))]
        loader.searchEventResults = [MapFixtures.event("jazz", start: Date().addingTimeInterval(7200))]
        let vm = make(loader)

        await vm.loadIfNeeded()
        XCTAssertEqual(loader.nearbyEventCalls, 1)

        vm.searchText = "jazz"
        await vm.search()
        XCTAssertEqual(vm.events.map(\.id), ["jazz"])

        // Popping a detail view or switching tabs runs .task again.
        await vm.loadIfNeeded()
        XCTAssertEqual(loader.nearbyEventCalls, 1)
        XCTAssertEqual(vm.events.map(\.id), ["jazz"])
        XCTAssertEqual(vm.activeQuery, "jazz")
    }

    func testReappearingWithFreshDataDoesNotReload() async {
        let loader = FakeMapLoader()
        let vm = make(loader)
        await vm.loadIfNeeded()
        await vm.loadIfNeeded()
        XCTAssertEqual(loader.nearbyEventCalls, 1)
    }

    // MARK: - Where it loads (IOS-DD-MAP-06 / 15)

    func testDeniedLocationShowsDowntownWithANotice() async throws {
        let loader = FakeMapLoader()
        let vm = make(loader, location: FakeMapLocation(status: .denied))
        await vm.loadNearbyContent()
        XCTAssertEqual(vm.locationNotice, .denied)
        let origin = try XCTUnwrap(loader.origins.last)
        XCTAssertEqual(origin.latitude, 41.59, accuracy: 1e-9)
        XCTAssertEqual(origin.longitude, -93.63, accuracy: 1e-9)
    }

    func testAFixInOmahaShowsDowntownAndSaysHowFar() async throws {
        let loader = FakeMapLoader()
        let vm = make(loader, location: FakeMapLocation(latitude: 41.2565, longitude: -95.9345))
        await vm.loadNearbyContent()
        guard case .farAway(let miles) = vm.locationNotice else {
            return XCTFail("expected farAway, got \(vm.locationNotice)")
        }
        XCTAssertGreaterThan(miles, 100)
        let origin = try XCTUnwrap(loader.origins.last)
        XCTAssertEqual(origin.latitude, 41.59, accuracy: 1e-9)
        XCTAssertEqual(origin.longitude, -93.63, accuracy: 1e-9)
    }

    func testThePreciseFixIsCoarsenedBeforeItLeaves() async throws {
        let loader = FakeMapLoader()
        let vm = make(loader, location: FakeMapLocation(latitude: 41.58678, longitude: -93.62534))
        await vm.loadNearbyContent()
        XCTAssertEqual(vm.locationNotice, LocationNotice.none)
        let origin = try XCTUnwrap(loader.origins.last)
        XCTAssertTrue(hasAtMostTwoDecimals(origin.latitude), "\(origin.latitude)")
        XCTAssertTrue(hasAtMostTwoDecimals(origin.longitude), "\(origin.longitude)")
        XCTAssertEqual(origin.latitude, 41.59, accuracy: 1e-9)
    }

    func testADismissedNoticeStaysDismissedOnReload() async {
        let loader = FakeMapLoader()
        let vm = make(loader, location: FakeMapLocation(status: .denied))
        await vm.loadNearbyContent()
        vm.dismissLocationNotice()
        await vm.loadNearbyContent()
        XCTAssertEqual(vm.locationNotice, LocationNotice.none)
    }

    // MARK: - Failure (IOS-DD-MAP-10)

    func testGoingOfflineKeepsWhatWasOnTheMap() async {
        let loader = FakeMapLoader()
        loader.events = [MapFixtures.event("e1", start: Date().addingTimeInterval(3600))]
        let vm = make(loader)
        await vm.loadNearbyContent()
        XCTAssertEqual(vm.events.map(\.id), ["e1"])

        loader.error = URLError(.notConnectedToInternet)
        await vm.retry()
        XCTAssertEqual(vm.events.map(\.id), ["e1"])
        XCTAssertEqual(vm.overlay, .offline)
    }

    func testOneKindFailingKeepsItsOldRowsAndIsPartial() async {
        let failing = FailingRestaurantsLoader(base: FakeMapLoader())
        let vm = MapViewModel(
            loader: failing,
            location: FakeMapLocation(latitude: MapFixtures.downtownLat, longitude: MapFixtures.downtownLng)
        )
        vm.restaurants = [MapFixtures.restaurant("kept")]
        await vm.loadNearbyContent()
        XCTAssertEqual(vm.restaurants.map(\.id), ["kept"])
        XCTAssertEqual(vm.overlay, .partial(failedKinds: [.restaurant]))
    }

    func testRetryAfterAnEmptySearchRepeatsTheSearch() async {
        let loader = FakeMapLoader()
        let vm = make(loader)
        await vm.loadNearbyContent()
        vm.searchText = "zzz"
        await vm.search()
        XCTAssertEqual(vm.overlay, .noResults(query: "zzz"))

        await vm.retry()
        XCTAssertEqual(loader.searchEventCalls, 2)
        XCTAssertEqual(loader.nearbyEventCalls, 1)
    }

    func testClearingTheSearchReloadsNearby() async {
        let loader = FakeMapLoader()
        let vm = make(loader)
        await vm.loadNearbyContent()
        vm.searchText = "zzz"
        await vm.search()
        await vm.clearSearch()
        XCTAssertNil(vm.activeQuery)
        XCTAssertEqual(loader.nearbyEventCalls, 2)
    }

    func testAWideRegionAsksToZoomInInsteadOfLoading() async {
        let loader = FakeMapLoader()
        let vm = make(loader)
        await vm.loadNearbyContent()
        await vm.loadRegion(.init(
            center: CLLocationCoordinate2D(latitude: 41.6, longitude: -93.6),
            span: .init(latitudeDelta: 2, longitudeDelta: 2)
        ))
        XCTAssertEqual(loader.nearbyEventCalls, 1)
        XCTAssertEqual(vm.overlay, .zoomIn)
    }
}

/// Delegates to a FakeMapLoader but always fails restaurants.
@MainActor
private final class FailingRestaurantsLoader: MapContentLoading {
    let base: FakeMapLoader
    init(base: FakeMapLoader) { self.base = base }

    func nearbyEvents(lat: Double, lng: Double, radiusMiles: Double, until: Date?) async throws -> [Event] {
        try await base.nearbyEvents(lat: lat, lng: lng, radiusMiles: radiusMiles, until: until)
    }
    func nearbyRestaurants(lat: Double, lng: Double, radiusMiles: Double) async throws -> [Restaurant] {
        throw URLError(.timedOut)
    }
    func nearbyAttractions(lat: Double, lng: Double, radiusMiles: Double) async throws -> [Attraction] {
        try await base.nearbyAttractions(lat: lat, lng: lng, radiusMiles: radiusMiles)
    }
    func searchEvents(_ query: String) async throws -> [Event] { try await base.searchEvents(query) }
    func searchRestaurants(_ query: String) async throws -> [Restaurant] { throw URLError(.timedOut) }
    func searchAttractions(_ query: String) async throws -> [Attraction] { try await base.searchAttractions(query) }
}
