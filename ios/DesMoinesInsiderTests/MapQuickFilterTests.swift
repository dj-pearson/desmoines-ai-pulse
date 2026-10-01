import XCTest
import CoreLocation
@testable import DesMoinesInsider

/// IOS-DD-MAP-13: Open now, Walkable and the tonight ring; IOS-DD-MAP-11:
/// implausible coordinates never get a pin.
@MainActor
final class MapQuickFilterTests: XCTestCase {

    private let tuesdayNoon = MapFixtures.central(2026, 9, 29, 12)

    // Optional, built in the body: a default argument is evaluated outside
    // main-actor isolation and FakeMapLocation is @MainActor (Xcode 26).
    private func viewModel(location: FakeMapLocation? = nil) -> MapViewModel {
        let now = tuesdayNoon
        let location = location ?? FakeMapLocation(latitude: MapFixtures.downtownLat, longitude: MapFixtures.downtownLng)
        return MapViewModel(loader: FakeMapLoader(), location: location, now: { now })
    }

    func testOpenNowDropsUnknownHoursAndClosedRestaurants() {
        let vm = viewModel()
        vm.restaurants = [
            MapFixtures.restaurant("open", hours: MapFixtures.dailyHours),
            MapFixtures.restaurant("unknown"),
            MapFixtures.restaurant("closed", hours: MapFixtures.mondayBreakfastHours),
        ]
        XCTAssertEqual(vm.restaurantAnnotations.count, 3)

        vm.openNowOnly = true
        XCTAssertEqual(vm.restaurantAnnotations.map(\.id), ["open"])
        XCTAssertEqual(vm.restaurantsHiddenUnknownHours, 1)
    }

    func testATimeChipCountsUnknownHoursSeparately() {
        let vm = viewModel()
        vm.restaurants = [
            MapFixtures.restaurant("open", hours: MapFixtures.dailyHours),
            MapFixtures.restaurant("unknown"),
        ]
        vm.timeChip = .at8pm
        XCTAssertEqual(vm.restaurantAnnotations.map(\.id), ["open"])
        XCTAssertEqual(vm.restaurantsHiddenUnknownHours, 1)
    }

    func testWalkableKeepsHalfAMileAndDropsAMile() {
        let vm = viewModel()
        vm.attractions = [
            MapFixtures.attraction("half", lat: MapFixtures.downtownLat + 0.5 / 69.0),
            MapFixtures.attraction("one", lat: MapFixtures.downtownLat + 1.0 / 69.0),
        ]
        vm.walkableOnly = true
        XCTAssertEqual(vm.attractionAnnotations.map(\.id), ["half"])
    }

    func testWalkableWithoutAFixShowsNothingNearby() {
        let vm = viewModel(location: FakeMapLocation(status: .denied))
        vm.attractions = [MapFixtures.attraction("a")]
        vm.walkableOnly = true
        XCTAssertTrue(vm.attractionAnnotations.isEmpty)
        XCTAssertFalse(vm.canUseWalkable)
    }

    func testImplausibleCoordinatesGetNoPin() {
        let vm = viewModel()
        vm.attractions = [
            MapFixtures.attraction("downtown"),
            MapFixtures.attraction("null-island", lat: 0, lng: 0),
            MapFixtures.attraction("seattle", lat: 47.4, lng: -122.3),
        ]
        XCTAssertEqual(vm.attractionAnnotations.map(\.id), ["downtown"])
    }

    func testTonightRingIsCentralToday() {
        let now = MapFixtures.central(2026, 9, 29, 23, 30)
        let soon = MapFixtures.event("soon", start: MapFixtures.central(2026, 9, 29, 23, 45))
        let afterMidnight = MapFixtures.event("late", start: MapFixtures.central(2026, 9, 30, 0, 15))
        XCTAssertTrue(EventAnnotation.isTonight(soon, now: now))
        XCTAssertFalse(EventAnnotation.isTonight(afterMidnight, now: now))
    }
}
