import XCTest
@testable import DesMoinesInsider

/// IOS-DD-RESTAURANTS-09: detail refetches the full row, follows a merge,
/// keeps the passed row on failure, and shares a real link.
@MainActor
final class RestaurantDetailViewModelTests: XCTestCase {

    private enum FakeError: Error { case offline }

    private final class FakeDetail: RestaurantDetailProviding, @unchecked Sendable {
        var rows: [String: Restaurant] = [:]
        var error: Error?
        private(set) var requested: [String] = []

        func fetchRestaurant(id: String) async throws -> Restaurant {
            requested.append(id)
            if let error { throw error }
            guard let row = rows[id] else { throw FakeError.offline }
            return row
        }
    }

    private func row(_ id: String, name: String = "Place") -> Restaurant {
        Restaurant(id: id, name: name)
    }

    func testShareURLUsesTheSlugWhenPresent() {
        var r = row("550e8400-e29b-41d4-a716-446655440000")
        r.slug = "zombie-burger-drink-lab"
        let vm = RestaurantDetailViewModel(restaurant: r, service: FakeDetail())
        XCTAssertEqual(vm.shareURL.absoluteString, "https://desmoinesinsider.com/restaurants/zombie-burger-drink-lab")
    }

    func testShareURLFallsBackToTheId() {
        var r = row("550e8400-e29b-41d4-a716-446655440000")
        r.slug = ""
        let vm = RestaurantDetailViewModel(restaurant: r, service: FakeDetail())
        XCTAssertEqual(vm.shareURL.absoluteString, "https://desmoinesinsider.com/restaurants/550e8400-e29b-41d4-a716-446655440000")
    }

    func testShareTextHasNoDanglingSeparatorWithoutALocation() {
        var r = row("r1", name: "Zombie Burger")
        r.cuisine = "American"
        let vm = RestaurantDetailViewModel(restaurant: r, service: FakeDetail())
        XCTAssertFalse(vm.shareText.contains(" - "))
        XCTAssertTrue(vm.shareText.hasPrefix("Zombie Burger (American)"))
    }

    func testLoadSwapsInTheFullRow() async {
        let fake = FakeDetail()
        var full = row("r1")
        full.geoSummary = "From the full row."
        fake.rows["r1"] = full
        let vm = RestaurantDetailViewModel(restaurant: row("r1"), service: fake)

        await vm.load()

        XCTAssertEqual(vm.restaurant.geoSummary, "From the full row.")
    }

    func testAMergedRowIsReplacedByItsSurvivor() async {
        let fake = FakeDetail()
        var merged = row("old")
        merged.isMerged = true
        merged.mergedInto = "new"
        fake.rows["old"] = merged
        fake.rows["new"] = row("new", name: "Survivor")
        let vm = RestaurantDetailViewModel(restaurant: row("old"), service: fake)

        await vm.load()

        XCTAssertEqual(vm.restaurant.id, "new")
        XCTAssertEqual(vm.restaurant.name, "Survivor")
        XCTAssertEqual(fake.requested, ["old", "new"])
    }

    func testAFailedFetchKeepsThePassedRow() async {
        let fake = FakeDetail()
        fake.error = FakeError.offline
        let vm = RestaurantDetailViewModel(restaurant: row("r1", name: "Original"), service: fake)

        await vm.load()

        XCTAssertEqual(vm.restaurant.name, "Original")
    }
}
