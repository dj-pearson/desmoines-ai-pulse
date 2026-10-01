import XCTest
@testable import DesMoinesInsider

/// IOS-DD-RESTAURANTS-07: presets match the web's, drop cuisines that have no
/// rows, and stop being "active" once a filter they set is edited.
@MainActor
final class RestaurantPresetTests: XCTestCase {

    // MARK: - availableRestaurantPresets parity

    func testCuisinePresetsKeepOnlyCuisinesThatExist() {
        let available = RestaurantPreset.available(cuisines: ["American", "Cafe"])
        let brunch = available.first { $0.preset == .brunch }
        XCTAssertEqual(brunch?.cuisines, ["Cafe"])
        XCTAssertNil(available.first { $0.preset == .healthy })
        XCTAssertNotNil(available.first { $0.preset == .dateNight })
    }

    func testCuisinePresetsWaitForTheFacet() {
        let presets = RestaurantPreset.available(cuisines: []).map { $0.preset }
        XCTAssertFalse(presets.contains(.brunch))
        XCTAssertFalse(presets.contains(.healthy))
        XCTAssertTrue(presets.contains(.openNow))
        XCTAssertTrue(presets.contains(.newOpenings))
    }

    // MARK: - View model

    private func viewModel() -> RestaurantsViewModel {
        let fake = FakeRestaurantFeed { _ in .success(FakeRestaurantFeed.page(0..<3, total: 3, hasMore: false)) }
        return RestaurantsViewModel(service: fake)
    }

    func testEditingAPresetFilterClearsThePresetAndReapplyingRestoresIt() {
        let vm = viewModel()
        vm.applyPreset(.dateNight)
        XCTAssertEqual(vm.activePreset, .dateNight)

        vm.selectedPriceRanges.remove("$$$")
        XCTAssertNil(vm.activePreset)

        vm.applyPreset(.dateNight)
        XCTAssertEqual(vm.activePreset, .dateNight)
        XCTAssertEqual(vm.selectedPriceRanges, ["$$$", "$$$$"])
        XCTAssertEqual(vm.minRating, 4.0)
    }

    func testTappingTheActivePresetAgainClears() {
        let vm = viewModel()
        vm.applyPreset(.casual)
        XCTAssertEqual(vm.selectedPriceRanges, ["$", "$$"])
        vm.applyPreset(.casual)
        XCTAssertNil(vm.activePreset)
        XCTAssertTrue(vm.selectedPriceRanges.isEmpty)
    }

    func testNewOpeningsPresetSetsItsFilter() {
        let vm = viewModel()
        vm.applyPreset(.newOpenings)
        XCTAssertTrue(vm.newOpeningsOnly)
        XCTAssertEqual(vm.activeFilterCount, 1)
        vm.clearFilters()
        XCTAssertFalse(vm.newOpeningsOnly)
    }

    func testOpenNowToggleClearsThePreset() {
        let vm = viewModel()
        vm.applyPreset(.openNow)
        XCTAssertTrue(vm.showOpenNowOnly)
        vm.showOpenNowOnly = false
        XCTAssertNil(vm.activePreset)
    }

    // MARK: - Query path

    func testStatusesForceTheTablePath() {
        var q = RestaurantsService.RestaurantsQuery()
        q.statuses = RestaurantsViewModel.newOpeningStatuses
        XCTAssertFalse(RestaurantsService.usesRotationRPC(q))
    }
}
