import XCTest
@testable import DesMoinesInsider

/// IOS-DD-MAP-02: which restaurants get a pin. Unknown hours used to count as
/// open (`isOpenNow ?? true`), so every restaurant was "open" at every time.
final class MapRestaurantFilterTests: XCTestCase {

    private let tuesdayNoon = MapFixtures.central(2026, 9, 29, 12)

    func testPermanentlyClosedNeverGetsAPin() {
        let r = MapFixtures.restaurant("r", hours: MapFixtures.dailyHours, businessStatus: "CLOSED_PERMANENTLY")
        XCTAssertFalse(MapViewModel.restaurantMatches(r, at: nil))
        XCTAssertFalse(MapViewModel.restaurantMatches(r, at: tuesdayNoon))
    }

    func testUnknownHoursAreHiddenWhenATimeIsSet() {
        XCTAssertFalse(MapViewModel.restaurantMatches(MapFixtures.restaurant("r"), at: tuesdayNoon))
    }

    func testUnknownHoursAreShownWithNoTime() {
        XCTAssertTrue(MapViewModel.restaurantMatches(MapFixtures.restaurant("r"), at: nil))
    }

    func testKnownOpenIsShown() {
        XCTAssertTrue(MapViewModel.restaurantMatches(MapFixtures.restaurant("r", hours: MapFixtures.dailyHours), at: tuesdayNoon))
    }

    func testKnownClosedIsHidden() {
        let r = MapFixtures.restaurant("r", hours: MapFixtures.mondayBreakfastHours)
        XCTAssertFalse(MapViewModel.restaurantMatches(r, at: tuesdayNoon))
    }
}
