import XCTest
@testable import DesMoinesInsider

/// IOS-DD-BROWSE-17 / 18: neighborhoods are matched server-side by
/// LocationArea, and a failed load is told apart from an empty area.
final class NeighborhoodTests: XCTestCase {

    func testEverySlugIsUniqueAndHasAnArea() {
        let slugs = Neighborhood.all.map(\.slug)
        XCTAssertEqual(Set(slugs).count, slugs.count)
        XCTAssertEqual(Set(Neighborhood.all.map(\.area)).count, Neighborhood.all.count, "one area per neighborhood")
    }

    func testNewDistrictsMapToTheirBoxes() {
        XCTAssertEqual(Neighborhood.bySlug("valley-junction")?.area, .valleyJunction)
        XCTAssertEqual(Neighborhood.bySlug("downtown")?.area, .downtown)
        XCTAssertEqual(Neighborhood.bySlug("ingersoll")?.area, .ingersoll)
        XCTAssertEqual(Neighborhood.bySlug("east-village")?.area, .eastVillage)
        XCTAssertNil(Neighborhood.bySlug("nope"))
    }

    func testCityAreaMatchesAddressAndLocationWithoutACityColumn() {
        let filter = AttractionsService.attractionAreaFilter(.urbandale)
        XCTAssertTrue(filter.contains(#"address.ilike."%, Urbandale""#), filter)
        XCTAssertTrue(filter.contains(#"location.ilike."%, Urbandale, IA%""#), filter)
        XCTAssertFalse(filter.contains("city."), "attractions has no city column")
    }

    func testDistrictUsesTheBoundingBox() {
        XCTAssertTrue(AttractionsService.attractionAreaFilter(.eastVillage).contains("latitude.gte.41.583"))
    }

    func testDesMoinesIsCommaAnchoredSoWestDesMoinesIsNotIncluded() {
        // Split on the operator, not on commas: the quoted patterns hold commas.
        let patterns = AttractionsService.attractionAreaFilter(.desMoines)
            .components(separatedBy: ".ilike.\"").dropFirst()
        XCTAssertEqual(patterns.count, 6)
        for pattern in patterns {
            XCTAssertTrue(pattern.hasPrefix("%, Des Moines"), pattern)
        }
    }

    // MARK: combinedError

    func testCombinedErrorOnlyWhenEverySectionFailed() {
        let failure: Result<Int, Error> = .failure(URLError(.timedOut))
        XCTAssertNotNil(NeighborhoodViewModel.combinedError([failure, failure, failure]))
        XCTAssertNil(NeighborhoodViewModel.combinedError([failure, .success(0), failure]))
    }

    func testCancellationIsNotAnError() {
        let cancelled: Result<Int, Error> = .failure(CancellationError())
        XCTAssertNil(NeighborhoodViewModel.combinedError([cancelled, cancelled, cancelled]))
    }
}
